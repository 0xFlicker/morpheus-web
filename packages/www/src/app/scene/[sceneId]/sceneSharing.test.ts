import { describe, expect, it, vi } from 'vitest';

import { shareScene } from './sceneSharing';

describe('scene sharing', () => {
  it('prefers the native share dialog', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const writeText = vi.fn().mockResolvedValue(undefined);

    await expect(
      shareScene(
        { share, clipboard: { writeText } },
        1050,
        'https://morpheus.example/scene/1050',
      ),
    ).resolves.toBe('shared');
    expect(share).toHaveBeenCalledWith({
      title: 'Morpheus scene 1050',
      text: 'Explore scene 1050 from Morpheus.',
      url: 'https://morpheus.example/scene/1050',
    });
    expect(writeText).not.toHaveBeenCalled();
  });

  it('copies the link when native sharing is unavailable', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);

    await expect(
      shareScene(
        { clipboard: { writeText } },
        2000,
        'https://morpheus.example/scene/2000',
      ),
    ).resolves.toBe('copied');
    expect(writeText).toHaveBeenCalledWith(
      'https://morpheus.example/scene/2000',
    );
  });

  it('treats a dismissed native share dialog as cancellation', async () => {
    const dismissal = new Error('Share dismissed');
    dismissal.name = 'AbortError';
    const share = vi.fn().mockRejectedValue(dismissal);

    await expect(
      shareScene({ share }, 1050, 'https://morpheus.example/scene/1050'),
    ).resolves.toBe('dismissed');
  });

  it('fails clearly when neither capability exists', async () => {
    await expect(
      shareScene({}, 1050, 'https://morpheus.example/scene/1050'),
    ).rejects.toThrow('cannot share or copy');
  });
});
