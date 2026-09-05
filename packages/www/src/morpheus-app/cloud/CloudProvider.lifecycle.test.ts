import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@clerk/nextjs', () => ({ useAuth: vi.fn() }));
import {
  activateLivingSaveSlot,
  createLivingSaveSlot,
  LIVING_SAVE_DATABASE_NAME,
  LIVING_SAVE_STORE_NAME,
  openLivingSaveDatabase,
  readLivingSaveCatalog,
  setLivingSaveIdentityFence,
  writeLivingSaveCheckpoint,
} from '@/morpheus-app/storage/livingSaveStorage';
import type {
  LivingSaveResult,
  LivingSaveSessionEnvelope,
} from '@/morpheus-app/storage/livingSaveTypes';
import type { LivingSavesState } from '@/morpheus-app/store/slices/livingSavesSlice';
import {
  installLivingSaveRuntime,
  resetGame,
} from '@/morpheus-app/store/actions';
import {
  activateScene,
  scenePrefetched,
} from '@/morpheus-app/store/slices/sceneSlice';
import { createLivingSaveCheckpointCoordinator } from '@/morpheus-app/store/livingSaveCheckpoint';
import { fullGameRuntimePolicy } from '@/morpheus-app/runtime/runtimePolicy';
import { createAppStore } from '@/morpheus-app/store/store';
import type { Scene } from 'morpheus/casts/types';
import { cloudProgressKey } from '@/lib/cloud/protocol';
import {
  readCloudLocalSnapshot,
  switchCloudLocalIdentity,
} from './cloudStorage';
import {
  canApplyCloudSnapshot,
  prepareCloudLocalRuntime,
} from './CloudProvider';
import { createCloudRuntimeBarrier } from './runtimeBarrier';
import { setRotation } from '@/morpheus-app/store/slices/rotationSlice';
import { updateGamestate } from '@/morpheus-app/store/slices/gamestateSlice';

const envelope: LivingSaveSessionEnvelope = {
  format: 'morpheus-living-save-session',
  schemaVersion: 1,
  gameDataVersion: 1,
  resumePointId: '11111111-1111-4111-8111-111111111111',
  savedAt: 1700000000000,
  gamestateValues: { '100': 2 },
  activeSceneId: 1010,
  returnSceneId: null,
  rotation: { yaw3600: 100, pitch: 0 },
};
const value = <T>(result: LivingSaveResult<T>): T => {
  if (!result.ok) throw new Error(result.code);
  return result.value;
};
const clear = () =>
  new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(LIVING_SAVE_DATABASE_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Database still open'));
  });

async function seedJourney() {
  await switchCloudLocalIdentity('user-a');
  const catalog = value(await readLivingSaveCatalog());
  value(
    await createLivingSaveSlot({
      slotId: 'slot-1',
      envelope,
      expectedCatalogRevision: catalog.revision,
      activate: true,
    }),
  );
}

async function corruptArchive(identity: string) {
  const database = await openLivingSaveDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = database.transaction(LIVING_SAVE_STORE_NAME, 'readwrite');
    tx.objectStore(LIVING_SAVE_STORE_NAME).put(
      { catalog: 'damaged', metadata: {} },
      `cloud-identity:${identity}`,
    );
    tx.oncomplete = () => {
      database.close();
      resolve();
    };
    tx.onabort = tx.onerror = () => {
      database.close();
      reject(tx.error);
    };
  });
}

const scene = (sceneId: number): Scene => ({
  sceneId,
  cdFlags: 0,
  sceneType: 0,
  palette: 0,
  casts: [],
});
async function runtimeForIdentityChange() {
  await seedJourney();
  setLivingSaveIdentityFence('user-a');
  const store = createAppStore();
  const snapshot = await readCloudLocalSnapshot();
  store.dispatch(
    installLivingSaveRuntime({
      operationId: 'install',
      catalog: snapshot.catalog,
      slotId: 'slot-1',
      envelope,
      activeScene: scene(1010),
      returnScene: null,
      saveHealth: 'saved',
      skipSceneEntryActions: false,
    }),
  );
  return store;
}

