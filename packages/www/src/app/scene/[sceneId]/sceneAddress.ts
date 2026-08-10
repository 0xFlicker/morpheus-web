function validSceneId(sceneId: number): number {
  if (!Number.isSafeInteger(sceneId) || sceneId <= 0) {
    throw new Error(`Invalid scene ID: ${sceneId}`);
  }
  return sceneId;
}

export function sceneAddress(sceneId: number, search = ''): string {
  const suffix =
    search === '' || search.startsWith('?') ? search : `?${search}`;
  return `/scene/${validSceneId(sceneId)}${suffix}`;
}

export function replaceSceneAddress(
  sceneId: number,
  browserHistory: Pick<History, 'replaceState' | 'state'>,
  search: string,
): void {
  browserHistory.replaceState(
    browserHistory.state,
    '',
    sceneAddress(sceneId, search),
  );
}
