import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  assertCatalogCurrent,
  generateSceneCatalogFromSource,
  serializeSceneCatalog,
} from './scene-catalog.mjs';
import { runCatalogCommand } from './generate-scene-catalog.mjs';

function mapSource(overrides = []) {
  return JSON.stringify([
    {
      type: 'GameState',
      data: { stateId: 1, value: 0 },
    },
    {
      type: 'PanoCast',
      data: {
        castId: 101,
        fileName: 'GameDB/Deck1/roomPAN',
        initiallyEnabled: true,
        comparators: [],
      },
    },
    {
      type: 'MovieSpecialCast',
      data: {
        castId: 201,
        fileName: 'GameDB/Deck1/doorSPC',
        initiallyEnabled: true,
        comparators: [],
        nextSceneId: 1010,
        looping: false,
        audioOnly: false,
        image: false,
      },
    },
    {
      type: 'ControlledMovieCast',
      data: {
        castId: 301,
        fileName: 'GameDB/Deck1/puzzleCTL',
        initiallyEnabled: true,
        comparators: [],
        controlledMovieCallbacks: [{ gameState: 1, frames: 10 }],
      },
    },
    {
      type: 'MovieSpecialCast',
      data: {
        castId: 401,
        fileName: 'GameDB/Deck1/staticSPC',
        initiallyEnabled: true,
        comparators: [],
        nextSceneId: 0,
      },
    },
    {
      type: 'Scene',
      data: {
        sceneId: 4040,
        sceneType: 3,
        casts: [{ ref: { castId: 401 } }],
      },
    },
    {
      type: 'Scene',
      data: {
        sceneId: 2020,
        sceneType: 3,
        casts: [{ ref: { castId: 201 } }],
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
        sceneId: 3030,
        sceneType: 3,
        casts: [{ ref: { castId: 301 } }],
      },
    },
    {
      type: 'Scene',
      data: { sceneId: 0, sceneType: 3, casts: [] },
    },
    ...overrides,
  ]);
}

describe('scene catalog generation', () => {
  it('emits every playable scene once in stable numeric order', () => {
    const source = mapSource();
    const first = generateSceneCatalogFromSource(source);
    const second = generateSceneCatalogFromSource(source);

    expect(first.sceneCount).toBe(4);
    expect(first.scenes.map((scene) => scene.sceneId)).toEqual([
      1010, 2020, 3030, 4040,
    ]);
    expect(serializeSceneCatalog(first)).toBe(serializeSceneCatalog(second));
  });

  it('uses authored signals for broad types and proven subtypes', () => {
    const catalog = generateSceneCatalogFromSource(mapSource());

    expect(catalog.scenes).toEqual([
      { sceneId: 1010, sceneType: 1, type: 'panorama' },
      {
        sceneId: 2020,
        sceneType: 3,
        type: 'special',
        subtype: 'transition',
      },
      {
        sceneId: 3030,
        sceneType: 3,
        type: 'special',
        subtype: 'puzzle',
      },
      { sceneId: 4040, sceneType: 3, type: 'special' },
    ]);
  });

  it('does not call looping or sentinel-target movies transitions', () => {
    const catalog = generateSceneCatalogFromSource(
      mapSource([
        {
          type: 'MovieSpecialCast',
          data: {
            castId: 501,
            fileName: 'GameDB/Deck1/loopSPC',
            initiallyEnabled: true,
            comparators: [],
            nextSceneId: 1_073_741_823,
            looping: true,
            audioOnly: false,
            image: false,
          },
        },
        {
          type: 'Scene',
          data: {
            sceneId: 5050,
            sceneType: 3,
            casts: [{ ref: { castId: 501 } }],
          },
        },
      ]),
    );

    expect(catalog.scenes.at(-1)).toEqual({
      sceneId: 5050,
      sceneType: 3,
      type: 'special',
    });
  });

  it('rejects duplicate scene IDs', () => {
    expect(() =>
      generateSceneCatalogFromSource(
        mapSource([
          {
            type: 'Scene',
            data: { sceneId: 1010, sceneType: 1, casts: [] },
          },
        ]),
      ),
    ).toThrow(/duplicate scene id 1010/i);
  });

  it('rejects unknown authored scene types', () => {
    expect(() =>
      generateSceneCatalogFromSource(
        mapSource([
          {
            type: 'Scene',
            data: { sceneId: 5050, sceneType: 99, casts: [] },
          },
        ]),
      ),
    ).toThrow(/unknown scene type 99/i);
  });

  it('fails check mode when the source or committed bytes drift', () => {
    const source = mapSource();
    const catalogText = serializeSceneCatalog(
      generateSceneCatalogFromSource(source),
    );

    expect(() =>
      assertCatalogCurrent({ catalogText, mapSource: source }),
    ).not.toThrow();
    expect(() =>
      assertCatalogCurrent({ catalogText, mapSource: `${source}\n` }),
    ).toThrow(/scene catalog is stale/i);
    expect(() =>
      assertCatalogCurrent({
        catalogText: catalogText.replace('1010', '1011'),
        mapSource: source,
      }),
    ).toThrow(/scene catalog is stale/i);
  });

  it('writes and checks the committed artifact without rewriting in check mode', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'scene-catalog-'));
    const mapPath = path.join(directory, 'morpheus.map.json');
    const catalogPath = path.join(directory, 'sceneCatalog.json');
    await writeFile(mapPath, mapSource());

    try {
      await runCatalogCommand({
        mode: 'write',
        mapPath,
        catalogPath,
        log: () => {},
      });
      const written = await readFile(catalogPath, 'utf8');
      await runCatalogCommand({
        mode: 'check',
        mapPath,
        catalogPath,
        log: () => {},
      });
      expect(await readFile(catalogPath, 'utf8')).toBe(written);

      await writeFile(catalogPath, written.replace('1010', '1011'));
      await expect(
        runCatalogCommand({
          mode: 'check',
          mapPath,
          catalogPath,
          log: () => {},
        }),
      ).rejects.toThrow(/scene catalog is stale/i);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
