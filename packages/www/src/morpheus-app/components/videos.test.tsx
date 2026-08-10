import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { MovieSpecialCast } from 'morpheus/casts/types';
import Videos from 'morpheus/casts/components/Videos';

const movieCast: MovieSpecialCast = {
  __t: 'MovieSpecialCast',
  castId: 101004,
  initiallyEnabled: true,
  comparators: [],
  fileName: 'GameDB/Deck1/balcNW4TRN',
  url: '',
  audioOnly: false,
  width: 320,
  height: 200,
  location: { x: 0, y: 0 },
  startFrame: 0,
  endFrame: -1,
  looping: false,
  dissolveToNextScene: false,
  nextSceneId: 2270,
  angleAtEnd: 2400,
  image: false,
  actionAtEnd: 2270,
};

describe('special movie video', () => {
  it('keeps its playback element inline on iPhone', () => {
    const markup = renderToStaticMarkup(
      <Videos
        movieSpecialCasts={[movieCast]}
        volume={0.5}
        onVideoCastEnded={() => undefined}
        onVideoCastCanPlaythrough={() => undefined}
        onVideoCastFramePresented={() => undefined}
        onVideoCastRef={() => undefined}
      />,
    );

    expect(markup).toContain(' playsInline=""');
    expect(markup.indexOf('.mp4')).toBeLessThan(markup.indexOf('.webm'));
  });

  it('marks zero-volume capture playback as muted autoplay media', () => {
    const markup = renderToStaticMarkup(
      <Videos
        movieSpecialCasts={[movieCast]}
        volume={0}
        onVideoCastEnded={() => undefined}
        onVideoCastCanPlaythrough={() => undefined}
        onVideoCastFramePresented={() => undefined}
        onVideoCastRef={() => undefined}
      />,
    );

    expect(markup).toContain(' muted=""');
  });
});
