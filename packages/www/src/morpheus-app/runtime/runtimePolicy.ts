export type FullGameRuntimePolicy = Readonly<{
  mode: 'fullGame';
  persistence: 'living-save';
  sceneUrl: 'stable';
  menus: true;
}>;

export type ExplorerRuntimePolicy = Readonly<{
  mode: 'explorer';
  persistence: 'none';
  sceneUrl: 'replace';
  menus: false;
  directSceneId: number;
}>;

export type ToolingRuntimePolicy = Readonly<{
  mode: 'tooling';
  persistence: 'none';
  sceneUrl: 'none';
  menus: false;
  directSceneId: number;
}>;

export type VolatileRuntimePolicy =
  | ExplorerRuntimePolicy
  | ToolingRuntimePolicy;

export type RuntimePolicy = FullGameRuntimePolicy | VolatileRuntimePolicy;

export const fullGameRuntimePolicy: FullGameRuntimePolicy = Object.freeze({
  mode: 'fullGame',
  persistence: 'living-save',
  sceneUrl: 'stable',
  menus: true,
});

function directSceneId(sceneId: number): number {
  if (!Number.isSafeInteger(sceneId) || sceneId <= 0) {
    throw new Error(`Invalid direct-entry scene ID: ${sceneId}`);
  }
  return sceneId;
}

export function explorerRuntimePolicy(sceneId: number): ExplorerRuntimePolicy {
  return Object.freeze({
    mode: 'explorer',
    persistence: 'none',
    sceneUrl: 'replace',
    menus: false,
    directSceneId: directSceneId(sceneId),
  });
}

export function toolingRuntimePolicy(sceneId: number): ToolingRuntimePolicy {
  return Object.freeze({
    mode: 'tooling',
    persistence: 'none',
    sceneUrl: 'none',
    menus: false,
    directSceneId: directSceneId(sceneId),
  });
}

export function isPersistentRuntime(
  policy: RuntimePolicy,
): policy is FullGameRuntimePolicy {
  return policy.persistence === 'living-save';
}
