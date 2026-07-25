/**
 * Composite all canvases under a stage source element onto a 2D target.
 * Used for dissolve covers and offline capture frame grabs.
 *
 * Fail-closed: if a canvas cannot be read (e.g. tainted), the black fill remains.
 */
export function captureStageFrame(
  source: HTMLElement,
  target: HTMLCanvasElement,
  options?: {
    devicePixelRatio?: number;
  },
): boolean {
  const sourceRect = source.getBoundingClientRect();
  const canvases = source.querySelectorAll('canvas');
  if (sourceRect.width <= 0 || sourceRect.height <= 0) {
    return false;
  }

  const pixelRatio =
    options?.devicePixelRatio ??
    (typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);
  const pixelWidth = Math.max(1, Math.round(sourceRect.width * pixelRatio));
  const pixelHeight = Math.max(1, Math.round(sourceRect.height * pixelRatio));
  if (target.width !== pixelWidth) {
    target.width = pixelWidth;
  }
  if (target.height !== pixelHeight) {
    target.height = pixelHeight;
  }
  target.style.width = `${sourceRect.width}px`;
  target.style.height = `${sourceRect.height}px`;

  const context = target.getContext('2d');
  if (!context) {
    return false;
  }
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.fillStyle = '#000';
  context.fillRect(0, 0, sourceRect.width, sourceRect.height);

  for (const canvas of canvases) {
    const canvasRect = canvas.getBoundingClientRect();
    if (canvasRect.width <= 0 || canvasRect.height <= 0) {
      continue;
    }
    try {
      context.drawImage(
        canvas,
        canvasRect.left - sourceRect.left,
        canvasRect.top - sourceRect.top,
        canvasRect.width,
        canvasRect.height,
      );
    } catch {
      // The black backing remains an opaque fail-closed cover.
    }
  }

  return true;
}
