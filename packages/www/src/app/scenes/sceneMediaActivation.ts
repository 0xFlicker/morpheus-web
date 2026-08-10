export type SceneMediaCandidate = Readonly<{
  id: string;
  focused: boolean;
  nearViewport: boolean;
  sequence: number;
}>;

export const MAX_ACTIVE_SCENE_MEDIA = 24;

export function chooseActiveSceneMedia(
  candidates: readonly SceneMediaCandidate[],
  limit = MAX_ACTIVE_SCENE_MEDIA,
): readonly string[] {
  if (!Number.isSafeInteger(limit) || limit <= 0) {
    throw new Error(`Invalid scene media activation limit: ${limit}`);
  }

  return candidates
    .filter((candidate) => candidate.focused || candidate.nearViewport)
    .sort((left, right) => {
      if (left.focused !== right.focused) return left.focused ? -1 : 1;
      return right.sequence - left.sequence;
    })
    .slice(0, limit)
    .map((candidate) => candidate.id);
}
