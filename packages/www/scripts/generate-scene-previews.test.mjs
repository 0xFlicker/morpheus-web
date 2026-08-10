import { describe, expect, it } from 'vitest';

import {
  captureUrl,
  isInfrastructureFailure,
  mergePreviewResults,
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

  it('merges checkpoints without losing prior successes', () => {
    const scenes = [
      { sceneId: 1010, inputHash: 'current-a' },
      { sceneId: 2020, inputHash: 'current-b' },
      { sceneId: 3030, inputHash: 'current-c' },
    ];
    const previous = [
      { sceneId: 1010, inputHash: 'current-a', status: 'ok' },
      { sceneId: 2020, inputHash: 'stale-b', status: 'ok' },
      { sceneId: 3030, inputHash: 'current-c', status: 'failed' },
    ];
    const current = [{ sceneId: 2020, inputHash: 'current-b', status: 'ok' }];

    expect(mergePreviewResults(previous, current, scenes)).toEqual([
      previous[0],
      current[0],
      previous[2],
    ]);
  });

  it('recognizes server and browser transport failures', () => {
    expect(
      isInfrastructureFailure('page.goto: net::ERR_CONNECTION_REFUSED'),
    ).toBe(true);
    expect(
      isInfrastructureFailure(
        'browser.newPage: Target page, context or browser has been closed',
      ),
    ).toBe(true);
    expect(isInfrastructureFailure('presentation_timeout')).toBe(false);
  });
});
