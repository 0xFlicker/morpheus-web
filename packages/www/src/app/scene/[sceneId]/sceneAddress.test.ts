import { describe, expect, it, vi } from 'vitest';

import { replaceSceneAddress, sceneAddress } from './sceneAddress';

describe('scene explorer address', () => {
  it('keeps the explorer query string on authored navigation', () => {
    expect(sceneAddress(2000, '?mcp=explorer&view=debug')).toBe(
      '/scene/2000?mcp=explorer&view=debug',
    );
  });

  it('replaces the current address without creating a history entry', () => {
    const replaceState = vi.fn();
    const state = { nextUrl: '/scene/1050' };

    replaceSceneAddress(2000, { replaceState, state }, '?mcp=explorer');

    expect(replaceState).toHaveBeenCalledWith(
      state,
      '',
      '/scene/2000?mcp=explorer',
    );
  });

  it('rejects invalid scene IDs', () => {
    expect(() => sceneAddress(0)).toThrow('Invalid scene ID');
  });
});
