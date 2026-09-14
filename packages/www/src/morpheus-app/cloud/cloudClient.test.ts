import 'fake-indexeddb/auto';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import {
  cloudProgressKey,
  cloudWriteSchema,
  type CloudSlot,
} from '@/lib/cloud/protocol';
import {
  LIVING_SAVE_SLOT_IDS,
  type LivingSaveResult,
  type LivingSaveSessionEnvelope,
} from '@/morpheus-app/storage/livingSaveTypes';
import {
  LIVING_SAVE_DATABASE_NAME,
  activateLivingSaveSlot,
  createLivingSaveSlot,
  writeLivingSaveCheckpoint,
  readLivingSaveCatalog,
} from '@/morpheus-app/storage/livingSaveStorage';
import {
  acknowledgeCloudNotice,
  readCloudLocalSnapshot,
  setCloudOnlineServices,
  switchCloudLocalIdentity,
} from './cloudStorage';
import {
  createCloudClient,
  localCloudConflicts,
  type CloudClientState,
} from './cloudClient';

import { cloudViewKey } from './localMetadata';
import { createCloudRuntimeBarrier } from './runtimeBarrier';
import { canApplyCloudSnapshot } from './CloudProvider';
import { createAppStore } from '@/morpheus-app/store/store';
import { installLivingSaveRuntime } from '@/morpheus-app/store/actions';
import {
  activateScene,
  scenePrefetched,
} from '@/morpheus-app/store/slices/sceneSlice';
import { createLivingSaveCheckpointCoordinator } from '@/morpheus-app/store/livingSaveCheckpoint';
import { fullGameRuntimePolicy } from '@/morpheus-app/runtime/runtimePolicy';
import type { Scene } from 'morpheus/casts/types';

vi.mock('@clerk/nextjs', () => ({ useAuth: vi.fn() }));

