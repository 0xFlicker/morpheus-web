import { describe, expect, it } from 'vitest';

import {
  chooseActiveSceneMedia,
  MAX_ACTIVE_SCENE_MEDIA,
} from './sceneMediaActivation';

describe('chooseActiveSceneMedia', () => {
  it('caps active media and favors focus, then recent proximity', () => {
    const candidates = Array.from(
      { length: MAX_ACTIVE_SCENE_MEDIA + 5 },
      (_, index) => ({
        id: String(index),
        focused: index === 0,
        nearViewport: true,
        sequence: index,
      }),
    );

    const active = chooseActiveSceneMedia(candidates);

    expect(active).toHaveLength(MAX_ACTIVE_SCENE_MEDIA);
    expect(active[0]).toBe('0');
    expect(active).toContain(String(candidates.length - 1));
    expect(active).not.toContain('1');
  });

  it('drops detached candidates from the active set', () => {
    expect(
      chooseActiveSceneMedia([
        { id: 'near', focused: false, nearViewport: true, sequence: 2 },
        { id: 'far', focused: false, nearViewport: false, sequence: 3 },
      ]),
    ).toEqual(['near']);
  });

  it('rejects an invalid decoder budget', () => {
    expect(() => chooseActiveSceneMedia([], 0)).toThrow(
      'Invalid scene media activation limit',
    );
  });
});
