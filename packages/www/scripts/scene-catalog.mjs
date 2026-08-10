import { createHash } from 'node:crypto';

export const SCENE_CATALOG_SCHEMA_VERSION = 1;

const KNOWN_SCENE_TYPES = new Set([1, 2, 3, 4, 5, 6, 7, 8]);
const TEST_TYPES = {
  0: 'equalTo',
  1: 'notEqualTo',
  2: 'greaterThan',
  3: 'lessThan',
};
const VISUAL_CAST_TYPES = new Set([
  'PanoCast',
  'PanoAnim',
  'MovieSpecialCast',
  'ControlledMovieCast',
]);

export function createGamestatesById(initialStates) {
  const states = new Map();
  for (const gamestate of initialStates) {
    states.set(Number(gamestate.stateId), gamestate);
  }
  return {
    byId(id) {
      return states.get(Number(id));
    },
  };
}

export function fetchInitialFromMap(mapEntries) {
  return mapEntries
    .filter((entry) => entry.type === 'GameState')
    .map((entry) => entry.data);
}

function comparatorMatches(comparator, gamestates) {
  const gamestate = gamestates.byId(comparator.gameStateId);
  if (!gamestate) {
    throw new Error(
      `Missing gamestate ${comparator.gameStateId} referenced by a cast comparator`,
    );
  }

  switch (TEST_TYPES[comparator.testType]) {
    case 'equalTo':
      return gamestate.value === comparator.value;
    case 'notEqualTo':
      return gamestate.value !== comparator.value;
    case 'greaterThan':
      return gamestate.value > comparator.value;
    case 'lessThan':
      return gamestate.value < comparator.value;
    default:
      return true;
  }
}

/** Mirrors the engine's fresh-state cast activation rule. */
export function isCastActive({ cast, gamestates }) {
  const { initiallyEnabled = true, comparators = [] } = cast;
  const comparatorsMatch = comparators.every((comparator) =>
    comparatorMatches(comparator, gamestates),
  );
  return initiallyEnabled ? comparatorsMatch : !comparatorsMatch;
}

function castLookup(mapEntries) {
  const casts = new Map();
  for (const entry of mapEntries) {
    const castId = Number(entry.data?.castId);
    if (!Number.isSafeInteger(castId)) {
      continue;
    }
    casts.set(castId, { ...entry.data, __t: entry.type });
  }
  return casts;
}

function resolveSceneData(sceneData, casts) {
  return {
    ...sceneData,
    sceneId: Number(sceneData.sceneId),
    sceneType: Number(sceneData.sceneType ?? 0),
    casts: (sceneData.casts ?? []).map((cast) => {
      const castId = Number(cast?.ref?.castId);
      return casts.get(castId) ?? cast;
    }),
  };
}

export function resolveSceneFromMap(mapEntries, sceneId) {
  const sceneEntry = mapEntries.find(
    (entry) =>
      entry.type === 'Scene' && Number(entry.data?.sceneId) === Number(sceneId),
  );
  if (!sceneEntry) {
    return null;
  }
  return resolveSceneData(sceneEntry.data, castLookup(mapEntries));
}

export function listSceneIds(mapEntries) {
  const sceneIds = [];
  for (const entry of mapEntries) {
    if (entry.type !== 'Scene') {
      continue;
    }
    const sceneId = Number(entry.data?.sceneId);
    if (sceneId === 0) {
      continue;
    }
    if (!Number.isSafeInteger(sceneId) || sceneId < 0) {
      throw new Error(
        `Invalid authored scene ID ${String(entry.data?.sceneId)}`,
      );
    }
    sceneIds.push(sceneId);
  }
  return sceneIds.sort((left, right) => left - right);
}

export function getActiveVisualCasts(scene, gamestates) {
  return (scene.casts ?? []).filter((cast) => {
    if (!cast || typeof cast !== 'object' || !VISUAL_CAST_TYPES.has(cast.__t)) {
      return false;
    }
    return isCastActive({ cast, gamestates });
  });
}

