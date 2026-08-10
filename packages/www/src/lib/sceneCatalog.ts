import catalogDocument from '@/generated/sceneCatalog.json';

export type SceneCatalogType = 'panorama' | 'special';
export type SceneCatalogSubtype = 'transition' | 'puzzle';
export type SceneCatalogFilter = 'all' | SceneCatalogType | SceneCatalogSubtype;

export interface SceneCatalogEntry {
  readonly sceneId: number;
  readonly sceneType: number;
  readonly type: SceneCatalogType;
  readonly subtype?: SceneCatalogSubtype;
}

interface RawSceneCatalogEntry {
  sceneId: number;
  sceneType: number;
  type: string;
  subtype?: string;
}

function parseCatalogEntry(row: RawSceneCatalogEntry): SceneCatalogEntry {
  if (!Number.isSafeInteger(row.sceneId) || row.sceneId <= 0) {
    throw new Error(`Invalid generated scene ID: ${row.sceneId}`);
  }
  if (row.type !== 'panorama' && row.type !== 'special') {
    throw new Error(`Invalid generated scene type: ${row.type}`);
  }
  if (
    row.subtype !== undefined &&
    row.subtype !== 'transition' &&
    row.subtype !== 'puzzle'
  ) {
    throw new Error(`Invalid generated scene subtype: ${row.subtype}`);
  }

  return Object.freeze({
    sceneId: row.sceneId,
    sceneType: row.sceneType,
    type: row.type,
    ...(row.subtype === undefined ? {} : { subtype: row.subtype }),
  });
}

const scenes = Object.freeze(catalogDocument.scenes.map(parseCatalogEntry));
if (scenes.length !== catalogDocument.sceneCount) {
  throw new Error('Generated scene catalog count does not match its rows');
}

const scenesById = new Map(scenes.map((scene) => [scene.sceneId, scene]));

export function listScenes(): readonly SceneCatalogEntry[] {
  return scenes;
}

export function findScene(sceneId: number): SceneCatalogEntry | undefined {
  if (!Number.isSafeInteger(sceneId) || sceneId <= 0) {
    return undefined;
  }
  return scenesById.get(sceneId);
}

export function filterScenes({
  query = '',
  type = 'all',
}: {
  query?: string;
  type?: SceneCatalogFilter;
} = {}): readonly SceneCatalogEntry[] {
  const normalizedQuery = query.trim();
  return scenes.filter((scene) => {
    const matchesQuery =
      normalizedQuery.length === 0 ||
      String(scene.sceneId).includes(normalizedQuery);
    const matchesType =
      type === 'all' || scene.type === type || scene.subtype === type;
    return matchesQuery && matchesType;
  });
}

export function getSceneTypeLabel(
  scene: Pick<SceneCatalogEntry, 'type' | 'subtype'>,
): string {
  if (scene.subtype === 'transition') {
    return 'Transition';
  }
  if (scene.subtype === 'puzzle') {
    return '2D Puzzle';
  }
  return scene.type === 'panorama' ? 'Panorama' : 'Special Scene';
}
