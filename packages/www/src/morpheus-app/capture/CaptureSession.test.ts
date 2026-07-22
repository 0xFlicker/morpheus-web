import { describe, expect, it } from 'vitest';

/**
 * CaptureSession is browser/WebGL heavy; unit coverage lives on pure helpers
 * (inventory, captureStageFrame). This file documents the export contract the
 * headless runner depends on.
 */
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
