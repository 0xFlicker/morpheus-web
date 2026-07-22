/**
 * Public URL for a pre-generated scene OG GIF.
 */
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

export function scenePreviewGifUrl(sceneId: number): string | undefined {
  const origin = resolvePreviewsOrigin();
  if (!origin) {
    return undefined;
  }
  return `${origin}/${scenePreviewGifPath(sceneId)}`;
}
