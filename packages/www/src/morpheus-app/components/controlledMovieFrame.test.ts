import { describe, expect, it } from 'vitest';

import {
  calculateControlledFrameIndex,
  countOccupiedAtlasFrames,
} from '../../../../morpheus/client/js/morpheus/casts/hooks/useRenderables/transforms';

describe('controlled movie frame selection', () => {
  it('ignores transparent padding at the end of an extracted atlas', () => {
    const pixels = new Uint8ClampedArray(5 * 4);
    pixels[3] = 255;
    pixels[7] = 255;
    pixels[11] = 255;

    expect(countOccupiedAtlasFrames(pixels, 5)).toBe(3);
  });

  it('falls back to the full atlas when occupancy cannot be detected', () => {
    expect(countOccupiedAtlasFrames(new Uint8ClampedArray(5 * 4), 5)).toBe(5);
  });

  it('uses authored cannon frame indexes without atlas interpolation', () => {
    const frameFor = (value: number) =>
      calculateControlledFrameIndex({
        value,
        frames: 1,
        frameCount: 240,
      });

    expect(frameFor(0)).toBe(0);
    expect(frameFor(7)).toBe(7);
    expect(frameFor(8)).toBe(8);
    expect(frameFor(63)).toBe(63);
  });

  it('keeps composite cannon values on their authored frame indexes', () => {
    const frameFor = (value: number) =>
      calculateControlledFrameIndex({
        value,
        frames: 1,
        frameCount: 240,
      });

    expect(frameFor(3)).toBe(3);
    expect(frameFor(11)).toBe(11);
  });

  it('uses authored launch lever frame indexes', () => {
    expect(
      calculateControlledFrameIndex({
        value: 8,
        frames: 1,
        frameCount: 33,
      }),
    ).toBe(8);
    expect(
      calculateControlledFrameIndex({
        value: 20,
        frames: 1,
        frameCount: 33,
      }),
    ).toBe(20);
  });

  it('keeps unrelated gamestates on direct frame sampling', () => {
    expect(
      calculateControlledFrameIndex({
        value: 1,
        frames: 1,
        frameCount: 12,
      }),
    ).toBe(1);
  });

  it('preserves direct frame indexing when the atlas already matches gamestate', () => {
    expect(
      calculateControlledFrameIndex({
        value: 8,
        frames: 1,
        frameCount: 64,
      }),
    ).toBe(8);
  });
});
