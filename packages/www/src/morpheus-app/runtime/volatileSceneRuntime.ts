import type { Scene } from 'morpheus/casts/types';

import {
  LIVING_SAVE_CATALOG_FORMAT,
  LIVING_SAVE_CATALOG_SCHEMA_VERSION,
} from '@/morpheus-app/storage/livingSaveTypes';
import type { LivingSaveCatalog } from '@/morpheus-app/storage/livingSaveTypes';
import { installLivingSaveRuntime } from '@/morpheus-app/store/actions';
import { createGenesisLivingSaveEnvelope } from '@/morpheus-app/store/livingSaveCoordinator';
import { createAppStore } from '@/morpheus-app/store/store';
import type { AppStore } from '@/morpheus-app/store/store';
import type { VolatileRuntimePolicy } from './runtimePolicy';

function createVolatileCatalog(): LivingSaveCatalog {
  return {
    format: LIVING_SAVE_CATALOG_FORMAT,
    schemaVersion: LIVING_SAVE_CATALOG_SCHEMA_VERSION,
    revision: 0,
    activeSlotId: null,
    slots: {
      'slot-1': { kind: 'empty', slotId: 'slot-1', revision: 0 },
      'slot-2': { kind: 'empty', slotId: 'slot-2', revision: 0 },
      'slot-3': { kind: 'empty', slotId: 'slot-3', revision: 0 },
    },
    tombstones: {},
  };
}

export type VolatileSceneRuntime = Readonly<{
  policy: VolatileRuntimePolicy;
  store: AppStore;
}>;

export function createVolatileSceneRuntime({
  policy,
  scene,
}: {
  policy: VolatileRuntimePolicy;
  scene: Scene;
}): VolatileSceneRuntime {
  if (scene.sceneId !== policy.directSceneId) {
    throw new Error(
      `Scene ${scene.sceneId} does not match direct-entry scene ${policy.directSceneId}`,
    );
  }

  const store = createAppStore();
  store.dispatch(
    installLivingSaveRuntime({
      operationId: `${policy.mode}-initialization`,
      catalog: createVolatileCatalog(),
      slotId: null,
      envelope: {
        ...createGenesisLivingSaveEnvelope(),
        activeSceneId: scene.sceneId,
        returnSceneId: null,
      },
      activeScene: scene,
      returnScene: null,
      saveHealth: 'volatile',
      skipSceneEntryActions: false,
    }),
  );

  return Object.freeze({ policy, store });
}
