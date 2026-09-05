import type { LivingSaveCheckpointCoordinator } from '@/morpheus-app/store/livingSaveCheckpoint';
import type { AppStore, RootState } from '@/morpheus-app/store/store';

function sameRuntime(before: RootState | null, after: RootState): boolean {
  return (
    before !== null &&
    before.livingSaves.runtimeGeneration ===
      after.livingSaves.runtimeGeneration &&
    before.livingSaves.runtimeSlotId === after.livingSaves.runtimeSlotId &&
    before.scene.activeSceneId === after.scene.activeSceneId &&
    before.scene.stack[1]?.sceneId === after.scene.stack[1]?.sceneId &&
    before.gamestate.byId === after.gamestate.byId &&
    before.rotation.current.yaw3600 === after.rotation.current.yaw3600 &&
    before.rotation.current.pitch === after.rotation.current.pitch
  );
}

/** A pause permits replacement only after this exact runtime has been saved. */
export function createCloudRuntimeBarrier({
  store,
  checkpointCoordinator,
  isCurrent,
  isPaused,
}: {
  store: AppStore;
  checkpointCoordinator: LivingSaveCheckpointCoordinator;
  isCurrent: () => boolean;
  isPaused: () => boolean;
}) {
  let drained: RootState | null = null;
  let prepared: RootState | null = null;

  return {
    async prepare(): Promise<void> {
      prepared = null;
      const before = store.getState();
      if (!isCurrent() || !isPaused() || before.livingSaves.operation !== null)
        return;
      if (before.livingSaves.runtimeSlotId !== null) {
        if (
          !sameRuntime(drained, before) ||
          before.livingSaves.saveHealth === 'saving'
        ) {
          const result = await checkpointCoordinator.flush();
          if (!result.ok) return;
        }
        if (
          !isCurrent() ||
          !isPaused() ||
          !sameRuntime(before, store.getState())
        )
          return;
      }
      // Checkpoint notifications schedule another sync. Reuse an unchanged drain
      // instead of creating a fresh checkpoint and an endless notification loop.
      drained = store.getState();
      prepared = drained;
    },
    isPrepared(): boolean {
      return (
        isCurrent() && isPaused() && sameRuntime(prepared, store.getState())
      );
    },
  };
}
