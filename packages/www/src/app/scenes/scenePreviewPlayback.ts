export const SCENE_PREVIEW_LONG_PRESS_MS = 500;
export const MAX_RETAINED_SCENE_PREVIEWS = 24;

export const SCENE_PREVIEW_SOURCE_TYPES = {
  mp4: 'video/mp4',
  webm: 'video/webm',
} as const;

export type ScenePreviewSources = Readonly<{
  mp4: string;
  webm: string;
}>;

export type ScenePreviewSource = Readonly<{
  kind: keyof ScenePreviewSources;
  src: string;
  type: (typeof SCENE_PREVIEW_SOURCE_TYPES)[keyof ScenePreviewSources];
}>;

export function selectScenePreviewSource(
  sources: ScenePreviewSources,
  canPlayType: (type: string) => string,
): ScenePreviewSource {
  if (canPlayType(SCENE_PREVIEW_SOURCE_TYPES.webm)) {
    return {
      kind: 'webm',
      src: sources.webm,
      type: SCENE_PREVIEW_SOURCE_TYPES.webm,
    };
  }

  return {
    kind: 'mp4',
    src: sources.mp4,
    type: SCENE_PREVIEW_SOURCE_TYPES.mp4,
  };
}

export type ScenePreviewPlaybackIntent = Readonly<{
  hovered: boolean;
  longPressed: boolean;
  reduceMotion: boolean;
}>;

export function shouldPlayScenePreview(
  intent: ScenePreviewPlaybackIntent,
): boolean {
  return !intent.reduceMotion && (intent.hovered || intent.longPressed);
}
