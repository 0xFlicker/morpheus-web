import { describe, expect, it, vi } from 'vitest';
import { fetchInitial } from '@soapbubble/morpheus-client/service/gameState';
import type { Scene } from 'morpheus/casts/types';

import { explorerRuntimePolicy, toolingRuntimePolicy } from './runtimePolicy';
import { createVolatileSceneRuntime } from './volatileSceneRuntime';
import { updateGamestate } from '../store/slices/gamestateSlice';
import { setRotation } from '../store/slices/rotationSlice';
import { requestScene } from '../store/slices/sceneSlice';
import * as livingSaveStorage from '../storage/livingSaveStorage';

function scene(sceneId: number): Scene {
  return {
    sceneId,
    sceneType: 1,
    cdFlags: 0,
    palette: 0,
    casts: [],
  };
}

describe('volatile scene runtimes', () => {
  it('starts an explorer directly in fresh default state without persistence', () => {
    const readCatalog = vi.spyOn(livingSaveStorage, 'readLivingSaveCatalog');
    const runtime = createVolatileSceneRuntime({
      policy: explorerRuntimePolicy(1050),
      scene: scene(1050),
    });
    const state = runtime.store.getState();

    expect(state.scene.activeSceneId).toBe(1050);
    expect(state.scene.stack.map((entry) => entry.sceneId)).toEqual([1050]);
    expect(state.livingSaves).toMatchObject({
      bootstrapPhase: 'ready',
      runtimeSlotId: null,
      saveHealth: 'volatile',
      skipSceneEntryActions: false,
    });
    const initialById = new Map(
      fetchInitial().map((gamestate) => [gamestate.stateId, gamestate]),
    );
    expect(Object.values(state.gamestate.byId)).toHaveLength(initialById.size);
    expect(
      Object.values(state.gamestate.byId).every(
        (gamestate) =>
          gamestate.value === initialById.get(gamestate.stateId)?.value,
      ),
    ).toBe(true);
    expect(runtime.policy.persistence).toBe('none');
    expect(readCatalog).not.toHaveBeenCalled();
    readCatalog.mockRestore();
  });

  it('creates a complete fresh store when reset at the current scene', () => {
    const first = createVolatileSceneRuntime({
      policy: explorerRuntimePolicy(1050),
      scene: scene(1050),
    });
    const gamestate = Object.values(first.store.getState().gamestate.byId)[0];
    first.store.dispatch(
      updateGamestate({
        stateId: gamestate.stateId,
        value: gamestate.value + 1,
      }),
    );
    first.store.dispatch(setRotation({ yaw3600: 2300, pitch: 40 }));
    first.store.dispatch(requestScene(1060));

    const reset = createVolatileSceneRuntime({
      policy: explorerRuntimePolicy(1060),
      scene: scene(1060),
    });
    const state = reset.store.getState();

    expect(state.scene).toMatchObject({
      activeSceneId: 1060,
      requestedSceneId: null,
      returnSceneId: null,
    });
    expect(state.rotation.current).toEqual({ yaw3600: 1500, pitch: 0 });
    expect(state.gamestate.byId[gamestate.stateId].value).toBe(gamestate.value);
    expect(first.store.getState().scene.activeSceneId).toBe(1050);
  });

  it('keeps tooling and explorer stores isolated', () => {
    const explorer = createVolatileSceneRuntime({
      policy: explorerRuntimePolicy(1050),
      scene: scene(1050),
    });
    const tooling = createVolatileSceneRuntime({
      policy: toolingRuntimePolicy(2020),
      scene: scene(2020),
    });

    explorer.store.dispatch(setRotation({ yaw3600: 900, pitch: -10 }));

    expect(tooling.store.getState().rotation.current).toEqual({
      yaw3600: 1500,
      pitch: 0,
    });
    expect(tooling.store.getState().scene.activeSceneId).toBe(2020);
  });

  it('rejects a scene that does not match the route policy', () => {
    expect(() =>
      createVolatileSceneRuntime({
        policy: explorerRuntimePolicy(1050),
        scene: scene(1060),
      }),
    ).toThrow(/does not match.*1050/i);
  });
});
