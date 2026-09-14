import { afterEach, describe, expect, it, vi } from 'vitest';

async function loadGameDb(origin?: string) {
  vi.resetModules();
  if (origin === undefined) {
    vi.unstubAllEnvs();
  } else {
    vi.stubEnv('NEXT_PUBLIC_MORPHEUS_GAMEDB_ORIGIN', origin);
  }
  return import('./gamedb');
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('GameDB URL resolution', () => {
  it('switches covered images and videos while retaining original gaps and audio', async () => {
    const values = new Map<string, string>();
    vi.stubGlobal('window', { localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    } });
    const { getAssetUrl, getHDAssetsEnabled, setHDAssetsEnabled } = await loadGameDb('https://media.example.com');
    expect(getHDAssetsEnabled()).toBe(false);
    setHDAssetsEnabled(true);
    expect(getAssetUrl('GameDB/Deck1/introMOV', 'mp4')).toBe('https://media.example.com/HD/rife-x2-v1/GameDB/Deck1/introMOV.mp4');
    expect(getAssetUrl('GameDB/Deck1/introMOV', 'webm')).toContain('/HD/rife-x2-v1/');
    expect(getAssetUrl('GameDB/Deck1/balcNWPAN', 'png')).toBe('https://media.example.com/HD/spatial-x2-v1/GameDB/Deck1/balcNWPAN.png');
    expect(getAssetUrl('GameDB/Deck1/introMOV', 'mp3')).toBe('https://media.example.com/GameDB/Deck1/introMOV.mp3');
    expect(getAssetUrl('GameDB/Deck3Aft/scrbLGSTL.0', 'png')).toBe('https://media.example.com/HD/spatial-x2-v1/GameDB/Deck3Aft/scrbLGSTL.0.png');
    setHDAssetsEnabled(false);
    expect(getAssetUrl('GameDB/Deck1/introMOV', 'mp4')).toBe('https://media.example.com/GameDB/Deck1/introMOV.mp4');
  });
  it('uses one GameDB path segment at a configured public origin', async () => {
    const { getAssetUrl } = await loadGameDb('https://media.example.com/');

    expect(getAssetUrl('GameDB/Deck1/introMOV.webm')).toBe(
      'https://media.example.com/GameDB/Deck1/introMOV.webm',
    );
  });

  it('preserves same-origin paths when no public origin is configured', async () => {
    const { getAssetUrl } = await loadGameDb();

    expect(getAssetUrl('GameDB/OAsounds/claireSRMSC', 'ogg')).toBe(
      '/GameDB/OAsounds/claireSRMSC.ogg',
    );
  });

  it('encodes authored hash characters in direct panorama-animation URLs', async () => {
    const { getPanoAnimUrl } = await loadGameDb('https://media.example.com');

    expect(getPanoAnimUrl('GameDB/Deck1/door#1ANI')).toBe(
      'https://media.example.com/GameDB/Deck1/door%231ANI',
    );
  });

  it('matches authored directory casing to the published GameDB tree', async () => {
    const { getAssetUrl } = await loadGameDb();

    expect(getAssetUrl('GameDB/harem/tapestrSPC', 'png')).toBe(
      '/GameDB/Harem/tapestrSPC.png',
    );
    expect(getAssetUrl('GameDB/cargoH/armANI', 'webm')).toBe(
      '/GameDB/CargoH/armANI.webm',
    );
    expect(getAssetUrl('GameDB/H2OFront/waterPAN', 'png')).toBe(
      '/GameDB/h2oFront/waterPAN.png',
    );
  });

  it('normalizes the engine public origin and keeps panorama animation direct', async () => {
    const { getAssetUrl, getPanoAnimUrl, setBaseUrl } =
      await import('@soapbubble/morpheus-client/service/gamedb');

    setBaseUrl('https://media.example.com/');

    expect(getAssetUrl('GameDB/Deck1/introMOV.webm')).toBe(
      'https://media.example.com/GameDB/Deck1/introMOV.webm',
    );
    expect(getPanoAnimUrl('GameDB/Deck1/door#1ANI')).toBe(
      'https://media.example.com/GameDB/Deck1/door%231ANI',
    );
    setBaseUrl('');
  });
});
