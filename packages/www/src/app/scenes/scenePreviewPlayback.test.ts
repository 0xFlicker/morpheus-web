import { describe, expect, it, vi } from 'vitest';

import {
  SCENE_PREVIEW_LONG_PRESS_MS,
  MAX_RETAINED_SCENE_PREVIEWS,
  SCENE_PREVIEW_SOURCE_TYPES,
  selectScenePreviewSource,
  shouldPlayScenePreview,
} from './scenePreviewPlayback';

const sources = {
  mp4: '/previews/scenes/1010.mp4',
  webm: '/previews/scenes/1010.webm',
};

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

describe('selectScenePreviewSource', () => {
  it('keeps WebM as the lazy source for compatible browsers', () => {
    const canPlayType = vi.fn((type: string) =>
      type === SCENE_PREVIEW_SOURCE_TYPES.webm ? 'probably' : '',
    );

    expect(selectScenePreviewSource(sources, canPlayType)).toEqual({
      kind: 'webm',
      src: sources.webm,
      type: SCENE_PREVIEW_SOURCE_TYPES.webm,
    });
    expect(canPlayType).toHaveBeenCalledWith(SCENE_PREVIEW_SOURCE_TYPES.webm);
  });

  it('falls back to the published MP4 when WebM is unsupported', () => {
    const canPlayType = vi.fn(() => '');

    expect(selectScenePreviewSource(sources, canPlayType)).toEqual({
      kind: 'mp4',
      src: sources.mp4,
      type: SCENE_PREVIEW_SOURCE_TYPES.mp4,
    });
  });
});
