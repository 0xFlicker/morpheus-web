import {
  cloudProgressKey,
  type CloudSlot,
  type CloudWrite,
} from '@/lib/cloud/protocol';
import {
  classifyCatalog,
  createEmptyRawCatalog,
  LIVING_SAVE_CATALOG_KEY,
  LIVING_SAVE_STORE_NAME,
  openLivingSaveDatabase,
  parseRawCatalog,
} from '@/morpheus-app/storage/livingSaveStorage';
import type {
  LivingSaveCatalog,
  LivingSaveSlotId,
  RawLivingSaveCatalog,
} from '@/morpheus-app/storage/livingSaveTypes';
import {
  CLOUD_LOCAL_CHANGE_EVENT,
  CLOUD_LOCAL_METADATA_KEY,
  cloudLocalMetadataSchema,
  cloudViewKey,
  createCloudLocalMetadata,
  updateCloudLocalMetadata,
  type CloudLocalMetadata,
} from './localMetadata';

export type CloudLocalSnapshot = {
  catalog: LivingSaveCatalog;
  metadata: CloudLocalMetadata;
};
type StoredSnapshot = {
  catalog: RawLivingSaveCatalog;
  metadata: CloudLocalMetadata;
};

/** All cloud acknowledgments and downloads share the local save transaction lock. */
async function transaction<T>(
  operate: (
    snapshot: StoredSnapshot,
    store: IDBObjectStore,
    finish: (value: T) => void,
    needsInitialization: boolean,
  ) => void,
  mode: IDBTransactionMode = 'readwrite',
): Promise<T> {
  const database = await openLivingSaveDatabase();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(LIVING_SAVE_STORE_NAME, mode);
    const store = tx.objectStore(LIVING_SAVE_STORE_NAME);
    const catalogRequest = store.get(LIVING_SAVE_CATALOG_KEY);
    const metadataRequest = store.get(CLOUD_LOCAL_METADATA_KEY);
    let completed = false;
    let result: T;
    let failure: unknown;
    metadataRequest.onsuccess = () => {
      try {
        const catalog =
          catalogRequest.result === undefined
            ? createEmptyRawCatalog()
            : parseRawCatalog(catalogRequest.result);
        if (!catalog) throw new Error('The local save catalog is malformed.');
        const parsed = cloudLocalMetadataSchema.safeParse(
          metadataRequest.result,
        );
        if (metadataRequest.result !== undefined && !parsed.success)
          throw new Error('The local save connection data is malformed.');
        const metadata = updateCloudLocalMetadata(
          parsed.success ? parsed.data : createCloudLocalMetadata(),
          catalog,
          catalog,
          'imported',
        );
        operate(
          { catalog, metadata },
          store,
          (value) => {
            result = value;
            completed = true;
          },
          !parsed.success || metadata !== parsed.data,
        );
      } catch (error) {
        failure = error;
        tx.abort();
      }
    };
    tx.oncomplete = () => {
      database.close();
      if (completed) resolve(result);
      else reject(new Error('Save connection transaction returned no result.'));
    };
    tx.onabort = tx.onerror = () => {
      database.close();
      reject(
        failure ??
          tx.error ??
          new Error('Save connection storage is unavailable.'),
      );
    };
  });
}

function persist(store: IDBObjectStore, snapshot: StoredSnapshot) {
  store.put(snapshot.catalog, LIVING_SAVE_CATALOG_KEY);
  store.put(snapshot.metadata, CLOUD_LOCAL_METADATA_KEY);
}
function publicSnapshot(snapshot: StoredSnapshot): CloudLocalSnapshot {
  return {
    catalog: classifyCatalog(snapshot.catalog),
    metadata: snapshot.metadata,
  };
}

