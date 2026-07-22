import { describe, expect, it } from 'vitest';

import {
  PANO_AUTHORED_ENTRY_YAW3600,
  PANO_ENTRY_YAW3600,
  PANO_ENTRY_YAW_NUDGE,
  panoCaptureYawSequence,
} from './CaptureSession';

/**
 * CaptureSession is browser/WebGL heavy; pure helpers are covered here.
 */
describe('pano capture yaw', () => {
  it('puts former last sample first for static OG poster, full unique revolution', () => {
    expect(PANO_AUTHORED_ENTRY_YAW3600).toBe(1500);
    expect(PANO_ENTRY_YAW_NUDGE).toBe(75);
    expect(PANO_ENTRY_YAW3600).toBe(1425);
    const yaws = panoCaptureYawSequence(24);
    expect(yaws).toHaveLength(24);
    // Former last when starting at entry: entry + 23*step ≡ entry - step
    const step = 3600 / 24;
    const formerLast = Math.round(1425 - step + 3600) % 3600;
    expect(yaws[0]).toBe(formerLast);
    // Entry heading appears early in the loop (second sample)
    expect(yaws[1]).toBe(1425);
    expect(new Set(yaws).size).toBe(24);
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
