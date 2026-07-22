import { describe, expect, it } from 'vitest';

import {
  PANO_AUTHORED_ENTRY_YAW3600,
  PANO_ENTRY_YAW3600,
  PANO_ENTRY_YAW_NUDGE,
  panoCaptureYawSequence,
  rotateFramesPosterFirst,
} from './CaptureSession';

/**
 * CaptureSession is browser/WebGL heavy; pure helpers are covered here.
 */
describe('pano capture yaw', () => {
  it('captures continuously from entry (no mid-orbit rewind)', () => {
    expect(PANO_AUTHORED_ENTRY_YAW3600).toBe(1500);
    expect(PANO_ENTRY_YAW_NUDGE).toBe(75);
    expect(PANO_ENTRY_YAW3600).toBe(1425);
    const yaws = panoCaptureYawSequence(240);
    expect(yaws[0]).toBe(1425);
    expect(yaws).toHaveLength(240);
    let wraps = 0;
    for (let i = 1; i < yaws.length; i += 1) {
      if (yaws[i] < yaws[i - 1]) {
        wraps += 1;
      }
    }
    expect(wraps).toBeLessThanOrEqual(1);
    expect(new Set(yaws).size).toBe(240);
  });

  it('moves last captured frame to front for static poster without reordering mid-spin', () => {
    const captured = ['a', 'b', 'c', 'd'];
    expect(rotateFramesPosterFirst(captured)).toEqual(['d', 'a', 'b', 'c']);
    // Live capture order unchanged
    expect(captured).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('CaptureSession runner contract', () => {
  it('documents the global result shape', () => {
    const example = {
      sceneId: 1010,
      kind: 'pano' as const,
      status: 'done' as const,
      frames: ['data:image/png;base64,AAA'],
      frameCount: 1,
      policyVersion: 'og-gif-v1',
    };
    expect(example.frameCount).toBe(example.frames.length);
    expect(['pano', 'special']).toContain(example.kind);
    expect(['booting', 'waiting_ready', 'capturing', 'done', 'failed']).toContain(
      example.status,
    );
  });
});