export async function readCloudLocalSnapshot(): Promise<CloudLocalSnapshot> {
  const read = await transaction<{
    snapshot: CloudLocalSnapshot;
    needsInitialization: boolean;
  }>((snapshot, _store, finish, needsInitialization) => {
    finish({ snapshot: publicSnapshot(snapshot), needsInitialization });
  }, 'readonly');
  if (!read.needsInitialization) return read.snapshot;
  // Initialize once under the write lock; a concurrent reader may have done it first.
  return transaction((snapshot, store, finish, needsInitialization) => {
    if (needsInitialization)
      store.put(snapshot.metadata, CLOUD_LOCAL_METADATA_KEY);
    finish(publicSnapshot(snapshot));
  });
}

/** Separate local catalogs prevent sign-out or another account uploading the former player's saves. */
export function switchCloudLocalIdentity(
  identityKey: string,
  guard?: { expectedIdentityKey: string | null; isCurrent: () => boolean },
): Promise<CloudLocalSnapshot> {
  return transaction((snapshot, store, finish) => {
    if (
      guard &&
      (!guard.isCurrent() ||
        snapshot.metadata.identityKey !== guard.expectedIdentityKey)
    )
      throw new Error(
        'The local account changed before its journey could be closed. Please try again.',
      );
    if (
      snapshot.metadata.identityKey === identityKey ||
      snapshot.metadata.identityKey === null
    ) {
      if (snapshot.metadata.identityKey !== identityKey) {
        snapshot.metadata.identityKey = identityKey;
        store.put(snapshot.metadata, CLOUD_LOCAL_METADATA_KEY);
      }
      finish(publicSnapshot(snapshot));
      return;
    }
    const archiveKey = (identity: string) => `cloud-identity:${identity}`;
    store.put(snapshot, archiveKey(snapshot.metadata.identityKey));
    const archiveRequest = store.get(archiveKey(identityKey));
    archiveRequest.onsuccess = () => {
      if (guard && !guard.isCurrent()) {
        store.transaction.abort();
        return;
      }
      const value: unknown = archiveRequest.result;
      let next: StoredSnapshot;
      if (value === undefined) {
        next = {
          catalog: createEmptyRawCatalog(),
          metadata: createCloudLocalMetadata(),
        };
        next.metadata.deviceId = snapshot.metadata.deviceId;
      } else if (
        typeof value === 'object' &&
        value !== null &&
        'catalog' in value &&
        'metadata' in value
      ) {
        const catalog = parseRawCatalog(value.catalog);
        const parsed = cloudLocalMetadataSchema.safeParse(value.metadata);
        if (!catalog || !parsed.success) {
          store.transaction.abort();
          return;
        }
        next = { catalog, metadata: parsed.data };
      } else {
        store.transaction.abort();
        return;
      }
      // Catalog revision is also a CAS fence for a checkpoint from the old runtime/tab.
      next.catalog.revision =
        Math.max(next.catalog.revision, snapshot.catalog.revision) + 1;
      next.metadata.identityKey = identityKey;
      next.metadata.noticeAcknowledgedAt =
        snapshot.metadata.noticeAcknowledgedAt;
      next.metadata.onlineServicesEnabled =
        snapshot.metadata.onlineServicesEnabled;
      persist(store, next);
      finish(publicSnapshot(next));
    };
  });
}

