import { describe, expect, it } from 'vitest';
import sceneCatalog from '@/generated/sceneCatalog.json';
import catalog from './catalog.json';
import {
  DISCOVERY_MAP_DIGEST,
  calculateDiscovery,
  evaluateAchievements,
  findDiscoveryLocation,
  getDiscoverySection,
  listDiscoveryLocations,
  resolveDiscoveryObservation,
} from './index';

const locations = listDiscoveryLocations();
const allScenes = locations.map((location) => location.sceneIds[0]);

describe('approved authored discovery catalog', () => {
  it('accounts for every authored scene, with unique units and ordinary aliases', () => {
    expect(DISCOVERY_MAP_DIGEST).toBe(sceneCatalog.sourceDigest);
    expect(locations).toHaveLength(518);
    expect(new Set(locations.map((unit) => unit.id)).size).toBe(518);
    const ordinary = locations.flatMap((unit) => unit.sceneIds);
    expect(new Set(ordinary).size).toBe(ordinary.length);
    const accounted = [
      ...ordinary,
      ...catalog.otherScenes.map((scene) => scene.sceneId),
    ];
    expect(new Set(accounted).size).toBe(1844);
    expect(new Set(accounted)).toEqual(
      new Set([0, ...sceneCatalog.scenes.map((scene) => scene.sceneId)]),
    );
    for (const scene of sceneCatalog.scenes.filter(
      (scene) => scene.sceneType === 1,
    )) {
      expect(findDiscoveryLocation(scene.sceneId)).toBeDefined();
    }
    expect(
      calculateDiscovery([]).sections.map(({ id, total }) => [id, total]),
    ).toEqual([
      ['ship', 334],
      ['voodoo', 22],
      ['harem', 32],
      ['waterfront', 89],
      ['carnival', 34],
      ['ending', 7],
    ]);
  });

  it('groups only the approved repeat content and puzzle states', () => {
    for (const aliases of [
      [7030, 7130, 7060, 7169, 7269],
      [700011, 700031],
      [760050, 790010, 790035],
      [331030, 331031, 331040],
      [890071, 890079],
      [890050, 890060],
    ])
      expect(calculateDiscovery(aliases).overall.discovered).toBe(1);
    expect(
      calculateDiscovery(
        Array.from({ length: 9 }, (_, index) => 700011 + index),
      ).overall.discovered,
    ).toBe(9);
    expect(findDiscoveryLocation(890050)?.id).not.toBe(
      findDiscoveryLocation(890071)?.id,
    );
    expect(findDiscoveryLocation(807071)).toBeDefined();
  });

  it('resolves only visibly presented approved assets, including conditional shack interiors', () => {
    expect(resolveDiscoveryObservation(710050)).toEqual([]);
    expect(calculateDiscovery([710050]).overall.discovered).toBe(0);
    expect(getDiscoverySection(710050)).toBe('voodoo');
    for (const unit of catalog.units) {
      const scene = unit.sceneIds[0];
      expect(resolveDiscoveryObservation(scene, ['unrelated-overlay'])).toEqual(
        [],
      );
      expect(resolveDiscoveryObservation(scene, unit.assets)).toEqual([
        unit.id,
      ]);
      for (const conditional of unit.conditionalObservations ?? []) {
        expect(
          resolveDiscoveryObservation(conditional.sceneId, [
            conditional.visibleAsset,
          ]),
        ).toEqual([unit.id]);
      }
    }
  });
});

describe('journey discovery evidence', () => {
  it('preserves historical evidence without inferring unrecorded content', () => {
    expect(calculateDiscovery([]).overall).toEqual({
      discovered: 0,
      total: 518,
      percent: 0,
    });
    expect(calculateDiscovery([1050]).overall).toEqual({
      discovered: 1,
      total: 518,
      percent: 0.1,
    });
    const unit = locations[0];
    expect(
      calculateDiscovery([unit.sceneIds[0]], [unit.id, unit.id, 'invented'])
        .overall.discovered,
    ).toBe(1);
    expect(calculateDiscovery([], [unit.id]).overall.discovered).toBe(1);
  });
  it('deduplicates repeats and yields identical results regardless of evidence order', () => {
    const scenes = [1050, 7000, 2231, 2230, 1050];
    const ids = locations.slice(0, 5).map((unit) => unit.id);
    expect(calculateDiscovery(scenes, ids)).toEqual(
      calculateDiscovery([...scenes].reverse(), [...ids].reverse()),
    );
  });
  it('keeps narrative completion independent from the denominator and menu credits', () => {
    expect(calculateDiscovery([895050, 100201]).completed).toBe(false);
    expect(calculateDiscovery([895065, 895066])).toMatchObject({
      completed: true,
      overall: { discovered: 0 },
    });
    const all = calculateDiscovery(allScenes);
    expect(all.overall).toEqual({ discovered: 518, total: 518, percent: 100 });
    expect(all.completed).toBe(false);
    expect(calculateDiscovery([...allScenes, 895051]).completed).toBe(true);
    expect(calculateDiscovery(allScenes.slice(1)).overall.percent).toBeLessThan(
      100,
    );
  });
  it('keeps achievements as unverified admin observations', () => {
    expect(evaluateAchievements([])).toEqual([]);
    const achievements = evaluateAchievements(
      [895051],
      'imported',
      locations.map((unit) => unit.id),
    );
    expect(achievements.map((achievement) => achievement.id)).toContain(
      'all-locations',
    );
    expect(achievements.map((achievement) => achievement.id)).toContain(
      'reach-ending',
    );
    expect(
      achievements.every(
        (achievement) =>
          !achievement.verified &&
          achievement.visibility === 'admin' &&
          achievement.source === 'imported',
      ),
    ).toBe(true);
  });
});