export function classifySceneKind(activeVisualCasts) {
  return activeVisualCasts.some((cast) => cast.__t === 'PanoCast')
    ? 'pano'
    : 'special';
}

function classifyCatalogScene(scene, gamestates, authoredSceneIds) {
  if (!KNOWN_SCENE_TYPES.has(scene.sceneType)) {
    throw new Error(
      `Unknown scene type ${scene.sceneType} for scene ${scene.sceneId}`,
    );
  }

  if (scene.sceneType === 1) {
    return {
      sceneId: scene.sceneId,
      sceneType: scene.sceneType,
      type: 'panorama',
    };
  }

  const row = {
    sceneId: scene.sceneId,
    sceneType: scene.sceneType,
    type: 'special',
  };

  if (scene.sceneType !== 3) {
    return row;
  }

  const activeVisualCasts = getActiveVisualCasts(scene, gamestates);

  // Controlled movie callbacks bind player-adjustable frames to gamestate.
  if (
    activeVisualCasts.some(
      (cast) =>
        cast.__t === 'ControlledMovieCast' &&
        Array.isArray(cast.controlledMovieCallbacks) &&
        cast.controlledMovieCallbacks.length > 0,
    )
  ) {
    return { ...row, subtype: 'puzzle' };
  }

  // A one-shot visual movie leading to another authored scene is a transition.
  if (
    activeVisualCasts.some(
      (cast) =>
        cast.__t === 'MovieSpecialCast' &&
        cast.audioOnly !== true &&
        cast.image !== true &&
        cast.looping !== true &&
        authoredSceneIds.has(Number(cast.nextSceneId)),
    )
  ) {
    return { ...row, subtype: 'transition' };
  }

  return row;
}

function sourceDigest(mapSource) {
  return createHash('sha256').update(mapSource).digest('hex');
}

export function generateSceneCatalogFromSource(mapSource) {
  const mapEntries = JSON.parse(mapSource);
  if (!Array.isArray(mapEntries)) {
    throw new Error('Morpheus map must be a JSON array');
  }

  const casts = castLookup(mapEntries);
  const gamestates = createGamestatesById(fetchInitialFromMap(mapEntries));
  const authoredSceneIds = new Set(listSceneIds(mapEntries));
  const scenes = [];
  const seenSceneIds = new Set();

  for (const entry of mapEntries) {
    if (entry.type !== 'Scene') {
      continue;
    }
    const sceneId = Number(entry.data?.sceneId);
    if (sceneId === 0) {
      continue;
    }
    if (!Number.isSafeInteger(sceneId) || sceneId < 0) {
      throw new Error(
        `Invalid authored scene ID ${String(entry.data?.sceneId)}`,
      );
    }
    if (seenSceneIds.has(sceneId)) {
      throw new Error(`Duplicate scene ID ${sceneId}`);
    }
    seenSceneIds.add(sceneId);
    scenes.push(
      classifyCatalogScene(
        resolveSceneData(entry.data, casts),
        gamestates,
        authoredSceneIds,
      ),
    );
  }

  scenes.sort((left, right) => left.sceneId - right.sceneId);

  return {
    schemaVersion: SCENE_CATALOG_SCHEMA_VERSION,
    sourceDigest: sourceDigest(mapSource),
    sceneCount: scenes.length,
    scenes,
  };
}

export function serializeSceneCatalog(catalog) {
  return `${JSON.stringify(catalog)}\n`;
}

export function assertCatalogCurrent({ catalogText, mapSource }) {
  const expected = serializeSceneCatalog(
    generateSceneCatalogFromSource(mapSource),
  );
  if (catalogText !== expected) {
    throw new Error(
      'Scene catalog is stale. Run the catalog write command and commit the result.',
    );
  }
}