export function bindCloudPlayer(
  identityKey: string,
  playerId: string,
  associatedAnonymousPlayerId: string | null = null,
): Promise<boolean> {
  return transaction((snapshot, store, finish) => {
    if (snapshot.metadata.identityKey !== identityKey) {
      finish(false);
      return;
    }
    if (
      snapshot.metadata.playerId !== null &&
      snapshot.metadata.playerId !== playerId
    ) {
      // Server account association may change the player ID. Its revisions are a new namespace.
      for (const slot of Object.values(snapshot.metadata.slots)) {
        slot.acknowledgedRevision = null;
        slot.acknowledgedProgress = null;
        slot.acknowledgedView = null;
        slot.pending = null;
      }
    }
    let bindingChanged = snapshot.metadata.playerId !== playerId;
    const finishBinding = () => {
      snapshot.metadata.playerId = playerId;
      if (bindingChanged) persist(store, snapshot);
      finish(true);
    };
    if (identityKey !== 'anonymous') {
      const request = store.get('cloud-identity:anonymous');
      request.onsuccess = () => {
        const value: unknown = request.result;
        if (
          typeof value === 'object' &&
          value !== null &&
          'catalog' in value &&
          'metadata' in value
        ) {
          const guestCatalog = parseRawCatalog(value.catalog);
          const guestMetadata = cloudLocalMetadataSchema.safeParse(
            value.metadata,
          );
          if (
            guestCatalog &&
            guestMetadata.success &&
            (guestMetadata.data.playerId === null ||
              guestMetadata.data.playerId === associatedAnonymousPlayerId)
          ) {
            let adopted = false;
            for (const slotId of ['slot-1', 'slot-2', 'slot-3'] as const) {
              const target = snapshot.metadata.slots[slotId];
              const guest = guestMetadata.data.slots[slotId];
              if (
                target.localCandidates.length === 0 &&
                target.guestSave === null &&
                (guest.save !== null || guest.localCandidates.length > 0) &&
                (snapshot.catalog.slots[slotId].payload === null ||
                  guest.localCandidates.length > 0 ||
                  cloudProgressKey(guest.save) !== guest.acknowledgedProgress)
              ) {
                if (snapshot.catalog.slots[slotId].payload !== null) {
                  target.guestSave = guest.save;
                  target.localCandidates = guest.localCandidates;
                } else {
                  snapshot.catalog.slots[slotId] = {
                    ...guestCatalog.slots[slotId],
                    revision: snapshot.catalog.slots[slotId].revision + 1,
                  };
                  snapshot.metadata.slots[slotId] = {
                    ...guestMetadata.data.slots[slotId],
                    acknowledgedRevision: null,
                    acknowledgedProgress: null,
                    acknowledgedView: null,
                    pending: null,
                  };
                }
                guestCatalog.slots[slotId] = {
                  revision: guestCatalog.slots[slotId].revision + 1,
                  payload: null,
                };
                guestMetadata.data.slots[slotId] = {
                  save: null,
                  deletedSave: null,
                  guestSave: null,
                  localCandidates: [],
                  pending: null,
                  acknowledgedRevision: null,
                  acknowledgedProgress: null,
                  acknowledgedView: null,
                };
                adopted = true;
              }
            }
            if (adopted) {
              bindingChanged = true;
              snapshot.catalog.revision += 1;
              guestCatalog.revision += 1;
              store.put(
                { catalog: guestCatalog, metadata: guestMetadata.data },
                'cloud-identity:anonymous',
              );
            }
          }
        }
        finishBinding();
      };
      return;
    }
    finishBinding();
  });
}

export function prepareCloudWrite(params: {
  identityKey: string;
  playerId: string;
  slotId: LivingSaveSlotId;
  localRevision: number;
  expectedRevision: number;
}): Promise<CloudWrite | null> {
  return transaction((snapshot, store, finish) => {
    const { metadata, catalog } = snapshot;
    if (
      metadata.identityKey !== params.identityKey ||
      metadata.playerId !== params.playerId ||
      catalog.slots[params.slotId].revision !== params.localRevision ||
      metadata.slots[params.slotId].localCandidates.length > 0 ||
      metadata.slots[params.slotId].guestSave !== null
    ) {
      finish(null);
      return;
    }
    const slot = metadata.slots[params.slotId];
    const pending: CloudWrite = slot.pending ?? {
      protocolVersion: 1,
      slotId: params.slotId,
      expectedRevision: params.expectedRevision,
      mutationId: crypto.randomUUID(),
      deviceId: metadata.deviceId,
      save: slot.save,
    };
    if (slot.pending === null) {
      slot.pending = pending;
      store.put(metadata, CLOUD_LOCAL_METADATA_KEY);
    }
    finish(pending);
  });
}

