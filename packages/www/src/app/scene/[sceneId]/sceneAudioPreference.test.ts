import { describe, expect, it, vi } from 'vitest';

import {
  readSceneMutedPreference,
  SCENE_AUDIO_PREFERENCE_KEY,
  writeSceneMutedPreference,
} from './sceneAudioPreference';

describe('scene explorer audio preference', () => {
  it('starts muted when no preference has been saved', () => {
    const storage = { getItem: vi.fn(() => null) };

    expect(readSceneMutedPreference(storage)).toBe(true);
  });

  it('restores an explicitly unmuted preference', () => {
    const storage = { getItem: vi.fn(() => 'false') };

    expect(readSceneMutedPreference(storage)).toBe(false);
  });

  it('stores the muted state under the explorer preference key', () => {
    const storage = { setItem: vi.fn() };

    writeSceneMutedPreference(storage, true);

    expect(storage.setItem).toHaveBeenCalledWith(
      SCENE_AUDIO_PREFERENCE_KEY,
      'true',
    );
  });
});
