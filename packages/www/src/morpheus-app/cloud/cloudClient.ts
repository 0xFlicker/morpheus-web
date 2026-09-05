import { z } from 'zod';
import {
  cloudCatalogSchema,
  cloudWriteResultSchema,
  reconcileCloudSlot,
  type CloudSave,
  type CloudSlot,
  type CloudWrite,
} from '@/lib/cloud/protocol';
import {
  LIVING_SAVE_SLOT_IDS,
  type LivingSaveSlotId,
} from '@/morpheus-app/storage/livingSaveTypes';
import {
  acknowledgeCloudSlot,
  applyCloudDownload,
  bindCloudPlayer,
  clearRejectedCloudWrite,
  prepareCloudWrite,
  readCloudLocalSnapshot,
  resolveGuestSave,
  resolveLocalSaveCandidate,
  type CloudLocalSnapshot,
} from './cloudStorage';

import { cloudViewKey } from './localMetadata';

const playerSchema = z.object({
  protocolVersion: z.literal(1),
  playerId: z.uuid(),
  authenticated: z.boolean(),
  associatedAnonymousPlayerId: z.uuid().nullable().optional(),
});
export type CloudConflict = {
  slotId: LivingSaveSlotId;
  localRevision: number;
} & (
  | { kind: 'remote'; remote: CloudSlot }
  | { kind: 'guest'; guest: CloudSave }
  | {
      kind: 'local';
      candidateId: string;
      writerId: string;
      candidate: CloudSave;
    }
);
/** These durable versions remain actionable without an online account. */
export function localCloudConflicts(
  snapshot: CloudLocalSnapshot,
): CloudConflict[] {
  return LIVING_SAVE_SLOT_IDS.flatMap((slotId) => {
    const slot = snapshot.metadata.slots[slotId];
    const localRevision = snapshot.catalog.slots[slotId].revision;
    const candidates: CloudConflict[] = slot.localCandidates.map(
      (candidate) => ({
        kind: 'local',
        slotId,
        localRevision,
        candidateId: candidate.candidateId,
        writerId: candidate.writerId,
        candidate: candidate.save,
      }),
    );
    if (candidates.length === 0 && slot.guestSave)
      candidates.push({
        kind: 'guest',
        slotId,
        localRevision,
        guest: slot.guestSave,
      });
    return candidates;
  });
}

export type CloudClientState = {
  status: 'local' | 'connecting' | 'ready' | 'offline';
  conflicts: CloudConflict[];
  snapshot: CloudLocalSnapshot | null;
};
export type CloudClient = {
  sync: () => Promise<void>;
  resolve: (
    conflict: CloudConflict,
    choice: 'local' | 'remote',
  ) => Promise<void>;
  pause: () => void;
  stop: () => void;
};

