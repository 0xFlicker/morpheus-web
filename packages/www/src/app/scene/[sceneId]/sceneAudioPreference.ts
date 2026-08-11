export const SCENE_AUDIO_PREFERENCE_KEY = 'morpheus.scene-explorer.muted';

type ReadableStorage = Pick<Storage, 'getItem'>;
type WritableStorage = Pick<Storage, 'setItem'>;

export function readSceneMutedPreference(storage: ReadableStorage): boolean {
  return storage.getItem(SCENE_AUDIO_PREFERENCE_KEY) !== 'false';
}

export function writeSceneMutedPreference(
  storage: WritableStorage,
  isMuted: boolean,
): void {
  storage.setItem(SCENE_AUDIO_PREFERENCE_KEY, String(isMuted));
}
