export type SceneDirectoryFilter =
  | 'all'
  | 'panorama'
  | 'special'
  | 'transition'
  | 'puzzle';

export type SceneDirectoryFilterRow = Readonly<{
  sceneId: number;
  type: 'panorama' | 'special';
  subtype?: 'transition' | 'puzzle';
}>;

export function normalizeSceneQuery(query: string): string {
  return query.trim();
}

export function matchesSceneDirectoryFilters(
  scene: SceneDirectoryFilterRow,
  query: string,
  filter: SceneDirectoryFilter,
): boolean {
  const normalizedQuery = normalizeSceneQuery(query);
  const matchesQuery =
    normalizedQuery === '' || String(scene.sceneId).includes(normalizedQuery);
  const matchesType =
    filter === 'all' || scene.type === filter || scene.subtype === filter;

  return matchesQuery && matchesType;
}

export function filterSceneDirectory(
  scenes: readonly SceneDirectoryFilterRow[],
  query: string,
  filter: SceneDirectoryFilter,
): readonly SceneDirectoryFilterRow[] {
  return scenes.filter((scene) =>
    matchesSceneDirectoryFilters(scene, query, filter),
  );
}
