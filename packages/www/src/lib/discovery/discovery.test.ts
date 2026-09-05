import { describe, expect, it } from 'vitest';

import sceneCatalog from '@/generated/sceneCatalog.json';

import {
  DISCOVERY_CATALOG_VERSION,
  DISCOVERY_MAP_DIGEST,
  calculateDiscovery,
  evaluateAchievements,
  findDiscoveryLocation,
  getDiscoverySection,
  listDiscoveryLocations,
} from './index';

const allLocationScenes = listDiscoveryLocations().map(
  (location) => location.sceneIds[0],
);

describe('authored discovery catalog', () => {
  it('accounts for every authored panorama exactly once and pins the reviewed map', () => {
    expect(DISCOVERY_MAP_DIGEST).toBe(sceneCatalog.sourceDigest);
    const authoredPanoramas = sceneCatalog.scenes
      .filter((scene) => scene.sceneType === 1)
      .map((scene) => scene.sceneId);
    const scenes = listDiscoveryLocations().flatMap(
      (location) => location.sceneIds,
    );
    expect(new Set(scenes).size).toBe(scenes.length);
    expect(
      new Set(listDiscoveryLocations().map((location) => location.id)).size,
    ).toBe(227);
    expect(authoredPanoramas).toHaveLength(295);
    expect(
      scenes
        .filter((sceneId) => authoredPanoramas.includes(sceneId))
        .sort((a, b) => a - b),
    ).toEqual(authoredPanoramas);
    expect(
      scenes.filter((sceneId) => !authoredPanoramas.includes(sceneId)),
    ).toEqual([
      895051, 895052, 895053, 895054, 895055, 895056, 895057, 895058, 895065,
      895066,
    ]);
    for (const sceneId of scenes) {
      expect(
        sceneCatalog.scenes.some((scene) => scene.sceneId === sceneId),
      ).toBe(true);
    }
  });

  it('counts stable locations across lighting, elevator, and moving-platform states', () => {
    for (const group of [
      [2230, 2231],
      [6001, 6002, 6014],
      [7030, 7039],
      [7130, 7139],
      [7060, 7169, 7269],
    ]) {
      const progress = calculateDiscovery(group);
      expect(progress.overall.discovered).toBe(1);
      expect(progress.discoveredLocationIds).toHaveLength(1);
    }
    expect(findDiscoveryLocation(7030)?.id).not.toBe(
      findDiscoveryLocation(7130)?.id,
    );
  });

  it('separates ship facilities, the four dream worlds, and the ending', () => {
    const examples = [1050, 4310, 5210, 7000, 7600, 8500, 8000, 8900];
    expect(examples.map(getDiscoverySection)).toEqual([
      'ship',
      'ship',
      'ship',
      'voodoo',
      'harem',
      'waterfront',
      'carnival',
      'ending',
    ]);
    expect(
      calculateDiscovery([]).sections.map((section) => [
        section.id,
        section.total,
      ]),
    ).toEqual([
      ['ship', 144],
      ['voodoo', 13],
      ['harem', 23],
      ['waterfront', 33],
      ['carnival', 10],
      ['ending', 4],
    ]);
  });
});

describe('discovery calculations', () => {
  it('does not infer historical visits from a blank or resumed snapshot', () => {
    const empty = calculateDiscovery([]);
    expect(empty.overall).toEqual({ discovered: 0, total: 227, percent: 0 });
    expect(empty.completed).toBe(false);
    expect(calculateDiscovery([1050]).overall).toEqual({
      discovered: 1,
      total: 227,
      percent: 0.4,
    });
  });

  it('ignores duplicate visits, unknown scenes, transitions, puzzle frames, and menu credits', () => {
    const progress = calculateDiscovery([
      1050,
      1050,
      101004,
      700010,
      100000,
      100100,
      100201,
      -1,
      0,
      NaN,
      Infinity,
      1050.1,
      999999,
    ]);
    expect(progress.overall.discovered).toBe(1);
    expect(progress.completed).toBe(false);
    expect(getDiscoverySection(101004)).toBeUndefined();
    expect(findDiscoveryLocation(999999)).toBeUndefined();
  });

  it('produces the same result for any ordering of visits', () => {
    const visits = [1050, 7000, 895065, 2231, 2230];
    expect(calculateDiscovery(visits)).toEqual(
      calculateDiscovery([...visits].reverse()),
    );
  });

  it('marks story completion only when the ending sequence has reached narrative credits', () => {
    expect(
      calculateDiscovery([8900, 8910, 8950, 895050, 100201]).completed,
    ).toBe(false);
    expect(calculateDiscovery([895051]).completed).toBe(true);
    expect(calculateDiscovery([895065, 895066]).overall.discovered).toBe(1);
  });

  it('distinguishes story completion from discovering all locations', () => {
    expect(calculateDiscovery([895065]).overall.percent).toBeLessThan(100);
    const complete = calculateDiscovery(allLocationScenes);
    expect(complete.overall).toEqual({
      discovered: 227,
      total: 227,
      percent: 100,
    });
    expect(complete.sections.every((section) => section.percent === 100)).toBe(
      true,
    );
    expect(complete.completed).toBe(true);
    expect(
      calculateDiscovery(allLocationScenes.slice(1)).overall.percent,
    ).toBeLessThan(100);
  });
});

describe('admin achievement observations', () => {
  it('matches only observed location milestones and leaves blank saves empty', () => {
    expect(evaluateAchievements([])).toEqual([]);
    const achievements = evaluateAchievements([7000, 7600, 8500, 8000]);
    expect(achievements.map((achievement) => achievement.id)).toEqual([
      'first-location',
      'enter-voodoo',
      'enter-harem',
      'enter-waterfront',
      'enter-carnival',
      'all-dreams',
    ]);
    expect(
      achievements.every(
        (achievement) =>
          achievement.visibility === 'admin' && !achievement.verified,
      ),
    ).toBe(true);
  });

  it('cannot promote uploaded or imported evidence into verified achievements', () => {
    for (const source of ['played', 'imported'] as const) {
      const achievements = evaluateAchievements(allLocationScenes, source);
      expect(
        achievements.some((achievement) => achievement.id === 'all-locations'),
      ).toBe(true);
      expect(
        achievements.some((achievement) => achievement.id === 'reach-ending'),
      ).toBe(true);
      expect(
        achievements.every(
          (achievement) =>
            achievement.verified === false && achievement.source === source,
        ),
      ).toBe(true);
    }
  });
});
