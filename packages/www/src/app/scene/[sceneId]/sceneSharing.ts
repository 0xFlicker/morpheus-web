export type SceneShareNavigator = {
  share?: (data: ShareData) => Promise<void>;
  clipboard?: Pick<Clipboard, 'writeText'>;
};

export type SceneShareOutcome = 'shared' | 'copied' | 'dismissed';

function isDismissal(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

export async function shareScene(
  capability: SceneShareNavigator,
  sceneId: number,
  url: string,
): Promise<SceneShareOutcome> {
  if (capability.share) {
    try {
      await capability.share({
        title: `Morpheus scene ${sceneId}`,
        text: `Explore scene ${sceneId} from Morpheus.`,
        url,
      });
      return 'shared';
    } catch (error) {
      if (isDismissal(error)) {
        return 'dismissed';
      }
      throw error;
    }
  }

  if (!capability.clipboard) {
    throw new Error('This browser cannot share or copy the scene link.');
  }
  await capability.clipboard.writeText(url);
  return 'copied';
}