const playerId = '10000000-0000-4000-8000-000000000001';
const envelope = (activeSceneId = 1010): LivingSaveSessionEnvelope => ({
  format: 'morpheus-living-save-session',
  schemaVersion: 1,
  gameDataVersion: 1,
  resumePointId: crypto.randomUUID(),
  savedAt: 1700000000000,
  gamestateValues: { 100: 2 },
  activeSceneId,
  returnSceneId: null,
  rotation: { yaw3600: 100, pitch: 0 },
});
const success = <T>(result: LivingSaveResult<T>) => {
  if (!result.ok) throw new Error(result.code);
  return result.value;
};
const clear = () =>
  new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(LIVING_SAVE_DATABASE_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
async function localSave(sceneId = 1010) {
  const catalog = success(await readLivingSaveCatalog());
  return success(
    await createLivingSaveSlot({
      slotId: 'slot-1',
      envelope: envelope(sceneId),
      expectedCatalogRevision: catalog.revision,
      activate: true,
    }),
  );
}
function setupClient(isCurrent = () => true, canApply = () => true) {
  const states: CloudClientState[] = [];
  return {
    states,
    client: createCloudClient({
      identityKey: 'anonymous',
      sessionId: crypto.randomUUID(),
      isCurrent,
      isIdentityCurrent: isCurrent,
      beforeReconcile: async () => {},
      canApply,
      onCatalog: async () => undefined,
      onState: (state) => states.push(state),
    }),
  };
}
function mockServer() {
  const slots: CloudSlot[] = LIVING_SAVE_SLOT_IDS.map((slotId) => ({
    slotId,
    revision: 0,
    save: null,
    updatedAt: null,
  }));
  const fetchMock = vi.fn(async (path: string, init?: RequestInit) => {
    expect(new Headers(init?.headers).get('x-morpheus-identity')).toBe(
      'anonymous',
    );
    if (path === '/api/cloud/player')
      return Response.json({
        protocolVersion: 1,
        playerId,
        authenticated: false,
        associatedAnonymousPlayerId: null,
      });
    expect(new Headers(init?.headers).get('x-morpheus-player-id')).toBe(
      playerId,
    );
    if (path === '/api/cloud/session') return Response.json({ ok: true });
    if (init?.method !== 'PUT')
      return Response.json({
        protocolVersion: 1,
        playerId,
        authenticated: false,
        slots,
      });
    const write = cloudWriteSchema.parse(JSON.parse(String(init.body)));
    const index = slots.findIndex((slot) => slot.slotId === write.slotId);
    const previous = slots[index];
    const sameProgress =
      cloudProgressKey(previous.save) === cloudProgressKey(write.save);
    if (previous.revision !== write.expectedRevision && sameProgress)
      return Response.json({ status: 'saved', slot: previous });
    if (previous.revision !== write.expectedRevision)
      return Response.json(
        { status: 'conflict', slot: previous },
        { status: 409 },
      );
    slots[index] = {
      slotId: write.slotId,
      revision: previous.revision + (sameProgress ? 0 : 1),
      save: write.save,
      updatedAt: null,
    };
    return Response.json({ status: 'saved', slot: slots[index] });
  });
  vi.stubGlobal('fetch', fetchMock);
  return { slots, fetchMock };
}

async function pausedRuntime() {
  await acknowledgeCloudNotice();
  const catalog = await localSave(2040);
  const store = createAppStore();
  const scene = (sceneId: number): Scene => ({
    sceneId,
    cdFlags: 0,
    sceneType: 0,
    palette: 0,
    casts: [],
  });
  store.dispatch(
    installLivingSaveRuntime({
      operationId: 'install',
      catalog,
      slotId: 'slot-1',
      envelope: envelope(2040),
      activeScene: scene(2040),
      returnScene: null,
      saveHealth: 'saved',
      skipSceneEntryActions: false,
    }),
  );
  const checkpointCoordinator = createLivingSaveCheckpointCoordinator(
    fullGameRuntimePolicy,
    {
      dispatch: store.dispatch,
      getState: store.getState,
      now: Date.now,
      createResumePointId: () => crypto.randomUUID(),
      writeCheckpoint: writeLivingSaveCheckpoint,
    },
  );
  let paused = true;
  const barrier = createCloudRuntimeBarrier({
    store,
    checkpointCoordinator,
    isCurrent: () => true,
    isPaused: () => paused,
  });
  const states: CloudClientState[] = [];
  const { slots, fetchMock } = mockServer();
  const client = createCloudClient({
    identityKey: 'anonymous',
    sessionId: crypto.randomUUID(),
    isCurrent: () => true,
    isIdentityCurrent: () => true,
    beforeReconcile: barrier.prepare,
    canApply: (snapshot, resolvingLocal) =>
      barrier.isPrepared() &&
      canApplyCloudSnapshot({
        snapshot,
        saves: store.getState().livingSaves,
        playing: true,
        menuOpen: paused,
        resolvingLocal,
      }),
    onCatalog: async () => {},
    onState: (state) => states.push(state),
  });
  await client.sync();
  return {
    store,
    checkpointCoordinator,
    states,
    slots,
    fetchMock,
    client,
    setPaused: (value: boolean) => {
      paused = value;
    },
    move: (sceneId: number) => {
      store.dispatch(scenePrefetched(scene(sceneId)));
      store.dispatch(activateScene(sceneId));
    },
    remoteMove: (sceneId: number) => {
      const previous = slots[0];
      if (!previous.save) throw new Error('Missing remote save');
      slots[0] = {
        ...previous,
        revision: previous.revision + 1,
        save: {
          ...previous.save,
          envelope: { ...previous.save.envelope, activeSceneId: sceneId },
          discoveredSceneIds: [...previous.save.discoveredSceneIds, sceneId],
        },
      };
    },
  };
}

beforeEach(async () => {
  await clear();
  vi.stubGlobal('navigator', {
    locks: {
      request: async (_name: string, work: () => Promise<void>) => work(),
    },
  });
  await switchCloudLocalIdentity('anonymous');
});
afterEach(async () => {
  vi.unstubAllGlobals();
  await clear();
});

describe('browser cloud transport', () => {
  it.each([
    { alreadyCheckpointed: false, choice: 'local' as const },
    { alreadyCheckpointed: true, choice: 'local' as const },
    { alreadyCheckpointed: false, choice: 'remote' as const },
  ])(
    'preserves paused 2050 against remote 2090, checkpointed=$alreadyCheckpointed, then keeps $choice',
    async ({ alreadyCheckpointed, choice }) => {
      const runtime = await pausedRuntime();
      runtime.move(2050);
      if (alreadyCheckpointed) await runtime.checkpointCoordinator.flush();
      runtime.remoteMove(2090);
      await runtime.client.sync();
      const snapshot = await readCloudLocalSnapshot();
      expect(
        snapshot.metadata.slots['slot-1'].save?.envelope.activeSceneId,
      ).toBe(2050);
      expect(snapshot.metadata.slots['slot-1'].acknowledgedRevision).toBe(1);
      expect(runtime.store.getState().scene.activeSceneId).toBe(2050);
      const conflict = runtime.states.at(-1)?.conflicts[0];
      expect(conflict).toMatchObject({
        kind: 'remote',
        remote: { revision: 2, save: { envelope: { activeSceneId: 2090 } } },
      });
      if (!conflict) throw new Error('Expected a genuine conflict');
      await runtime.client.resolve(conflict, choice);
      expect(runtime.slots[0].save?.envelope.activeSceneId).toBe(
        choice === 'local' ? 2050 : 2090,
      );
      expect(
        (await readCloudLocalSnapshot()).metadata.slots['slot-1'].save?.envelope
          .activeSceneId,
      ).toBe(choice === 'local' ? 2050 : 2090);
      expect(runtime.states.at(-1)?.conflicts).toEqual([]);
      runtime.client.stop();
    },
  );

  it('does not create another checkpoint when a completed drain triggers its next sync', async () => {
    const runtime = await pausedRuntime();
    const before = await readCloudLocalSnapshot();
    await runtime.client.sync();
    expect((await readCloudLocalSnapshot()).catalog.revision).toBe(
      before.catalog.revision,
    );
    runtime.client.stop();
  });

  it('defers a menu opened during fetch until the next pass drains its runtime', async () => {
    const runtime = await pausedRuntime();
    runtime.setPaused(false);
    runtime.remoteMove(2090);
    const base = runtime.fetchMock.getMockImplementation();
    let opened = false;
    runtime.fetchMock.mockImplementation(async (path, init) => {
      if (!base) throw new Error('Missing server');
      const response = await base(path, init);
      if (path === '/api/cloud/saves' && !opened) {
        opened = true;
        runtime.move(2050);
        runtime.setPaused(true);
      }
      return response;
    });
    await runtime.client.sync();
    expect(
      (await readCloudLocalSnapshot()).metadata.slots['slot-1'].save?.envelope
        .activeSceneId,
    ).toBe(2040);
    expect(
      (await readCloudLocalSnapshot()).metadata.slots['slot-1']
        .acknowledgedRevision,
    ).toBe(1);
    await runtime.client.sync();
    expect(
      (await readCloudLocalSnapshot()).metadata.slots['slot-1'].save?.envelope
        .activeSceneId,
    ).toBe(2050);
    expect(runtime.states.at(-1)?.conflicts).toHaveLength(1);
    runtime.client.stop();
  });

  it('does not contact the service until an informed Play or Sign In action', async () => {
    await localSave();
    const { fetchMock } = mockServer();
    const { client } = setupClient();
    await client.sync();
    expect(fetchMock).not.toHaveBeenCalled();
    await acknowledgeCloudNotice();
    await client.sync();
    expect(fetchMock).toHaveBeenCalled();
    expect(
      (await readCloudLocalSnapshot()).metadata.slots['slot-1']
        .acknowledgedRevision,
    ).toBe(1);
    client.stop();
  });

  it('keeps withdrawal effective on later Play and across restarts', async () => {
    await acknowledgeCloudNotice();
    await setCloudOnlineServices(false);
    await acknowledgeCloudNotice();
    const { fetchMock } = mockServer();
    const { client } = setupClient();
    await client.sync();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(
      (await readCloudLocalSnapshot()).metadata.onlineServicesEnabled,
    ).toBe(false);
    client.stop();
  });

  it('leaves a mutation pending after a transport identity fence rejection', async () => {
    await acknowledgeCloudNotice();
    await localSave();
    const { fetchMock } = mockServer();
    const base = fetchMock.getMockImplementation();
    fetchMock.mockImplementation(async (path, init) => {
      if (init?.method === 'PUT')
        return Response.json({ error: 'Account changed.' }, { status: 409 });
      if (!base) throw new Error('Missing mock server');
      return base(path, init);
    });
    const { client, states } = setupClient();
    await client.sync();
    const metadata = (await readCloudLocalSnapshot()).metadata.slots['slot-1'];
    expect(metadata.pending).not.toBeNull();
    expect(metadata.acknowledgedRevision).toBeNull();
    expect(states.at(-1)?.status).toBe('offline');
    client.stop();
  });

  it('discards responses arriving after an identity switch', async () => {
    await acknowledgeCloudNotice();
    await localSave();
    let current = true;
    const { fetchMock } = mockServer();
    const base = fetchMock.getMockImplementation();
    fetchMock.mockImplementation(async (path, init) => {
      if (!base) throw new Error('Missing mock server');
      const response = await base(path, init);
      if (init?.method === 'PUT') current = false;
      return response;
    });
    const { client, states } = setupClient(() => current);
    await client.sync();
    expect(
      (await readCloudLocalSnapshot()).metadata.slots['slot-1']
        .acknowledgedRevision,
    ).toBeNull();
    expect(states).toEqual([]);
    client.stop();
  });

  it('defers remote downloads during active play and applies at a pause boundary', async () => {
    await acknowledgeCloudNotice();
    const { slots } = mockServer();
    slots[0] = {
      slotId: 'slot-1',
      revision: 1,
      updatedAt: null,
      save: {
        runId: crypto.randomUUID(),
        envelope: envelope(),
        discoveredSceneIds: [1010],
        source: 'played',
      },
    };
    let paused = false;
    const { client } = setupClient(
      () => true,
      () => paused,
    );
    await client.sync();
    expect((await readCloudLocalSnapshot()).catalog.slots['slot-1'].kind).toBe(
      'empty',
    );
    paused = true;
    await client.sync();
    expect((await readCloudLocalSnapshot()).catalog.slots['slot-1'].kind).toBe(
      'occupied',
    );
    client.stop();
  });
  it('does not bind or upload when registration detects an account mismatch', async () => {
    await acknowledgeCloudNotice();
    await localSave();
    const before = await readCloudLocalSnapshot();
    const fetchMock = vi.fn(async (_path: string, init?: RequestInit) => {
      expect(new Headers(init?.headers).get('x-morpheus-identity')).toBe(
        'anonymous',
      );
      return Response.json({ error: 'Account changed.' }, { status: 409 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const { client, states } = setupClient();
    await client.sync();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((await readCloudLocalSnapshot()).metadata.playerId).toBeNull();
    expect((await readCloudLocalSnapshot()).metadata.slots).toEqual(
      before.metadata.slots,
    );
    expect(states.at(-1)?.status).toBe('offline');
    client.stop();
  });

  it('resolves a persisted competing tab offline without issuing network requests', async () => {
    const first = crypto.randomUUID();
    const second = crypto.randomUUID();
    const base = success(
      await createLivingSaveSlot({
        writerId: first,
        slotId: 'slot-1',
        envelope: envelope(),
        activate: true,
        expectedCatalogRevision: (await readCloudLocalSnapshot()).catalog
          .revision,
      }),
    );
    success(
      await activateLivingSaveSlot({
        writerId: second,
        slotId: 'slot-1',
        expectedCatalogRevision: base.revision,
        expectedSlotRevision: base.slots['slot-1'].revision,
      }),
    );
    for (const [writerId, scene] of [
      [first, 2010],
      [second, 3010],
    ] as const) {
      await writeLivingSaveCheckpoint({
        writerId,
        slotId: 'slot-1',
        envelope: { ...envelope(), activeSceneId: scene },
        expectedCatalogRevision: base.revision,
        expectedSlotRevision: base.slots['slot-1'].revision,
      });
    }
    const conflict = localCloudConflicts(await readCloudLocalSnapshot())[0];
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('navigator', {});
    let identityCurrent = false;
    const onCatalog = vi.fn(async () => undefined);
    const client = createCloudClient({
      identityKey: 'anonymous',
      sessionId: crypto.randomUUID(),
      isCurrent: () => false,
      isIdentityCurrent: () => identityCurrent,
      beforeReconcile: async () => {},
      canApply: () => true,
      onCatalog,
      onState: () => {},
    });
    await client.resolve(conflict, 'remote');
    expect(localCloudConflicts(await readCloudLocalSnapshot())).toHaveLength(1);
    identityCurrent = true;
    await client.resolve(conflict, 'remote');
    const resolved = await readCloudLocalSnapshot();
    expect(resolved.metadata.slots['slot-1'].save?.envelope.activeSceneId).toBe(
      3010,
    );
    expect(localCloudConflicts(resolved)).toEqual([]);
    expect(onCatalog).toHaveBeenCalledWith(expect.anything(), true);
    expect(fetchMock).not.toHaveBeenCalled();
    client.stop();
  });

  it('keeps local conflict choices visible after a network failure', async () => {
    const first = crypto.randomUUID();
    const second = crypto.randomUUID();
    const base = success(
      await createLivingSaveSlot({
        writerId: first,
        slotId: 'slot-1',
        envelope: envelope(),
        activate: true,
        expectedCatalogRevision: (await readCloudLocalSnapshot()).catalog
          .revision,
      }),
    );
    success(
      await activateLivingSaveSlot({
        writerId: second,
        slotId: 'slot-1',
        expectedCatalogRevision: base.revision,
        expectedSlotRevision: base.slots['slot-1'].revision,
      }),
    );
    for (const [writerId, scene] of [
      [first, 2010],
      [second, 3010],
    ] as const)
      await writeLivingSaveCheckpoint({
        writerId,
        slotId: 'slot-1',
        envelope: { ...envelope(), activeSceneId: scene },
        expectedCatalogRevision: base.revision,
        expectedSlotRevision: base.slots['slot-1'].revision,
      });
    await acknowledgeCloudNotice();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('Offline');
      }),
    );
    const { client, states } = setupClient();
    await client.sync();
    expect(states.at(-1)?.status).toBe('offline');
    expect(states.at(-1)?.conflicts).toMatchObject([
      { kind: 'local', candidate: { envelope: { activeSceneId: 3010 } } },
    ]);
    client.stop();
  });
  it('uploads only a changed camera view without making a game-progress conflict or revision', async () => {
    await acknowledgeCloudNotice();
    await localSave();
    const { slots, fetchMock } = mockServer();
    const { client, states } = setupClient();
    await client.sync();
    const before = await readCloudLocalSnapshot();
    const save = before.metadata.slots['slot-1'].save;
    if (!save) throw new Error('Missing save');
    success(
      await writeLivingSaveCheckpoint({
        slotId: 'slot-1',
        envelope: { ...save.envelope, rotation: { yaw3600: 700, pitch: 50 } },
        expectedCatalogRevision: before.catalog.revision,
        expectedSlotRevision: before.catalog.slots['slot-1'].revision,
      }),
    );
    await client.sync();
    expect(slots[0].revision).toBe(1);
    expect(slots[0].save?.envelope.rotation).toEqual({
      yaw3600: 700,
      pitch: 50,
    });
    expect(
      (await readCloudLocalSnapshot()).metadata.slots['slot-1']
        .acknowledgedView,
    ).toBe(cloudViewKey(slots[0].save));
    expect(states.at(-1)?.conflicts).toEqual([]);
    expect(
      fetchMock.mock.calls.filter(([, init]) => init?.method === 'PUT'),
    ).toHaveLength(2);
    client.stop();
  });

  it('downloads another device camera change only at a safe resume boundary', async () => {
    await acknowledgeCloudNotice();
    await localSave();
    const { slots, fetchMock } = mockServer();
    let paused = false;
    const { client } = setupClient(
      () => true,
      () => paused,
    );
    await client.sync();
    const remote = slots[0].save;
    if (!remote) throw new Error('Missing remote save');
    slots[0].save = {
      ...remote,
      envelope: { ...remote.envelope, rotation: { yaw3600: 900, pitch: -30 } },
    };
    await client.sync();
    expect(
      (await readCloudLocalSnapshot()).metadata.slots['slot-1'].save?.envelope
        .rotation.yaw3600,
    ).toBe(100);
    paused = true;
    await client.sync();
    expect(
      (await readCloudLocalSnapshot()).metadata.slots['slot-1'].save?.envelope
        .rotation,
    ).toEqual({ yaw3600: 900, pitch: -30 });
    expect(
      fetchMock.mock.calls.filter(([, init]) => init?.method === 'PUT'),
    ).toHaveLength(1);
    client.stop();
  });

  it('reconciles simultaneous camera changes quietly', async () => {
    await acknowledgeCloudNotice();
    await localSave();
    const { slots } = mockServer();
    const { client, states } = setupClient();
    await client.sync();
    const before = await readCloudLocalSnapshot();
    const save = before.metadata.slots['slot-1'].save;
    if (!save) throw new Error('Missing save');
    slots[0].save = {
      ...save,
      envelope: { ...save.envelope, rotation: { yaw3600: 900, pitch: 0 } },
    };
    success(
      await writeLivingSaveCheckpoint({
        slotId: 'slot-1',
        envelope: { ...save.envelope, rotation: { yaw3600: 700, pitch: 50 } },
        expectedCatalogRevision: before.catalog.revision,
        expectedSlotRevision: before.catalog.slots['slot-1'].revision,
      }),
    );
    await client.sync();
    expect(states.at(-1)?.conflicts).toEqual([]);
    expect(slots[0].save?.envelope.rotation.yaw3600).toBe(700);
    expect(slots[0].revision).toBe(1);
    client.stop();
  });
});