describe('CloudProvider local ownership setup', () => {
  beforeEach(clear);
  afterEach(async () => {
    setLivingSaveIdentityFence(undefined);
    await clear();
  });

  it('keeps the recorded owner and local journey available while authentication is offline', async () => {
    await seedJourney();
    const onIdentityChange = vi.fn();
    const snapshot = await prepareCloudLocalRuntime({
      identity: null,
      isCurrent: () => true,
      onIdentityChange,
    });
    expect(snapshot?.metadata.identityKey).toBe('user-a');
    expect(snapshot?.catalog.slots['slot-1'].kind).toBe('occupied');
    expect(onIdentityChange).not.toHaveBeenCalled();
  });

  it('keeps verified same-account local play without switching its catalog', async () => {
    await seedJourney();
    const before = await readCloudLocalSnapshot();
    const onIdentityChange = vi.fn();
    const snapshot = await prepareCloudLocalRuntime({
      identity: 'user-a',
      isCurrent: () => true,
      onIdentityChange,
    });
    expect(snapshot?.catalog.revision).toBe(before.catalog.revision);
    expect(
      snapshot?.metadata.slots['slot-1'].save?.envelope.activeSceneId,
    ).toBe(1010);
    expect(onIdentityChange).not.toHaveBeenCalled();
  });

  it('rejects a failed account switch instead of returning the previous account catalog', async () => {
    await seedJourney();
    await corruptArchive('user-b');
    const onIdentityChange = vi.fn();
    await expect(
      prepareCloudLocalRuntime({
        identity: 'user-b',
        isCurrent: () => true,
        onIdentityChange,
      }),
    ).rejects.toThrow();
    expect(onIdentityChange).toHaveBeenCalledOnce();
    const stored = await readCloudLocalSnapshot();
    expect(stored.metadata.identityKey).toBe('user-a');
    expect(stored.catalog.slots['slot-1'].kind).toBe('occupied');
  });

  it('does not switch catalogs after an obsolete setup finishes its read', async () => {
    await seedJourney();
    const onIdentityChange = vi.fn();
    expect(
      await prepareCloudLocalRuntime({
        identity: 'user-b',
        isCurrent: () => false,
        onIdentityChange,
      }),
    ).toBeNull();
    expect(onIdentityChange).not.toHaveBeenCalled();
    expect((await readCloudLocalSnapshot()).metadata.identityKey).toBe(
      'user-a',
    );
  });

  it('does not switch when its identity becomes obsolete while detaching the prior runtime', async () => {
    await seedJourney();
    let current = true;
    const snapshot = await prepareCloudLocalRuntime({
      identity: 'user-b',
      isCurrent: () => current,
      onIdentityChange: () => {
        current = false;
      },
    });
    expect(snapshot).toBeNull();
    expect((await readCloudLocalSnapshot()).metadata.identityKey).toBe(
      'user-a',
    );
  });

  it('preserves unsaved runtime progress when storage fails, even during conflict resolution', async () => {
    await seedJourney();
    const snapshot = await readCloudLocalSnapshot();
    const saves: Pick<
      LivingSavesState,
      'runtimeSlotId' | 'saveHealth' | 'failureReason' | 'operation'
    > = {
      runtimeSlotId: 'slot-1',
      saveHealth: 'save-unavailable',
      failureReason: 'unavailable-storage',
      operation: null,
    };
    expect(
      canApplyCloudSnapshot({ snapshot, saves, playing: true, menuOpen: true }),
    ).toBe(false);
    expect(
      canApplyCloudSnapshot({
        snapshot,
        saves,
        playing: true,
        menuOpen: true,
        resolvingLocal: true,
      }),
    ).toBe(false);
  });

  it('waits for an explicit choice before replacing a runtime with a retained losing-tab candidate', async () => {
    await seedJourney();
    const snapshot = await readCloudLocalSnapshot();
    const slot = snapshot.metadata.slots['slot-1'];
    if (!slot.save) throw new Error('Expected a saved journey');
    slot.localCandidates.push({
      writerId: '22222222-2222-4222-8222-222222222222',
      candidateId: '33333333-3333-4333-8333-333333333333',
      save: slot.save,
      baseProgress: cloudProgressKey(slot.save),
      baseSlotRevision: snapshot.catalog.slots['slot-1'].revision,
    });
    const saves: Pick<
      LivingSavesState,
      'runtimeSlotId' | 'saveHealth' | 'failureReason' | 'operation'
    > = {
      runtimeSlotId: 'slot-1',
      saveHealth: 'save-unavailable',
      failureReason: 'conflict',
      operation: null,
    };
    expect(
      canApplyCloudSnapshot({ snapshot, saves, playing: true, menuOpen: true }),
    ).toBe(false);
    expect(
      canApplyCloudSnapshot({
        snapshot,
        saves,
        playing: true,
        menuOpen: true,
        resolvingLocal: true,
      }),
    ).toBe(true);
    expect(
      canApplyCloudSnapshot({
        snapshot,
        saves,
        playing: true,
        menuOpen: false,
        resolvingLocal: true,
      }),
    ).toBe(false);
  });

  it('can refresh a stale paused runtime when it made no competing progress', async () => {
    await seedJourney();
    const snapshot = await readCloudLocalSnapshot();
    const saves: Pick<
      LivingSavesState,
      'runtimeSlotId' | 'saveHealth' | 'failureReason' | 'operation'
    > = {
      runtimeSlotId: 'slot-1',
      saveHealth: 'save-unavailable',
      failureReason: 'conflict',
      operation: null,
    };
    expect(
      canApplyCloudSnapshot({ snapshot, saves, playing: true, menuOpen: true }),
    ).toBe(true);
    expect(
      canApplyCloudSnapshot({
        snapshot,
        saves: { ...saves, saveHealth: 'saving' },
        playing: true,
        menuOpen: true,
      }),
    ).toBe(false);
  });

  it('defers runtime restoration after an intermediate choice until the final candidate is resolved', async () => {
    await seedJourney();
    const snapshot = await readCloudLocalSnapshot();
    const slot = snapshot.metadata.slots['slot-1'];
    if (!slot.save) throw new Error('Expected a saved journey');
    slot.localCandidates.push({
      writerId: '22222222-2222-4222-8222-222222222222',
      candidateId: '33333333-3333-4333-8333-333333333333',
      save: slot.save,
      baseProgress: cloudProgressKey(slot.save),
      baseSlotRevision: snapshot.catalog.slots['slot-1'].revision,
    });
    const saves: Pick<
      LivingSavesState,
      'runtimeSlotId' | 'saveHealth' | 'failureReason' | 'operation'
    > = {
      runtimeSlotId: 'slot-1',
      saveHealth: 'save-unavailable',
      failureReason: 'conflict',
      operation: null,
    };
    const paused = { snapshot, saves, playing: true, menuOpen: true };
    // The explicit choice can publish catalog summaries; automatic installation
    // must still preserve the live journey while another choice remains.
    expect(canApplyCloudSnapshot({ ...paused, resolvingLocal: true })).toBe(
      true,
    );
    expect(canApplyCloudSnapshot(paused)).toBe(false);
    slot.localCandidates = [];
    expect(canApplyCloudSnapshot(paused)).toBe(true);
  });
  it('drains the captured final move before resetting and archiving a changed account', async () => {
    const store = await runtimeForIdentityChange();
    let releaseFirst = () => {};
    const firstWrite = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let beganFirst = () => {};
    const firstBegan = new Promise<void>((resolve) => {
      beganFirst = resolve;
    });
    let writes = 0;
    const checkpoints = createLivingSaveCheckpointCoordinator(
      fullGameRuntimePolicy,
      {
        dispatch: store.dispatch,
        getState: store.getState,
        now: Date.now,
        createResumePointId: () => crypto.randomUUID(),
        writeCheckpoint: async (params) => {
          if (++writes === 1) {
            beganFirst();
            await firstWrite;
          }
          return writeLivingSaveCheckpoint(params);
        },
      },
    );
    const generation = store.getState().livingSaves.runtimeGeneration;
    const pending = checkpoints.requestCheckpoint(generation);
    await firstBegan;
    store.dispatch(scenePrefetched(scene(2010)));
    store.dispatch(activateScene(2010));
    void checkpoints.requestCheckpoint(generation);
    const change = prepareCloudLocalRuntime({
      identity: 'user-b',
      currentIdentity: 'user-a',
      isCurrent: () => true,
      onIdentityChange: async () => {
        const result = await checkpoints.flush();
        if (!result.ok) throw new Error(result.code);
      },
    }).then((snapshot) => {
      if (snapshot) store.dispatch(resetGame());
      return snapshot;
    });
    expect(store.getState().scene.activeSceneId).toBe(2010);
    releaseFirst();
    const next = await change;
    await pending;
    expect(next?.metadata.identityKey).toBe('user-b');
    expect(next?.catalog.slots['slot-1'].kind).toBe('empty');
    const old = await switchCloudLocalIdentity('user-a');
    expect(old.metadata.slots['slot-1'].save?.envelope.activeSceneId).toBe(
      2010,
    );
    expect(writes).toBeGreaterThanOrEqual(2);
    expect(store.getState().livingSaves.runtimeSlotId).toBeNull();
  });

  it('reuses a completed pause drain until gameplay or camera content changes', async () => {
    const store = await runtimeForIdentityChange();
    const flush = vi.fn(async () => ({ ok: true as const, value: undefined }));
    const barrier = createCloudRuntimeBarrier({
      store,
      checkpointCoordinator: { flush, requestCheckpoint: async () => {} },
      isCurrent: () => true,
      isPaused: () => true,
    });
    await barrier.prepare();
    await barrier.prepare();
    expect(flush).toHaveBeenCalledTimes(1);
    expect(barrier.isPrepared()).toBe(true);
    store.dispatch(setRotation({ yaw3600: 900, pitch: 0 }));
    expect(barrier.isPrepared()).toBe(false);
    await barrier.prepare();
    expect(flush).toHaveBeenCalledTimes(2);
    const state = Object.values(store.getState().gamestate.byId)[0];
    store.dispatch(
      updateGamestate({ stateId: state.stateId, value: state.value + 1 }),
    );
    expect(barrier.isPrepared()).toBe(false);
  });

  it.each(['runtime', 'identity', 'menu'] as const)(
    'rejects a pause drain when %s changes while it waits',
    async (change) => {
      const store = await runtimeForIdentityChange();
      let release = () => {};
      const pending = new Promise<void>((resolve) => {
        release = resolve;
      });
      let current = true;
      let paused = true;
      const barrier = createCloudRuntimeBarrier({
        store,
        checkpointCoordinator: {
          requestCheckpoint: async () => {},
          flush: async () => {
            await pending;
            return { ok: true, value: undefined };
          },
        },
        isCurrent: () => current,
        isPaused: () => paused,
      });
      const preparation = barrier.prepare();
      if (change === 'runtime') store.dispatch(resetGame());
      if (change === 'identity') current = false;
      if (change === 'menu') paused = false;
      release();
      await preparation;
      expect(barrier.isPrepared()).toBe(false);
    },
  );

  it('does not permit a failed checkpoint to become a safe download boundary', async () => {
    const store = await runtimeForIdentityChange();
    const barrier = createCloudRuntimeBarrier({
      store,
      checkpointCoordinator: {
        requestCheckpoint: async () => {},
        flush: async () => ({ ok: false, code: 'unavailable-storage' }),
      },
      isCurrent: () => true,
      isPaused: () => true,
    });
    await barrier.prepare();
    expect(barrier.isPrepared()).toBe(false);
  });

  it('keeps the old runtime after failed drain and retries before changing identity', async () => {
    const store = await runtimeForIdentityChange();
    store.dispatch(scenePrefetched(scene(2010)));
    store.dispatch(activateScene(2010));
    let unavailable = true;
    const checkpoints = createLivingSaveCheckpointCoordinator(
      fullGameRuntimePolicy,
      {
        dispatch: store.dispatch,
        getState: store.getState,
        now: Date.now,
        createResumePointId: () => crypto.randomUUID(),
        writeCheckpoint: async (params) =>
          unavailable
            ? { ok: false, code: 'unavailable-storage' }
            : writeLivingSaveCheckpoint(params),
      },
    );
    const change = () =>
      prepareCloudLocalRuntime({
        identity: 'user-b',
        currentIdentity: 'user-a',
        isCurrent: () => true,
        onIdentityChange: async () => {
          const result = await checkpoints.flush();
          if (!result.ok) throw new Error(result.code);
        },
      });
    await expect(change()).rejects.toThrow('unavailable-storage');
    expect(store.getState().scene.activeSceneId).toBe(2010);
    expect(store.getState().livingSaves.runtimeSlotId).toBe('slot-1');
    expect((await readCloudLocalSnapshot()).metadata.identityKey).toBe(
      'user-a',
    );
    unavailable = false;
    expect((await change())?.metadata.identityKey).toBe('user-b');
    expect(
      (await switchCloudLocalIdentity('user-a')).metadata.slots['slot-1'].save
        ?.envelope.activeSceneId,
    ).toBe(2010);
  });

  it('does not change another tab owner or reset the runtime when its checkpoint fence fails', async () => {
    const store = await runtimeForIdentityChange();
    store.dispatch(scenePrefetched(scene(2010)));
    store.dispatch(activateScene(2010));
    const checkpoints = createLivingSaveCheckpointCoordinator(
      fullGameRuntimePolicy,
      {
        dispatch: store.dispatch,
        getState: store.getState,
        now: Date.now,
        createResumePointId: () => crypto.randomUUID(),
        writeCheckpoint: writeLivingSaveCheckpoint,
      },
    );
    await switchCloudLocalIdentity('user-c');
    await expect(
      prepareCloudLocalRuntime({
        identity: 'user-b',
        currentIdentity: 'user-a',
        isCurrent: () => true,
        onIdentityChange: async () => {
          const result = await checkpoints.flush();
          if (!result.ok) throw new Error(result.code);
        },
      }),
    ).rejects.toThrow('conflict');
    expect((await readCloudLocalSnapshot()).metadata.identityKey).toBe(
      'user-c',
    );
    expect(store.getState().scene.activeSceneId).toBe(2010);
    expect(store.getState().livingSaves.runtimeSlotId).toBe('slot-1');
  });

  it('does not swap the catalog when authentication changes while the old checkpoint drains', async () => {
    await seedJourney();
    let current = true;
    await prepareCloudLocalRuntime({
      identity: 'user-b',
      currentIdentity: 'user-a',
      isCurrent: () => current,
      onIdentityChange: async () => {
        await Promise.resolve();
        current = false;
      },
    });
    expect((await readCloudLocalSnapshot()).metadata.identityKey).toBe(
      'user-a',
    );
  });
  it('can archive a durable competing checkpoint without dropping either local version', async () => {
    const store = await runtimeForIdentityChange();
    const before = await readCloudLocalSnapshot();
    const otherWriter = crypto.randomUUID();
    value(
      await activateLivingSaveSlot({
        slotId: 'slot-1',
        writerId: otherWriter,
        expectedCatalogRevision: before.catalog.revision,
        expectedSlotRevision: before.catalog.slots['slot-1'].revision,
      }),
    );
    value(
      await writeLivingSaveCheckpoint({
        slotId: 'slot-1',
        writerId: otherWriter,
        envelope: { ...envelope, activeSceneId: 3010 },
        expectedCatalogRevision: before.catalog.revision,
        expectedSlotRevision: before.catalog.slots['slot-1'].revision,
      }),
    );
    store.dispatch(scenePrefetched(scene(2010)));
    store.dispatch(activateScene(2010));
    const checkpoints = createLivingSaveCheckpointCoordinator(
      fullGameRuntimePolicy,
      {
        dispatch: store.dispatch,
        getState: store.getState,
        now: Date.now,
        createResumePointId: () => crypto.randomUUID(),
        writeCheckpoint: writeLivingSaveCheckpoint,
      },
    );
    await prepareCloudLocalRuntime({
      identity: 'user-b',
      currentIdentity: 'user-a',
      isCurrent: () => true,
      onIdentityChange: async () => {
        const result = await checkpoints.flush();
        if (!result.ok) throw new Error(result.code);
      },
    });
    const archived = await switchCloudLocalIdentity('user-a');
    expect(archived.metadata.slots['slot-1'].save?.envelope.activeSceneId).toBe(
      3010,
    );
    expect(
      archived.metadata.slots['slot-1'].localCandidates[0].save.envelope
        .activeSceneId,
    ).toBe(2010);
  });
  it('drains retained progress before reopening the original identity after a failed switch', async () => {
    const store = await runtimeForIdentityChange();
    store.dispatch(scenePrefetched(scene(2010)));
    store.dispatch(activateScene(2010));
    let unavailable = true;
    const checkpoints = createLivingSaveCheckpointCoordinator(
      fullGameRuntimePolicy,
      {
        dispatch: store.dispatch,
        getState: store.getState,
        now: Date.now,
        createResumePointId: () => crypto.randomUUID(),
        writeCheckpoint: async (params) =>
          unavailable
            ? { ok: false, code: 'unavailable-storage' }
            : writeLivingSaveCheckpoint(params),
      },
    );
    const reopen = (identity: string) =>
      prepareCloudLocalRuntime({
        identity,
        currentIdentity: 'user-a',
        hasRetainedRuntime: true,
        isCurrent: () => true,
        onIdentityChange: async () => {
          const result = await checkpoints.flush();
          if (!result.ok) throw new Error(result.code);
        },
      });
    await expect(reopen('user-b')).rejects.toThrow('unavailable-storage');
    await expect(reopen('user-a')).rejects.toThrow('unavailable-storage');
    expect(store.getState().scene.activeSceneId).toBe(2010);
    unavailable = false;
    await reopen('user-a');
    expect(
      (await readCloudLocalSnapshot()).metadata.slots['slot-1'].save?.envelope
        .activeSceneId,
    ).toBe(2010);
  });
});
