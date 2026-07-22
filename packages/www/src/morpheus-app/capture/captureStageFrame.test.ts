import { describe, expect, it, vi } from 'vitest';

import { captureStageFrame } from './captureStageFrame';

function mockRect(
  width: number,
  height: number,
  left = 0,
  top = 0,
): DOMRect {
  return {
    x: left,
    y: top,
    width,
    height,
    top,
    left,
    right: left + width,
    bottom: top + height,
    toJSON() {
      return {};
    },
  };
}

function createSource(
  rect: DOMRect,
  canvases: Array<{
    rect: DOMRect;
    drawThrows?: boolean;
  }> = [],
): HTMLElement {
  const nodes = canvases.map((entry) => {
    const canvas = {
      getBoundingClientRect: () => entry.rect,
    } as unknown as HTMLCanvasElement;
    return canvas;
  });
  return {
    getBoundingClientRect: () => rect,
    querySelectorAll: () => nodes as unknown as NodeListOf<HTMLCanvasElement>,
  } as unknown as HTMLElement;
}

function createTarget(context: CanvasRenderingContext2D | null) {
  const target = {
    width: 0,
    height: 0,
    style: { width: '', height: '' },
    getContext: () => context,
  } as unknown as HTMLCanvasElement;
  return target;
}

describe('captureStageFrame', () => {
  it('returns false for zero-size source', () => {
    const source = createSource(mockRect(0, 0));
    const target = createTarget({} as CanvasRenderingContext2D);
    expect(captureStageFrame(source, target, { devicePixelRatio: 1 })).toBe(
      false,
    );
  });

  it('fills target and draws child canvases', () => {
    const source = createSource(mockRect(100, 50), [
      { rect: mockRect(100, 50, 0, 0) },
    ]);
    const fillRect = vi.fn();
    const drawImage = vi.fn();
    const setTransform = vi.fn();
    const target = createTarget({
      setTransform,
      fillRect,
      drawImage,
      fillStyle: '',
    } as unknown as CanvasRenderingContext2D);

    expect(captureStageFrame(source, target, { devicePixelRatio: 2 })).toBe(
      true,
    );
    expect(target.width).toBe(200);
    expect(target.height).toBe(100);
    expect(setTransform).toHaveBeenCalledWith(2, 0, 0, 2, 0, 0);
    expect(fillRect).toHaveBeenCalled();
    expect(drawImage).toHaveBeenCalled();
  });

  it('survives drawImage failure fail-closed', () => {
    const source = createSource(mockRect(20, 20), [
      { rect: mockRect(20, 20) },
    ]);
    const target = createTarget({
      setTransform: vi.fn(),
      fillRect: vi.fn(),
      drawImage: () => {
        throw new Error('tainted');
      },
      fillStyle: '',
    } as unknown as CanvasRenderingContext2D);

    expect(captureStageFrame(source, target, { devicePixelRatio: 1 })).toBe(
      true,
    );
  });
});
