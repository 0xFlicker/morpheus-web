import { describe, expect, it } from 'vitest';

import {
  PANO_ENTRY_YAW3600,
  panoCaptureYawSequence,
} from './CaptureSession';

/**
 * CaptureSession is browser/WebGL heavy; pure helpers are covered here.
 */
describe('pano capture yaw', () => {
  it('starts at engine entry heading 1500 and covers a full revolution', () => {
    expect(PANO_ENTRY_YAW3600).toBe(1500);
    const yaws = panoCaptureYawSequence(24);
    expect(yaws[0]).toBe(1500);
    expect(yaws).toHaveLength(24);
    // Last step is just shy of wrapping back to entry
    expect(yaws[yaws.length - 1]).toBe(
      Math.round(1500 + (23 * 3600) / 24) % 3600,
    );
    const unique = new Set(yaws);
    expect(unique.size).toBe(24);
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