/** An ACK only clears its own request; a newer local checkpoint remains dirty. */
export function acknowledgeCloudSlot(params: {
  identityKey: string;
  playerId: string;
  remote: CloudSlot;
  mutationId?: string;
}): Promise<boolean> {
  return transaction((snapshot, store, finish) => {
    const { metadata } = snapshot;
    if (
      metadata.identityKey !== params.identityKey ||
      metadata.playerId !== params.playerId
    ) {
      finish(false);
      return;
    }
    const slot = metadata.slots[params.remote.slotId];
    if (params.mutationId && slot.pending?.mutationId !== params.mutationId) {
      finish(false);
      return;
    }
    if ((slot.acknowledgedRevision ?? 0) > params.remote.revision) {
      finish(false);
      return;
    }
    const progress = cloudProgressKey(params.remote.save);
    const view = cloudViewKey(params.remote.save);
    if (
      !params.mutationId &&
      slot.acknowledgedRevision === params.remote.revision &&
      slot.acknowledgedProgress === progress &&
      slot.acknowledgedView === view
    ) {
      finish(true);
      return;
    }
    // A stale equivalent write acknowledges the canonical view. Only replace
    // the view we sent, never a camera move made while its response was pending.
    if (
      params.mutationId &&
      slot.pending &&
      params.remote.save &&
      slot.save &&
      cloudProgressKey(slot.save) === progress &&
      cloudViewKey(slot.save) !== view &&
      cloudViewKey(slot.save) === cloudViewKey(slot.pending.save)
    ) {
      slot.save = params.remote.save;
      const slotId = params.remote.slotId;
      snapshot.catalog.slots[slotId] = {
        revision: snapshot.catalog.slots[slotId].revision + 1,
        payload: params.remote.save.envelope,
      };
      snapshot.catalog.revision += 1;
      store.put(snapshot.catalog, LIVING_SAVE_CATALOG_KEY);
    }
    slot.acknowledgedRevision = params.remote.revision;
    slot.acknowledgedProgress = progress;
    slot.acknowledgedView = view;
    if (params.mutationId) slot.pending = null;
    store.put(metadata, CLOUD_LOCAL_METADATA_KEY);
    finish(true);
  });
}

export function clearRejectedCloudWrite(
  identityKey: string,
  mutationId: string,
): Promise<void> {
  return transaction((snapshot, store, finish) => {
    if (snapshot.metadata.identityKey === identityKey) {
      for (const slot of Object.values(snapshot.metadata.slots)) {
        if (slot.pending?.mutationId === mutationId) slot.pending = null;
      }
      persist(store, snapshot);
    }
    finish(undefined);
  });
}

export function applyCloudDownload(params: {
  identityKey: string;
  playerId: string;
  localRevision: number;
  remote: CloudSlot;
  canApply: () => boolean;
}): Promise<CloudLocalSnapshot | null> {
  return transaction((snapshot, store, finish) => {
    const { metadata, catalog } = snapshot;
    const slotId = params.remote.slotId;
    const slot = catalog.slots[slotId];
    if (
      !params.canApply() ||
      metadata.identityKey !== params.identityKey ||
      metadata.playerId !== params.playerId ||
      slot.revision !== params.localRevision ||
      metadata.slots[slotId].localCandidates.length > 0
    ) {
      finish(null);
      return;
    }
    catalog.revision += 1;
    catalog.slots[slotId] = {
      revision: slot.revision + 1,
      payload: params.remote.save?.envelope ?? null,
    };
    if (params.remote.save === null && catalog.activeSlotId === slotId)
      catalog.activeSlotId = null;
    delete catalog.tombstones[slotId];
    metadata.slots[slotId] = {
      save: params.remote.save,
      deletedSave: null,
      guestSave: null,
      localCandidates: [],
      pending: null,
      acknowledgedRevision: params.remote.revision,
      acknowledgedProgress: cloudProgressKey(params.remote.save),
      acknowledgedView: cloudViewKey(params.remote.save),
    };
    persist(store, snapshot);
    finish(publicSnapshot(snapshot));
  });
}

