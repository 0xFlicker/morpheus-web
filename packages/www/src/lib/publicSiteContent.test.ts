import { describe, expect, it } from 'vitest';

import {
  morpheusStory,
  publicDestinations,
  publicSiteSources,
  publicSocialLinks,
  studioStory,
} from './publicSiteContent';

describe('public site content', () => {
  it('records a known source for every historical paragraph', () => {
    const sourceIds = new Set(publicSiteSources.map((source) => source.id));

    for (const paragraph of [...studioStory, ...morpheusStory]) {
      expect(paragraph.sourceIds.length).toBeGreaterThan(0);
      for (const sourceId of paragraph.sourceIds) {
        expect(sourceIds.has(sourceId)).toBe(true);
      }
    }
  });

  it('publishes only real internal and secure external destinations', () => {
    expect(publicDestinations.map((destination) => destination.id)).toEqual([
      'web-game',
      'macos-download',
      'scene-explorer',
      'itch',
    ]);

    for (const destination of publicDestinations) {
      if (destination.external) {
        expect(new URL(destination.href).protocol).toBe('https:');
      } else {
        expect(destination.href.startsWith('/')).toBe(true);
      }
    }
  });

  it('omits unsupplied TestFlight and social channels', () => {
    expect(publicDestinations.map(({ id }) => id)).not.toContain('testflight');
    expect(publicSocialLinks).toHaveLength(0);
  });

  it('publishes the current macOS release as a download', () => {
    const macosDownload = publicDestinations.find(
      ({ id }) => id === 'macos-download',
    );

    expect(macosDownload).toMatchObject({
      eyebrow: 'Native · Version 1.0 (4)',
      external: true,
      href: 'https://ol0swvwh4hjeaxzf.public.blob.vercel-storage.com/downloads/Morpheus-1.0-4-macOS.zip?download=1',
    });
  });
});