export function createCloudClient(options: {
  identityKey: string;
  sessionId: string;
  isCurrent: () => boolean;
  isIdentityCurrent: () => boolean;
  canApply: (snapshot: CloudLocalSnapshot, resolvingLocal?: boolean) => boolean;
  onCatalog: (
    snapshot: CloudLocalSnapshot,
    resolvingLocal?: boolean,
  ) => Promise<void>;
  onState: (state: CloudClientState) => void;
}): CloudClient {
  let stopped = false;
  let running: Promise<void> | null = null;
  let queued = false;
  let controller: AbortController | null = null;
  let requestPlayerId: string | null = null;
  let registeredPlayer: z.infer<typeof playerSchema> | null = null;
  let lastSessionAt = 0;
  let lastSessionRun = '';
  const identityCurrent = () => !stopped && options.isIdentityCurrent();
  const current = () => identityCurrent() && options.isCurrent();
  const request = async (path: string, body?: unknown, method = 'POST') => {
    if (!current()) throw new Error('Account changed.');
    const local = await readCloudLocalSnapshot();
    if (
      !current() ||
      local.metadata.identityKey !== options.identityKey ||
      !local.metadata.onlineServicesEnabled
    )
      throw new Error('Online services are stopped.');
    controller = new AbortController();
    const requestController = controller;
    const timeout = setTimeout(() => requestController.abort(), 15_000);
    try {
      const response = await fetch(path, {
        method: body === undefined ? 'GET' : method,
        credentials: 'same-origin',
        cache: 'no-store',
        headers: {
          'x-morpheus-identity': options.identityKey,
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
          ...(requestPlayerId
            ? { 'x-morpheus-player-id': requestPlayerId }
            : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: requestController.signal,
      });
      if (!current()) throw new Error('Account changed.');
      if (!response.ok && response.status !== 409)
        throw new Error(`Save connection failed (${response.status}).`);
      return (await response.json()) as unknown;
    } finally {
      clearTimeout(timeout);
    }
  };
  const send = async (pending: CloudWrite, playerId: string) => {
    const result = cloudWriteResultSchema.parse(
      await request('/api/cloud/saves', pending, 'PUT'),
    );
    if (!current()) return false;
    if (result.status === 'saved') {
      return acknowledgeCloudSlot({
        identityKey: options.identityKey,
        playerId,
        remote: result.slot,
        mutationId: pending.mutationId,
      });
    }
    await clearRejectedCloudWrite(options.identityKey, pending.mutationId);
    // Re-read remote state after a conflict, including resolution races.
    queued = true;
    return false;
  };
  const reconcile = async () => {
    let snapshot = await readCloudLocalSnapshot();
    if (!current() || snapshot.metadata.identityKey !== options.identityKey)
      return;
    if (!snapshot.metadata.onlineServicesEnabled) {
      options.onState({
        status: 'local',
        conflicts: localCloudConflicts(snapshot),
        snapshot,
      });
      return;
    }
    const registration = {
      platform: 'web',
      deviceId: snapshot.metadata.deviceId,
      sessionId: options.sessionId,
      appVersion: 'web-cloud-1',
    };
    if (registeredPlayer === null) {
      requestPlayerId = null;
      registeredPlayer = playerSchema.parse(
        await request('/api/cloud/player', registration),
      );
      lastSessionAt = Date.now();
    }
    const player = registeredPlayer;
    if (!current()) return;
    requestPlayerId = player.playerId;
    if (
      !(await bindCloudPlayer(
        options.identityKey,
        player.playerId,
        player.associatedAnonymousPlayerId ?? null,
      ))
    )
      return;
    const catalog = cloudCatalogSchema.parse(await request('/api/cloud/saves'));
    if (!current() || catalog.playerId !== player.playerId) return;
    snapshot = await readCloudLocalSnapshot();
    const conflicts: CloudConflict[] = [];
    for (const slotId of LIVING_SAVE_SLOT_IDS) {
      if (!current()) return;
      snapshot = await readCloudLocalSnapshot();
      if (
        snapshot.metadata.identityKey !== options.identityKey ||
        snapshot.metadata.playerId !== player.playerId
      )
        return;
      const localSlot = snapshot.catalog.slots[slotId];
      if (localSlot.kind === 'unloadable') continue;
      const metadata = snapshot.metadata.slots[slotId];
      const remote = catalog.slots.find((slot) => slot.slotId === slotId);
      if (!remote) throw new Error('The save catalog is incomplete.');
      const localConflicts = localCloudConflicts(snapshot).filter(
        (conflict) => conflict.slotId === slotId,
      );
      if (localConflicts.length > 0) {
        conflicts.push(...localConflicts);
        continue;
      }
      if (metadata.pending) {
        if (await send(metadata.pending, player.playerId)) queued = true;
        continue;
      }
      let decision = reconcileCloudSlot({
        local: metadata.save,
        remote,
        acknowledgedProgress: metadata.acknowledgedProgress,
        acknowledgedRevision: metadata.acknowledgedRevision,
      });
      if (decision === 'unchanged') {
        const localView = cloudViewKey(metadata.save);
        const remoteView = cloudViewKey(remote.save);
        if (localView !== remoteView) {
          // Local or simultaneous camera edits keep this device's view quietly.
          decision =
            localView === metadata.acknowledgedView ? 'download' : 'upload';
        }
      }
      if (decision === 'conflict') {
        conflicts.push({
          kind: 'remote',
          slotId,
          localRevision: localSlot.revision,
          remote,
        });
      } else if (decision === 'upload') {
        const pending = await prepareCloudWrite({
          identityKey: options.identityKey,
          playerId: player.playerId,
          slotId,
          localRevision: localSlot.revision,
          expectedRevision: remote.revision,
        });
        if (pending && (await send(pending, player.playerId))) queued = true;
      } else if (decision === 'download') {
        if (!options.canApply(snapshot)) continue;
        const downloaded = await applyCloudDownload({
          identityKey: options.identityKey,
          playerId: player.playerId,
          localRevision: localSlot.revision,
          remote,
        });
        if (downloaded && current()) await options.onCatalog(downloaded);
      } else {
        await acknowledgeCloudSlot({
          identityKey: options.identityKey,
          playerId: player.playerId,
          remote,
        });
      }
    }
    snapshot = await readCloudLocalSnapshot();
    if (!current()) return;
    if (options.canApply(snapshot)) await options.onCatalog(snapshot);
    const durableConflicts = localCloudConflicts(snapshot);
    options.onState({
      status: 'ready',
      conflicts: [
        ...durableConflicts,
        ...conflicts.filter(
          (conflict) =>
            conflict.kind === 'remote' &&
            conflict.localRevision ===
              snapshot.catalog.slots[conflict.slotId].revision &&
            !durableConflicts.some((local) => local.slotId === conflict.slotId),
        ),
      ],
      snapshot,
    });
    const active = snapshot.catalog.activeSlotId;
    const save = active ? snapshot.metadata.slots[active].save : null;
    if (
      Date.now() - lastSessionAt >= 15_000 ||
      lastSessionRun !== (save?.runId ?? '')
    ) {
      await request('/api/cloud/session', {
        ...registration,
        ...(save
          ? {
              activeRunId: save.runId,
              activeSceneId: save.envelope.activeSceneId,
            }
          : {}),
      });
      lastSessionAt = Date.now();
      lastSessionRun = save?.runId ?? '';
    }
  };
  const withLock = async (work: () => Promise<void>) => {
    // Web Locks serialize tabs; IndexedDB CAS also fences every local mutation.
    if (!navigator.locks)
      throw new Error(
        'This browser cannot coordinate background saves safely.',
      );
    await navigator.locks.request('morpheus-cloud-sync', work);
  };
  const sync = (): Promise<void> => {
    if (!current()) return Promise.resolve();
    if (running) {
      queued = true;
      return running;
    }
    running = withLock(async () => {
      do {
        queued = false;
        if (current()) await reconcile();
      } while (queued && current());
    })
      .catch(async () => {
        registeredPlayer = null;
        if (!current()) return;
        const snapshot = await readCloudLocalSnapshot().catch(() => null);
        if (current())
          options.onState({
            status: 'offline',
            conflicts: snapshot ? localCloudConflicts(snapshot) : [],
            snapshot,
          });
      })
      .finally(() => {
        running = null;
      });
    return running;
  };
  const resolve: CloudClient['resolve'] = async (conflict, choice) => {
    if (running) await running;
    if (!identityCurrent()) return;
    const resolveVersion = async () => {
      const snapshot = await readCloudLocalSnapshot();
      if (
        !identityCurrent() ||
        snapshot.metadata.identityKey !== options.identityKey
      )
        return;
      if (
        snapshot.catalog.slots[conflict.slotId].revision !==
        conflict.localRevision
      )
        return;
      if (conflict.kind === 'local' || conflict.kind === 'guest') {
        if (!options.canApply(snapshot, true)) return;
        const resolved =
          conflict.kind === 'local'
            ? await resolveLocalSaveCandidate({
                identityKey: options.identityKey,
                slotId: conflict.slotId,
                localRevision: conflict.localRevision,
                candidateId: conflict.candidateId,
                keepCandidate: choice === 'remote',
              })
            : await resolveGuestSave({
                identityKey: options.identityKey,
                slotId: conflict.slotId,
                localRevision: conflict.localRevision,
                keepGuest: choice === 'remote',
              });
        if (resolved && identityCurrent()) {
          await options.onCatalog(resolved, true);
          options.onState({
            status: 'local',
            conflicts: localCloudConflicts(resolved),
            snapshot: resolved,
          });
        }
        return;
      }
      const playerId = snapshot.metadata.playerId;
      if (
        !current() ||
        !playerId ||
        snapshot.metadata.slots[conflict.slotId].localCandidates.length > 0
      )
        return;
      if (choice === 'local') {
        const pending = await prepareCloudWrite({
          identityKey: options.identityKey,
          playerId,
          slotId: conflict.slotId,
          localRevision: conflict.localRevision,
          expectedRevision: conflict.remote.revision,
        });
        if (pending) await send(pending, playerId);
      } else if (options.canApply(snapshot)) {
        // The displayed remote revision must still exist at the moment of choice.
        const catalog = cloudCatalogSchema.parse(
          await request('/api/cloud/saves'),
        );
        const latest = catalog.slots.find(
          (slot) => slot.slotId === conflict.slotId,
        );
        if (
          !current() ||
          catalog.playerId !== playerId ||
          latest?.revision !== conflict.remote.revision
        )
          return;
        const downloaded = await applyCloudDownload({
          identityKey: options.identityKey,
          playerId,
          localRevision: conflict.localRevision,
          remote: latest,
        });
        if (downloaded && current()) await options.onCatalog(downloaded);
      }
    };
    // Local candidate CAS is sufficient offline, including browsers without Web Locks.
    if (conflict.kind === 'remote') await withLock(resolveVersion);
    else await resolveVersion();
    if (current()) await sync();
    else if (identityCurrent()) {
      const snapshot = await readCloudLocalSnapshot();
      if (
        identityCurrent() &&
        snapshot.metadata.identityKey === options.identityKey
      )
        options.onState({
          status: 'local',
          conflicts: localCloudConflicts(snapshot),
          snapshot,
        });
    }
  };
  return {
    sync,
    resolve,
    pause: () => {
      registeredPlayer = null;
      controller?.abort();
    },
    stop: () => {
      stopped = true;
      controller?.abort();
    },
  };
}
