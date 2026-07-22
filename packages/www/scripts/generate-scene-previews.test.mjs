import { describe, expect, it } from 'vitest';

import {
  captureUrl,
  parseGenerateArguments,
} from './generate-scene-previews.mjs';

describe('generate-scene-previews helpers', () => {
  it('builds capture URLs at native 640×400 with dense frame counts', () => {
    expect(captureUrl('http://localhost:3000', 1010, 480)).toBe(
      'http://localhost:3000/capture/scene/1010?frames=480&w=640&h=400',
    );
  });

  it('parses scene filters', () => {
    const options = parseGenerateArguments([
      '--scene',
      '1010',
      '--scene',
      '2020',
      '--dry-run',
    ]);
    expect(options.sceneIds).toEqual([1010, 2020]);
    expect(options.dryRun).toBe(true);
    expect(options.allDirty).toBe(false);
  });
});
