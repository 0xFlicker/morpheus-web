import { describe, expect, it } from 'vitest';

import {
  SCENE_PREVIEW_LONG_PRESS_MS,
  MAX_RETAINED_SCENE_PREVIEWS,
  shouldPlayScenePreview,
} from './scenePreviewPlayback';

describe('shouldPlayScenePreview', () => {
  it('keeps previews still without deliberate interaction', () => {
    expect(
      shouldPlayScenePreview({
        hovered: false,
        longPressed: false,
        reduceMotion: false,
      }),
    ).toBe(false);
  });

  it('plays for hover or a completed long press', () => {
    expect(
      shouldPlayScenePreview({
        hovered: true,
        longPressed: false,
        reduceMotion: false,
      }),
    ).toBe(true);
    expect(
      shouldPlayScenePreview({
        hovered: false,
        longPressed: true,
        reduceMotion: false,
      }),
    ).toBe(true);
  });

  it('keeps previews still when reduced motion is requested', () => {
    expect(
      shouldPlayScenePreview({
        hovered: true,
        longPressed: true,
        reduceMotion: true,
      }),
    ).toBe(false);
  });

  it('uses a deliberate half-second touch threshold', () => {
    expect(SCENE_PREVIEW_LONG_PRESS_MS).toBe(500);
  });

  it('bounds retained movie decoders as visitors explore', () => {
    expect(MAX_RETAINED_SCENE_PREVIEWS).toBe(24);
  });
});
