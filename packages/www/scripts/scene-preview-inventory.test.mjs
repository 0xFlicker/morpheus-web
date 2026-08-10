import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  buildInventory,
  buildSceneRow,
  classifySceneKind,
  computeDirtySet,
  createGamestatesById,
  fetchInitialFromMap,
  getActiveVisualCasts,
  isCastActive,
  listSceneIds,
  resolveSceneFromMap,
} from './scene-preview-inventory.mjs';
import { generateSceneCatalogFromSource } from './scene-catalog.mjs';

const temporaryDirectories = [];

async function createMapFixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'scene-preview-'));
  temporaryDirectories.push(root);
  const gameDb = path.join(root, 'GameDB');
  await mkdir(path.join(gameDb, 'Deck1'), { recursive: true });
  await writeFile(path.join(gameDb, 'Deck1', 'balcNWPAN.png'), 'pano-bytes');
  await writeFile(path.join(gameDb, 'Deck1', 'specialSPC.webm'), 'movie-bytes');

  const map = [
    {
      type: 'GameState',
      data: {
        stateId: 1,
        value: 0,
        maxValue: 1,
        minValue: 0,
        stateWraps: false,
      },
    },
    {
      type: 'PanoCast',
      data: {
        castId: 101,
        fileName: 'GameDB/Deck1/balcNWPAN',
        initiallyEnabled: true,
        comparators: [],
      },
    },
    {
      type: 'MovieSpecialCast',
      data: {
        castId: 201,
        fileName: 'GameDB/Deck1/specialSPC',
        initiallyEnabled: true,
        comparators: [],
      },
    },
    {
      type: 'MovieSpecialCast',
      data: {
        castId: 202,
        fileName: 'GameDB/Deck1/gatedSPC',
        initiallyEnabled: true,
        comparators: [{ gameStateId: 1, testType: 0, value: 1 }],
      },
    },
    {
      type: 'Scene',
      data: {
        sceneId: 1010,
        sceneType: 1,
        casts: [{ ref: { castId: 101 } }],
      },
    },
    {
      type: 'Scene',
      data: {
        sceneId: 2020,
        sceneType: 3,
        casts: [{ ref: { castId: 201 } }, { ref: { castId: 202 } }],
      },
    },
  ];

  const mapPath = path.join(root, 'morpheus.map.json');
  const source = JSON.stringify(map);
  await writeFile(mapPath, source);
  return {
    root,
    gameDb,
    mapPath,
    map,
    source,
    catalog: generateSceneCatalogFromSource(source),
  };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe('fresh-start activation', () => {
  it('matches equalTo comparators and initiallyEnabled invert', () => {
    const gamestates = createGamestatesById([{ stateId: 1, value: 0 }]);
    expect(
      isCastActive({
        cast: {
          initiallyEnabled: true,
          comparators: [{ gameStateId: 1, testType: 0, value: 0 }],
        },
        gamestates,
      }),
    ).toBe(true);
    expect(
      isCastActive({
        cast: {
          initiallyEnabled: true,
          comparators: [{ gameStateId: 1, testType: 0, value: 1 }],
        },
        gamestates,
      }),
    ).toBe(false);
    expect(
      isCastActive({
        cast: {
          initiallyEnabled: false,
          comparators: [{ gameStateId: 1, testType: 0, value: 0 }],
        },
        gamestates,
      }),
    ).toBe(false);
  });
});

describe('scene inventory', () => {
  it('lists scenes and classifies pano vs special under fresh-start', async () => {
    const { gameDb, mapPath, map, catalog } = await createMapFixture();
    const gamestates = createGamestatesById(fetchInitialFromMap(map));
    expect(listSceneIds(map)).toEqual([1010, 2020]);

    const pano = resolveSceneFromMap(map, 1010);
    const special = resolveSceneFromMap(map, 2020);
    expect(classifySceneKind(getActiveVisualCasts(pano, gamestates))).toBe(
      'pano',
    );
    expect(classifySceneKind(getActiveVisualCasts(special, gamestates))).toBe(
      'special',
    );

    const specialActive = getActiveVisualCasts(special, gamestates);
    expect(specialActive.map((c) => c.castId)).toEqual([201]);

    const inventory = await buildInventory({
      mapPath,
      gameDbRoot: gameDb,
      catalog,
    });
    expect(inventory.sceneCount).toBe(2);
    expect(inventory.scenes.map((s) => s.kind)).toEqual(['pano', 'special']);
    expect(inventory.scenes[1].activeCastIds).toEqual([201]);
    expect(inventory.scenes[1].missingMedia).toBe(false);
  });

  it('marks missing media without dropping the scene', async () => {
    const { gameDb, map } = await createMapFixture();
    const gamestates = createGamestatesById(fetchInitialFromMap(map));
    const scene = resolveSceneFromMap(map, 2020);
    // Remove special media
    const { unlink } = await import('node:fs/promises');
    await unlink(path.join(gameDb, 'Deck1', 'specialSPC.webm'));

    const row = await buildSceneRow({
      scene,
      gamestates,
      gameDbRoot: gameDb,
    });
    expect(row.missingMedia).toBe(true);
    expect(row.inputHash).toBeTruthy();
  });

  it('requires preview membership to match the shared catalog', async () => {
    const { gameDb, mapPath, catalog } = await createMapFixture();

    const inventory = await buildInventory({
      mapPath,
      gameDbRoot: gameDb,
      catalog,
    });
    expect(inventory.scenes.map((scene) => scene.sceneId)).toEqual(
      catalog.scenes.map((scene) => scene.sceneId),
    );

    await expect(
      buildInventory({
        mapPath,
        gameDbRoot: gameDb,
        catalog: { ...catalog, scenes: catalog.scenes.slice(1), sceneCount: 1 },
      }),
    ).rejects.toThrow(/catalog.*authoritative map/i);
  });

  it('dirty set only includes scenes whose input hash changed', async () => {
    const { gameDb, mapPath, catalog } = await createMapFixture();
    const first = await buildInventory({
      mapPath,
      gameDbRoot: gameDb,
      catalog,
    });
    const second = await buildInventory({
      mapPath,
      gameDbRoot: gameDb,
      catalog,
    });
    const { dirty, clean } = computeDirtySet(first, second);
    expect(dirty).toHaveLength(0);
    expect(clean).toHaveLength(2);

    await writeFile(
      path.join(gameDb, 'Deck1', 'balcNWPAN.png'),
      'pano-bytes-changed',
    );
    const third = await buildInventory({
      mapPath,
      gameDbRoot: gameDb,
      catalog,
    });
    const diff = computeDirtySet(second, third);
    expect(diff.dirty.map((s) => s.sceneId)).toEqual([1010]);
    expect(diff.clean.map((s) => s.sceneId)).toEqual([2020]);
  });
});