/** Two offline local journeys at sign-in remain explicit competing versions. */
export function resolveGuestSave(params: {
  identityKey: string;
  slotId: LivingSaveSlotId;
  localRevision: number;
  keepGuest: boolean;
}): Promise<CloudLocalSnapshot | null> {
  return transaction((snapshot, store, finish) => {
    const slot = snapshot.metadata.slots[params.slotId];
    if (
      snapshot.metadata.identityKey !== params.identityKey ||
      snapshot.catalog.slots[params.slotId].revision !== params.localRevision ||
      !slot.guestSave ||
      slot.localCandidates.length > 0
    ) {
      finish(null);
      return;
    }
    snapshot.catalog.revision += 1;
    snapshot.catalog.slots[params.slotId] = {
      ...snapshot.catalog.slots[params.slotId],
      revision: params.localRevision + 1,
    };
    if (params.keepGuest) {
      snapshot.catalog.slots[params.slotId].payload = slot.guestSave.envelope;
      slot.save = slot.guestSave;
      // An in-flight earlier mutation is still acknowledged before this new progress uploads.
    }
    slot.guestSave = null;
    persist(store, snapshot);
    finish(publicSnapshot(snapshot));
  });
}

export async function setCloudOnlineServices(enabled: boolean): Promise<void> {
  await transaction<void>((snapshot, store, finish) => {
    if (enabled && snapshot.metadata.noticeAcknowledgedAt === null) {
      snapshot.metadata.noticeAcknowledgedAt = Date.now();
    }
    snapshot.metadata.onlineServicesEnabled = enabled;
    persist(store, snapshot);
    finish(undefined);
  });
  if (typeof window !== 'undefined')
    window.dispatchEvent(new Event(CLOUD_LOCAL_CHANGE_EVENT));
}

/** Existing Play/Continue acknowledges the notice once; withdrawal stays effective. */
export async function acknowledgeCloudNotice(): Promise<void> {
  await transaction<void>((snapshot, store, finish) => {
    if (snapshot.metadata.noticeAcknowledgedAt === null) {
      snapshot.metadata.noticeAcknowledgedAt = Date.now();
      snapshot.metadata.onlineServicesEnabled = true;
      persist(store, snapshot);
    }
    finish(undefined);
  });
  if (typeof window !== 'undefined')
    window.dispatchEvent(new Event(CLOUD_LOCAL_CHANGE_EVENT));
}

/** Remove exactly the displayed local branch; another writer's pending progress survives. */
export function resolveLocalSaveCandidate(params: {
  identityKey: string;
  slotId: LivingSaveSlotId;
  localRevision: number;
  candidateId: string;
  keepCandidate: boolean;
}): Promise<CloudLocalSnapshot | null> {
  return transaction((snapshot, store, finish) => {
    const { catalog, metadata } = snapshot;
    const slot = metadata.slots[params.slotId];
    const candidate = slot.localCandidates.find(
      (value) => value.candidateId === params.candidateId,
    );
    if (
      metadata.identityKey !== params.identityKey ||
      catalog.slots[params.slotId].revision !== params.localRevision ||
      !candidate
    ) {
      finish(null);
      return;
    }
    catalog.revision += 1;
    // Even keeping the existing version fences a third update / another open chooser.
    catalog.slots[params.slotId] = {
      ...catalog.slots[params.slotId],
      revision: params.localRevision + 1,
      ...(params.keepCandidate ? { payload: candidate.save.envelope } : {}),
    };
    if (params.keepCandidate) {
      slot.save = candidate.save;
      delete catalog.tombstones[params.slotId];
    }
    slot.localCandidates = slot.localCandidates.filter(
      (value) => value.candidateId !== candidate.candidateId,
    );
    persist(store, snapshot);
    finish(publicSnapshot(snapshot));
  });
}
