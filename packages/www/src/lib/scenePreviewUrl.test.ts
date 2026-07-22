import { afterEach, describe, expect, it } from 'vitest';

import {
  resolvePreviewsOrigin,
  scenePreviewGifPath,
  scenePreviewGifUrl,
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
  it('builds stable preview path', () => {
    expect(scenePreviewGifPath(1010)).toBe('previews/scenes/1010.gif');
  });

  it('prefers SCENE_PREVIEWS_ORIGIN', () => {
    setEnv('NEXT_PUBLIC_SCENE_PREVIEWS_ORIGIN', 'https://cdn.example/previews-root');
    setEnv('NEXT_PUBLIC_SITE_URL', 'https://site.example');
    expect(resolvePreviewsOrigin()).toBe('https://cdn.example/previews-root');
    expect(scenePreviewGifUrl(1010)).toBe(
      'https://cdn.example/previews-root/previews/scenes/1010.gif',
    );
  });

  it('returns undefined without origin', () => {
    for (const key of keys) {
      setEnv(key, undefined);
    }
    expect(scenePreviewGifUrl(1010)).toBeUndefined();
  });
});
