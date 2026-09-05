import { isNavigableSceneTarget } from 'morpheus/scene/transitionTarget';

import {
  getLivingSaveWriterId,
  writeLivingSaveCheckpoint,
} from '@/morpheus-app/storage/livingSaveStorage';
import { createLivingSaveResumePointId } from '@/morpheus-app/storage/livingSaveIdentity';
import {
  LIVING_SAVE_GAME_DATA_VERSION,
  LIVING_SAVE_SESSION_FORMAT,
  LIVING_SAVE_SESSION_SCHEMA_VERSION,
} from '@/morpheus-app/storage/livingSaveTypes';
import type {
  LivingSaveCatalog,
  LivingSaveResult,
  LivingSaveSessionEnvelope,
  LivingSaveSlotId,
} from '@/morpheus-app/storage/livingSaveTypes';
import {
  fullGameRuntimePolicy,
  isPersistentRuntime,
} from '@/morpheus-app/runtime/runtimePolicy';
import type {
  FullGameRuntimePolicy,
  RuntimePolicy,
} from '@/morpheus-app/runtime/runtimePolicy';
import {
  livingSaveCheckpointFailed,
  livingSaveCheckpointStarted,
  livingSaveCheckpointSucceeded,
} from './slices/livingSavesSlice';
import type { AppDispatch, AppStore, RootState } from './store';

type WriteCheckpointParams = {
  slotId: LivingSaveSlotId;
  envelope: LivingSaveSessionEnvelope;
  expectedCatalogRevision: number;
  expectedSlotRevision: number;
};

export type LivingSaveCheckpointDependencies = {
  dispatch: AppDispatch;
  getState: () => RootState;
  writeCheckpoint: (
    params: WriteCheckpointParams,
  ) => Promise<LivingSaveResult<LivingSaveCatalog>>;
  now: () => number;
  createResumePointId: () => string;
};

export type LivingSaveCheckpointCoordinator = {
  requestCheckpoint: (runtimeGeneration: number) => Promise<void>;
  flush: () => Promise<LivingSaveResult<void>>;
};

export function createLivingSaveCheckpointCoordinator(
  policy: FullGameRuntimePolicy,
  dependencies: LivingSaveCheckpointDependencies,
): LivingSaveCheckpointCoordinator {
  if (!isPersistentRuntime(policy)) {
    throw new Error('Living-save checkpoints require a persistent runtime');
  }
  let inFlight: Promise<void> | null = null;
  type CapturedCheckpoint = {
    runtimeGeneration: number;
    params: WriteCheckpointParams;
  };
  let queued: CapturedCheckpoint | null = null;
  let lastResult: LivingSaveResult<void> = { ok: true, value: undefined };

  const capture = (runtimeGeneration: number): CapturedCheckpoint | null => {
    const state = dependencies.getState();
    const activeSlotId = state.livingSaves.runtimeSlotId;
    if (
      activeSlotId === null ||
      state.livingSaves.runtimeGeneration !== runtimeGeneration ||
      state.livingSaves.bootstrapPhase !== 'ready' ||
      !isNavigableSceneTarget(state.scene.activeSceneId)
    ) {
      return null;
    }
    const slot = state.livingSaves.slots.find(
      (candidate) => candidate.slotId === activeSlotId,
    );
    if (!slot || slot.state !== 'occupied') return null;

    const envelope: LivingSaveSessionEnvelope = {
      format: LIVING_SAVE_SESSION_FORMAT,
      schemaVersion: LIVING_SAVE_SESSION_SCHEMA_VERSION,
      gameDataVersion: LIVING_SAVE_GAME_DATA_VERSION,
      resumePointId: dependencies.createResumePointId(),
      savedAt: dependencies.now(),
      gamestateValues: Object.fromEntries(
        Object.values(state.gamestate.byId).map((gamestate) => [
          gamestate.stateId,
          gamestate.value,
        ]),
      ),
      activeSceneId: state.scene.activeSceneId,
      returnSceneId: state.scene.stack[1]?.sceneId ?? null,
      rotation: { ...state.rotation.current },
    };

    return {
      runtimeGeneration,
      params: {
        slotId: activeSlotId,
        envelope,
        expectedCatalogRevision: state.livingSaves.catalogRevision,
        expectedSlotRevision: slot.revision,
      },
    };
  };

  const persist = async ({ runtimeGeneration, params }: CapturedCheckpoint) => {
    dependencies.dispatch(
      livingSaveCheckpointStarted({ runtimeGeneration, slotId: params.slotId }),
    );
    let result: LivingSaveResult<LivingSaveCatalog>;
    try {
      result = await dependencies.writeCheckpoint(params);
    } catch {
      result = { ok: false, code: 'unavailable-storage' };
    }
    // A committed competing version is durable even while a choice is pending.
    lastResult =
      result.ok || result.checkpointRetained
        ? { ok: true, value: undefined }
        : result;

    if (!result.ok) {
      dependencies.dispatch(
        livingSaveCheckpointFailed({
          runtimeGeneration,
          slotId: params.slotId,
          reason: result.code,
        }),
      );
      return;
    }
    dependencies.dispatch(
      livingSaveCheckpointSucceeded({
        runtimeGeneration,
        slotId: params.slotId,
        catalog: result.value,
      }),
    );
  };

  const requestCheckpoint = (runtimeGeneration: number): Promise<void> => {
    // Capture immediately: an account switch may unmount the game before this write runs.
    const captured = capture(runtimeGeneration);
    if (!captured) return inFlight ?? Promise.resolve();
    queued = captured;
    if (inFlight) return inFlight;
    inFlight = (async () => {
      while (queued !== null) {
        const next = queued;
        queued = null;
        await persist(next);
      }
    })().finally(() => {
      inFlight = null;
    });
    return inFlight;
  };
  const flush = async (): Promise<LivingSaveResult<void>> => {
    await requestCheckpoint(
      dependencies.getState().livingSaves.runtimeGeneration,
    );
    return lastResult;
  };
  return { requestCheckpoint, flush };
}

export function createRuntimeCheckpointCoordinator(
  policy: RuntimePolicy,
  dependencies: LivingSaveCheckpointDependencies,
): LivingSaveCheckpointCoordinator | null {
  return isPersistentRuntime(policy)
    ? createLivingSaveCheckpointCoordinator(policy, dependencies)
    : null;
}

export function createBrowserLivingSaveCheckpointCoordinator(
  store: AppStore,
): LivingSaveCheckpointCoordinator {
  const writerId = getLivingSaveWriterId();
  return createLivingSaveCheckpointCoordinator(fullGameRuntimePolicy, {
    dispatch: store.dispatch,
    getState: store.getState,
    writeCheckpoint: (params) =>
      writeLivingSaveCheckpoint({ ...params, writerId }),
    now: Date.now,
    createResumePointId: createLivingSaveResumePointId,
  });
}
