/**
 * Offline scene inventory + content-hash manifest for OG GIF pre-generation.
 *
 * Enumerates every Scene in morpheus.map.json, applies fresh-start gamestate
 * activation (fetchInitial + isCastActive), classifies pano vs special, and
 * hashes active media inputs for dirty-set rebuilds.
 */

import { createHash } from 'node:crypto';
import { access, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEFAULT_GAMEDB_SOURCE } from './gamedb-paths.mjs';
import {
  assertCatalogCurrent,
  classifySceneKind,
  createGamestatesById,
  fetchInitialFromMap,
  generateSceneCatalogFromSource,
  getActiveVisualCasts,
  isCastActive,
  listSceneIds,
  resolveSceneFromMap,
  serializeSceneCatalog,
} from './scene-catalog.mjs';

export {
  classifySceneKind,
  createGamestatesById,
  fetchInitialFromMap,
  getActiveVisualCasts,
  isCastActive,
  listSceneIds,
  resolveSceneFromMap,
};

const packageDirectory = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_MAP_PATH = path.resolve(
  packageDirectory,
  '../../morpheus/client/js/service/morpheus.map.json',
);
const DEFAULT_MANIFEST_PATH = path.resolve(
  packageDirectory,
  '../.scene-previews/manifest.json',
);
const DEFAULT_CATALOG_PATH = path.resolve(
  packageDirectory,
  '../src/generated/sceneCatalog.json',
);

/** Bump when capture/encode policy changes invalidates all rows. */
export const PREVIEW_POLICY_VERSION = 'og-gif-v4-60fps';

/**
 * Map cast fileName (GameDB/Deck1/foo) to candidate files under the GameDB root.
 */
