import { describe, expect, it, vi } from 'vitest';
import { createMoviePlayback } from 'morpheus/casts/components/moviePlayback';

function fixture(loop = false) {
  const media = {
    currentTime: 0, ended: false, loop,
    play: vi.fn(async () => { if (media.ended) { media.currentTime = 0; media.ended = false; } }),
    pause: vi.fn(),
  };
  return { media, playback: createMoviePlayback(media), beforePlay: vi.fn() };
}

describe('movie completion across scene preparation', () => {
  it('holds the last frame through repeated playback requests while the next scene loads', async () => {
    const { media, playback, beforePlay } = fixture();
    await playback.play('scene-a:cast-1', beforePlay);
    media.currentTime = 7;
    media.ended = true;
    playback.complete();
    for (let i = 0; i < 5; i++) {
      expect(await playback.play('scene-a:cast-1', beforePlay)).toBe('completed');
    }
    expect(media.play).toHaveBeenCalledTimes(1);
    expect(beforePlay).toHaveBeenCalledTimes(1);
    expect(media.currentTime).toBe(7);
  });
  it('guards the ended property even before the completion event is delivered', async () => {
    const { media, playback, beforePlay } = fixture();
    await playback.play('a', beforePlay);
    media.ended = true;
    expect(await playback.play('a', beforePlay)).toBe('completed');
    expect(media.play).toHaveBeenCalledTimes(1);
  });
  it('allows authored loops', async () => {
    const { media, playback, beforePlay } = fixture(true);
    await playback.play('a', beforePlay);
    media.ended = true;
    playback.complete();
    expect(await playback.play('a', beforePlay)).toBe('started');
    expect(media.play).toHaveBeenCalledTimes(2);
  });
  it('rewinds a retained movie when a different scene activates it', async () => {
    const { media, playback, beforePlay } = fixture();
    await playback.play('a', beforePlay);
    media.currentTime = 7;
    playback.complete();
    expect(await playback.play('b', beforePlay)).toBe('started');
    expect(media.currentTime).toBe(0);
  });
  it('allows re-entering the same scene after deactivation', async () => {
    const { media, playback, beforePlay } = fixture();
    await playback.play('a', beforePlay);
    media.currentTime = 7;
    playback.complete();
    playback.end();
    expect(await playback.play('a', beforePlay)).toBe('started');
    expect(media.currentTime).toBe(0);
    expect(media.pause).toHaveBeenCalledTimes(1);
  });
  it('keeps autoplay rejection retryable', async () => {
    const { media, playback, beforePlay } = fixture();
    media.play.mockRejectedValueOnce(new DOMException('blocked', 'NotAllowedError'));
    expect(await playback.play('a', beforePlay)).toBe('blocked');
    expect(await playback.play('a', beforePlay)).toBe('started');
    expect(media.play).toHaveBeenCalledTimes(2);
  });
});
