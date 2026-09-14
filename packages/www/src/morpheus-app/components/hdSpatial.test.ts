import { describe, expect, it, vi } from 'vitest';
import { getHDAtlasLayout, hdAtlasLayouts } from '../../../../morpheus/client/js/service/hd-spatial-assets';
import { drawPanoramaChunk } from '../../../../morpheus/client/js/morpheus/casts/hooks/panoramaRaster';

describe('HD spatial rendering', () => {
  it('uses explicit occupied frame counts and rejects mismatched images', () => {
    const url = '/HD/spatial-x2-v1/GameDB/All/hiresbutANI.png';
    expect(getHDAtlasLayout(url, 288, 192)?.frameCount).toBe(3);
    expect(() => getHDAtlasLayout(url, 144, 96)).toThrow('Invalid HD');
    expect(getHDAtlasLayout('/GameDB/All/hiresbutANI.png', 144, 96)).toBeUndefined();
    for (const [path, layout] of Object.entries(hdAtlasLayouts)) {
      expect(getHDAtlasLayout(`/HD/spatial-x2-v1/${path.replaceAll('#', '%23')}`, layout.frameWidth * layout.cols, layout.frameHeight * layout.rows)).toEqual(layout);
      expect(layout.frameCount).toBeLessThanOrEqual(layout.cols * layout.rows);
    }
  });
  it('wraps HD panorama crops in physical pixels and draws in authored coordinates', () => {
    vi.stubGlobal('HTMLCanvasElement', class {});
    try {
      const source = new HTMLCanvasElement();
      const context = { drawImage: vi.fn(), clearRect: vi.fn(), setTransform: vi.fn() };
      drawPanoramaChunk(context, source, 3000, 2);
      expect(context.setTransform).toHaveBeenCalledWith(2, 0, 0, 2, 0, 0);
      expect(context.drawImage.mock.calls).toEqual([
        [source, 6000, 0, 144, 1024, 0, 0, 72, 512],
        [source, 0, 0, 1904, 1024, 72, 0, 952, 512],
      ]);
    } finally { vi.unstubAllGlobals(); }
  });
});
