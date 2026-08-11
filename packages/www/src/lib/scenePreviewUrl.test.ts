import { afterEach, describe, expect, it } from 'vitest';

import {
  resolvePreviewsOrigin,
  scenePreviewGifPath,
  scenePreviewGifUrl,
  scenePreviewMp4Url,
  scenePreviewOgImage,
  scenePreviewPosterPath,
  scenePreviewPosterUrl,
  scenePreviewWebmUrl,
} from './scenePreviewUrl';

const keys = [
  'NEXT_PUBLIC_SCENE_PREVIEWS_ORIGIN',
  'NEXT_PUBLIC_MORPHEUS_GAMEDB_ORIGIN',
  'NEXT_PUBLIC_SITE_URL',
  'SITE_URL',
  'VERCEL_URL',
] as const;

const previous = new Map<string, string | undefined>();

afterEach(() => {
  for (const key of keys) {
    if (previous.has(key)) {
      const value = previous.get(key);
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
      previous.delete(key);
    }
  }
});

function setEnv(key: (typeof keys)[number], value: string | undefined) {
  if (!previous.has(key)) {
    previous.set(key, process.env[key]);
  }
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

describe('scenePreviewUrl', () => {
  it('builds stable preview paths', () => {
    expect(scenePreviewGifPath(1010)).toBe('previews/scenes/1010.gif');
    expect(scenePreviewPosterPath(1010)).toBe('previews/scenes/1010.png');
  });

  it('prefers SCENE_PREVIEWS_ORIGIN and builds gif/mp4/webm urls', () => {
    setEnv('NEXT_PUBLIC_SCENE_PREVIEWS_ORIGIN', 'https://cdn.example');
    setEnv('NEXT_PUBLIC_SITE_URL', 'https://site.example');
    expect(resolvePreviewsOrigin()).toBe('https://cdn.example');
    expect(scenePreviewGifUrl(1010)).toBe(
      'https://cdn.example/previews/scenes/1010.gif',
    );
    expect(scenePreviewMp4Url(1010)).toBe(
      'https://cdn.example/previews/scenes/1010.mp4',
    );
    expect(scenePreviewPosterUrl(1010)).toBe(
      'https://cdn.example/previews/scenes/1010.png',
    );
    expect(scenePreviewWebmUrl(1010)).toBe(
      'https://cdn.example/previews/scenes/1010.webm',
    );
  });

  it('builds OG image metadata at GIF dimensions', () => {
    setEnv('NEXT_PUBLIC_MORPHEUS_GAMEDB_ORIGIN', 'https://blob.example');
    const image = scenePreviewOgImage(1050);
    expect(image).toEqual({
      url: 'https://blob.example/previews/scenes/1050.gif',
      width: 320,
      height: 200,
      type: 'image/gif',
      alt: 'Morpheus scene 1050',
    });
  });

  it('returns undefined without origin', () => {
    for (const key of keys) {
      setEnv(key, undefined);
    }
    expect(scenePreviewGifUrl(1010)).toBeUndefined();
    expect(scenePreviewOgImage(1010)).toBeUndefined();
  });
});
