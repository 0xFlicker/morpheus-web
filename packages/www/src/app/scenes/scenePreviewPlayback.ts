export const SCENE_PREVIEW_LONG_PRESS_MS = 500;
export const MAX_RETAINED_SCENE_PREVIEWS = 24;

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
