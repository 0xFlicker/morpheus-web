import { describe, expect, it } from 'vitest';

import {
  filterSceneDirectory,
  matchesSceneDirectoryFilters,
  normalizeSceneQuery,
} from './sceneDirectoryFilters';

const scenes = [
  { sceneId: 1050, type: 'panorama' as const },
  { sceneId: 101004, type: 'special' as const, subtype: 'transition' as const },
  { sceneId: 202019, type: 'special' as const, subtype: 'puzzle' as const },
  { sceneId: 414052, type: 'special' as const },
];

describe('sceneDirectoryFilters', () => {
  it('normalizes surrounding whitespace', () => {
    expect(normalizeSceneQuery('  1050 ')).toBe('1050');
  });

  it('combines ID search with broad and proven subtype filters', () => {
    expect(filterSceneDirectory(scenes, '10', 'all')).toEqual(
      scenes.slice(0, 2),
    );
    expect(filterSceneDirectory(scenes, '', 'special')).toEqual(
      scenes.slice(1),
    );
    expect(filterSceneDirectory(scenes, '', 'transition')).toEqual([scenes[1]]);
    expect(filterSceneDirectory(scenes, '202', 'puzzle')).toEqual([scenes[2]]);
  });

  it('restores every scene when filters are clear', () => {
    expect(filterSceneDirectory(scenes, '', 'all')).toEqual(scenes);
  });

  it('does not assign an unproven subtype', () => {
    expect(matchesSceneDirectoryFilters(scenes[3], '', 'puzzle')).toBe(false);
    expect(matchesSceneDirectoryFilters(scenes[3], '', 'transition')).toBe(
      false,
    );
  });
});
