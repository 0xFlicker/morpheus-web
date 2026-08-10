import { describe, expect, it } from 'vitest';

import {
  filterScenes,
  findScene,
  getSceneTypeLabel,
  listScenes,
} from './sceneCatalog';

describe('sceneCatalog', () => {
  it('exposes the complete catalog in numeric order', () => {
    const scenes = listScenes();

    expect(scenes).toHaveLength(1843);
    expect(scenes[0]?.sceneId).toBe(1010);
    expect(scenes.at(-1)?.sceneId).toBe(895066);
    expect(
      scenes.every(
        (scene, index) =>
          index === 0 || scene.sceneId > scenes[index - 1].sceneId,
      ),
    ).toBe(true);
  });

  it('looks up only exact numeric scene IDs', () => {
    expect(findScene(1050)?.type).toBe('panorama');
    expect(findScene(1050.5)).toBeUndefined();
    expect(findScene(0)).toBeUndefined();
    expect(findScene(Number.MAX_SAFE_INTEGER)).toBeUndefined();
  });

  it('filters by ID text and deterministic type labels', () => {
    expect(
      filterScenes({ query: '1050' }).some((scene) => scene.sceneId === 1050),
    ).toBe(true);
    expect(
      filterScenes({ type: 'panorama' }).every(
        (scene) => scene.type === 'panorama',
      ),
    ).toBe(true);
    expect(
      filterScenes({ type: 'transition' }).every(
        (scene) => scene.subtype === 'transition',
      ),
    ).toBe(true);
    expect(
      filterScenes({ type: 'puzzle' }).every(
        (scene) => scene.subtype === 'puzzle',
      ),
    ).toBe(true);
  });

  it('uses public labels without exposing capture formats', () => {
    expect(getSceneTypeLabel({ type: 'panorama' })).toBe('Panorama');
    expect(getSceneTypeLabel({ type: 'special', subtype: 'transition' })).toBe(
      'Transition',
    );
    expect(getSceneTypeLabel({ type: 'special', subtype: 'puzzle' })).toBe(
      '2D Puzzle',
    );
    expect(getSceneTypeLabel({ type: 'special' })).toBe('Special Scene');
  });
});
