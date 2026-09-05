'use client';

import {
  createContext,
  useContext,
  useState,
  type PropsWithChildren,
} from 'react';
import { Provider } from 'react-redux';
import { CloudProvider } from '@/morpheus-app/cloud/CloudProvider';
import type { Scene } from 'morpheus/casts/types';

import { LivingSaveCheckpointProvider } from '@/morpheus-app/store/LivingSaveCheckpointContext';
import { LivingSaveCoordinatorProvider } from '@/morpheus-app/store/LivingSaveCoordinatorContext';
import { createBrowserLivingSaveCheckpointCoordinator } from '@/morpheus-app/store/livingSaveCheckpoint';
import type { LivingSaveCoordinator } from '@/morpheus-app/store/livingSaveCoordinator';
import { createAppStore } from '@/morpheus-app/store/store';
import type { AppStore } from '@/morpheus-app/store/store';
import type {
  FullGameRuntimePolicy,
  RuntimePolicy,
  VolatileRuntimePolicy,
} from './runtimePolicy';
import { createVolatileSceneRuntime } from './volatileSceneRuntime';

type FullGameRuntimeProviderProps = PropsWithChildren<{
  policy: FullGameRuntimePolicy;
  cloudEnabled?: boolean;
  createLivingSaveCoordinator: (store: AppStore) => LivingSaveCoordinator;
  scene?: never;
}>;

type VolatileRuntimeProviderProps = PropsWithChildren<{
  policy: VolatileRuntimePolicy;
  cloudEnabled?: never;
  scene: Scene;
  createLivingSaveCoordinator?: never;
}>;

export type RuntimeProviderProps =
  | FullGameRuntimeProviderProps
  | VolatileRuntimeProviderProps;

const RuntimePolicyContext = createContext<RuntimePolicy | null>(null);

type OwnedRuntime = {
  policy: RuntimePolicy;
  store: AppStore;
  livingSaveCoordinator: LivingSaveCoordinator | null;
};

function createOwnedRuntime(props: RuntimeProviderProps): OwnedRuntime {
  if (props.policy.mode === 'fullGame') {
    const createCoordinator = props.createLivingSaveCoordinator;
    if (createCoordinator === undefined) {
      throw new Error('Full-game runtime requires a living-save coordinator');
    }
    const store = createAppStore();
    return {
      policy: props.policy,
      store,
      livingSaveCoordinator: createCoordinator(store),
    };
  }

  const scene = props.scene;
  if (scene === undefined) {
    throw new Error('Volatile runtime requires its direct-entry scene');
  }
  const runtime = createVolatileSceneRuntime({
    policy: props.policy,
    scene,
  });
  return {
    ...runtime,
    livingSaveCoordinator: null,
  };
}

/**
 * Owns one runtime for its mounted route lifetime. Direct entry and Reset must
 * replace this component with a new React key so child media/timers remount too.
 */
export function RuntimeProvider(props: RuntimeProviderProps) {
  const [runtime] = useState(() => createOwnedRuntime(props));
  const [checkpointCoordinator] = useState(() =>
    runtime.policy.mode === 'fullGame'
      ? createBrowserLivingSaveCheckpointCoordinator(runtime.store)
      : null,
  );

  const content = (
    <LivingSaveCheckpointProvider coordinator={checkpointCoordinator}>
      {props.children}
    </LivingSaveCheckpointProvider>
  );

  return (
    <RuntimePolicyContext.Provider value={runtime.policy}>
      <Provider store={runtime.store}>
        {runtime.livingSaveCoordinator === null ? (
          content
        ) : (
          <LivingSaveCoordinatorProvider
            coordinator={runtime.livingSaveCoordinator}
          >
            {props.cloudEnabled && checkpointCoordinator !== null ? (
              <CloudProvider
                store={runtime.store}
                coordinator={runtime.livingSaveCoordinator}
                checkpointCoordinator={checkpointCoordinator}
              >
                {content}
              </CloudProvider>
            ) : (
              content
            )}
          </LivingSaveCoordinatorProvider>
        )}
      </Provider>
    </RuntimePolicyContext.Provider>
  );
}

export function useRuntimePolicy(): RuntimePolicy {
  const policy = useContext(RuntimePolicyContext);
  if (policy === null) {
    throw new Error('useRuntimePolicy must be used inside RuntimeProvider');
  }
  return policy;
}
