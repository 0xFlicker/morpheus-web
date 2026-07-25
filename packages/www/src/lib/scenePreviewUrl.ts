/**
 * Public URLs for pre-generated scene preview media on Vercel Blob.
 *
 * Blob keys (stable):
 *   previews/scenes/{sceneId}.gif
 *   previews/scenes/{sceneId}.mp4
 *   previews/scenes/{sceneId}.webm
 *
 * OG / Twitter image unfurls use the GIF. MP4 is optional og:video for
 * platforms that honor it; it is not valid as og:image.
 */

export const SCENE_PREVIEW_GIF_WIDTH = 320;
export const SCENE_PREVIEW_GIF_HEIGHT = 200;
export const SCENE_PREVIEW_VIDEO_WIDTH = 640;
export const SCENE_PREVIEW_VIDEO_HEIGHT = 400;

export function resolvePreviewsOrigin(): string | undefined {
  const candidates = [
    process.env.NEXT_PUBLIC_SCENE_PREVIEWS_ORIGIN,
    process.env.NEXT_PUBLIC_MORPHEUS_GAMEDB_ORIGIN,
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.SITE_URL,
  ];
  for (const value of candidates) {
    if (value && value.trim()) {
      return value.replace(/\/$/, '');
    }
  }
  if (process.env.VERCEL_URL) {
    const host = process.env.VERCEL_URL.startsWith('http')
      ? process.env.VERCEL_URL
      : `https://${process.env.VERCEL_URL}`;
    return host.replace(/\/$/, '');
  }
  return undefined;
}

export function scenePreviewGifPath(sceneId: number): string {
  return `previews/scenes/${sceneId}.gif`;
}

export function scenePreviewMp4Path(sceneId: number): string {
  return `previews/scenes/${sceneId}.mp4`;
}

export function scenePreviewWebmPath(sceneId: number): string {
  return `previews/scenes/${sceneId}.webm`;
}

function absoluteUrl(relativePath: string): string | undefined {
  const origin = resolvePreviewsOrigin();
  if (!origin) {
    return undefined;
  }
  return `${origin}/${relativePath}`;
}

export function scenePreviewGifUrl(sceneId: number): string | undefined {
  return absoluteUrl(scenePreviewGifPath(sceneId));
}

export function scenePreviewMp4Url(sceneId: number): string | undefined {
  return absoluteUrl(scenePreviewMp4Path(sceneId));
}

export function scenePreviewWebmUrl(sceneId: number): string | undefined {
  return absoluteUrl(scenePreviewWebmPath(sceneId));
}

/** Open Graph / Twitter image entry for a scene GIF. */
export function scenePreviewOgImage(sceneId: number):
  | {
      url: string;
      width: number;
      height: number;
      type: 'image/gif';
      alt: string;
    }
  | undefined {
  const url = scenePreviewGifUrl(sceneId);
  if (!url) {
    return undefined;
  }
  return {
    url,
    width: SCENE_PREVIEW_GIF_WIDTH,
    height: SCENE_PREVIEW_GIF_HEIGHT,
    type: 'image/gif',
    alt: `Morpheus scene ${sceneId}`,
  };
}