export function mediaCandidatesForCast(cast, gameDbRoot) {
  const fileName = cast.fileName;
  if (!fileName || typeof fileName !== 'string') {
    return [];
  }
  const relative = fileName.replace(/^GameDB\//, '');
  const base = path.join(gameDbRoot, relative);
  const type = cast.__t;
  if (type === 'PanoCast') {
    return [`${base}.png`, base];
  }
  if (
    type === 'PanoAnim' ||
    type === 'MovieSpecialCast' ||
    type === 'ControlledMovieCast'
  ) {
    return [`${base}.webm`, `${base}.mp4`, `${base}.png`, `${base}.webm`, base];
  }
  return [base, `${base}.png`, `${base}.webm`, `${base}.mp4`];
}

export async function resolveMediaPath(cast, gameDbRoot) {
  for (const candidate of mediaCandidatesForCast(cast, gameDbRoot)) {
    try {
      await access(candidate);
      const stats = await stat(candidate);
      if (stats.isFile()) {
        return candidate;
      }
    } catch {
      // try next
    }
  }
  return null;
}

export async function hashFile(filePath) {
  const data = await readFile(filePath);
  return createHash('sha256').update(data).digest('hex').slice(0, 16);
}

export function hashString(value) {
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}

export async function buildSceneRow({
  scene,
  gamestates,
  gameDbRoot,
  policyVersion = PREVIEW_POLICY_VERSION,
  kind: catalogKind,
}) {
  const activeVisualCasts = getActiveVisualCasts(scene, gamestates);
  const kind = catalogKind ?? classifySceneKind(activeVisualCasts);
  const activeCastIds = activeVisualCasts
    .map((cast) => Number(cast.castId))
    .filter((id) => !Number.isNaN(id))
    .sort((a, b) => a - b);

  const media = [];
  let missingMedia = false;
  for (const cast of activeVisualCasts) {
    const mediaPath = await resolveMediaPath(cast, gameDbRoot);
    if (!mediaPath) {
      missingMedia = true;
      media.push({
        castId: cast.castId,
        __t: cast.__t,
        fileName: cast.fileName ?? null,
        path: null,
        digest: null,
      });
      continue;
    }
    const digest = await hashFile(mediaPath);
    media.push({
      castId: cast.castId,
      __t: cast.__t,
      fileName: cast.fileName ?? null,
      path: mediaPath,
      digest,
    });
  }

  const hashPayload = JSON.stringify({
    sceneId: scene.sceneId,
    sceneType: scene.sceneType,
    kind,
    activeCastIds,
    mediaDigests: media.map((item) => item.digest).filter(Boolean),
    policyVersion,
  });
  const inputHash = hashString(hashPayload);

  return {
    sceneId: scene.sceneId,
    sceneType: scene.sceneType,
    kind,
    activeCastIds,
    media,
    missingMedia,
    policyVersion,
    inputHash,
    previewPath: `previews/scenes/${scene.sceneId}.gif`,
  };
}

export async function buildInventory({
  mapPath = DEFAULT_MAP_PATH,
  gameDbRoot = DEFAULT_GAMEDB_SOURCE,
  policyVersion = PREVIEW_POLICY_VERSION,
  sceneIds = null,
  catalog = null,
  catalogPath = DEFAULT_CATALOG_PATH,
} = {}) {
  const raw = await readFile(mapPath, 'utf8');
  const mapEntries = JSON.parse(raw);
  const initial = fetchInitialFromMap(mapEntries);
  const gamestates = createGamestatesById(initial);
  const generatedCatalog = generateSceneCatalogFromSource(raw);
  let authoritativeCatalog = catalog;

  if (authoritativeCatalog) {
    if (
      serializeSceneCatalog(authoritativeCatalog) !==
      serializeSceneCatalog(generatedCatalog)
    ) {
      throw new Error('Scene catalog does not match the authoritative map');
    }
  } else {
    const catalogText = await readFile(catalogPath, 'utf8');
    assertCatalogCurrent({ catalogText, mapSource: raw });
    authoritativeCatalog = JSON.parse(catalogText);
  }

  const catalogIds = authoritativeCatalog.scenes.map((scene) => scene.sceneId);
  const catalogIdSet = new Set(catalogIds);
  const catalogById = new Map(
    authoritativeCatalog.scenes.map((scene) => [scene.sceneId, scene]),
  );
  const targets = sceneIds?.length ? sceneIds : catalogIds;
  for (const sceneId of targets) {
    if (!catalogIdSet.has(sceneId)) {
      throw new Error(`Scene ${sceneId} is not in the authoritative catalog`);
    }
  }

  const scenes = [];
  for (const sceneId of targets) {
    const scene = resolveSceneFromMap(mapEntries, sceneId);
    if (!scene) {
      scenes.push({
        sceneId,
        error: 'scene_not_found',
        inputHash: null,
      });
      continue;
    }
    scenes.push(
      await buildSceneRow({
        scene,
        gamestates,
        gameDbRoot,
        policyVersion,
        kind: catalogById.get(sceneId).type === 'panorama' ? 'pano' : 'special',
      }),
    );
  }

  return {
    generatedAt: new Date().toISOString(),
    policyVersion,
    mapPath,
    gameDbRoot,
    sceneCount: scenes.length,
    scenes,
  };
}

export function computeDirtySet(
  previousManifest,
  nextInventory,
  { completedSceneIds = null } = {},
) {
  const previousById = new Map(
    (previousManifest?.scenes ?? [])
      .filter((row) => row.inputHash)
      .map((row) => [row.sceneId, row]),
  );
  const resultById = new Map(
    (previousManifest?.results ?? []).map((row) => [row.sceneId, row]),
  );
  const hasGenerationResults = Array.isArray(previousManifest?.results);
  const dirty = [];
  const clean = [];
  for (const row of nextInventory.scenes) {
    if (!row.inputHash) {
      dirty.push(row);
      continue;
    }
    const prev = previousById.get(row.sceneId);
    const previousResult = resultById.get(row.sceneId);
    const resultIsCurrent =
      !hasGenerationResults ||
      (previousResult?.status === 'ok' &&
        previousResult.inputHash === row.inputHash);
    const outputsAreComplete =
      completedSceneIds === null || completedSceneIds.has(row.sceneId);
    if (
      !prev ||
      prev.inputHash !== row.inputHash ||
      !resultIsCurrent ||
      !outputsAreComplete
    ) {
      dirty.push(row);
    } else {
      clean.push(row);
    }
  }
  return { dirty, clean };
}

export function parseArguments(argv = process.argv.slice(2)) {
  const options = {
    mapPath: DEFAULT_MAP_PATH,
    gameDbRoot: DEFAULT_GAMEDB_SOURCE,
    manifestPath: DEFAULT_MANIFEST_PATH,
    write: false,
    sceneIds: null,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--map' && argv[i + 1]) {
      options.mapPath = path.resolve(argv[++i]);
    } else if (arg === '--gamedb' && argv[i + 1]) {
      options.gameDbRoot = path.resolve(argv[++i]);
    } else if (arg === '--manifest' && argv[i + 1]) {
      options.manifestPath = path.resolve(argv[++i]);
    } else if (arg === '--write') {
      options.write = true;
    } else if (arg === '--scene' && argv[i + 1]) {
      options.sceneIds = options.sceneIds ?? [];
      options.sceneIds.push(Number(argv[++i]));
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    }
  }
  return options;
}

async function main() {
  const options = parseArguments();
  if (options.help) {
    process.stdout
      .write(`Usage: node scripts/scene-preview-inventory.mjs [options]

Options:
  --map <path>       Path to morpheus.map.json
  --gamedb <path>    GameDB root
  --manifest <path>  Manifest output/input path
  --write            Write inventory to --manifest
  --scene <id>       Limit to scene id (repeatable)
`);
    return;
  }

  let previous = null;
  try {
    previous = JSON.parse(await readFile(options.manifestPath, 'utf8'));
  } catch {
    previous = null;
  }

  const inventory = await buildInventory({
    mapPath: options.mapPath,
    gameDbRoot: options.gameDbRoot,
    sceneIds: options.sceneIds,
  });
  const { dirty, clean } = computeDirtySet(previous, inventory);

  const summary = {
    ...inventory,
    dirtyCount: dirty.length,
    cleanCount: clean.length,
    dirtySceneIds: dirty.map((row) => row.sceneId),
  };

  if (options.write) {
    const { mkdir } = await import('node:fs/promises');
    await mkdir(path.dirname(options.manifestPath), { recursive: true });
    await writeFile(
      options.manifestPath,
      `${JSON.stringify(inventory, null, 2)}\n`,
      'utf8',
    );
  }

  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

const isDirectRun =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
