import { DST_WIDTH, DST_HEIGHT, PANO_CANVAS_WIDTH } from 'morpheus/constants'

export function drawPanoramaChunk(
  dstContext: Pick<CanvasRenderingContext2D, 'setTransform' | 'clearRect' | 'drawImage'>,
  sourceCanvas: HTMLCanvasElement,
  offsetX: number,
  scale: number
) {
  dstContext.setTransform(scale, 0, 0, scale, 0, 0)
  dstContext.clearRect(0, 0, DST_WIDTH, DST_HEIGHT)
  if (offsetX > PANO_CANVAS_WIDTH - DST_WIDTH) {
    const firstChunkWidth = PANO_CANVAS_WIDTH - offsetX
    const secondChunkWidth = DST_WIDTH - firstChunkWidth
    dstContext.drawImage(
      sourceCanvas,
      offsetX * scale,
      0,
      firstChunkWidth * scale,
      DST_HEIGHT * scale,
      0,
      0,
      firstChunkWidth,
      DST_HEIGHT
    )
    dstContext.drawImage(
      sourceCanvas,
      0,
      0,
      secondChunkWidth * scale,
      DST_HEIGHT * scale,
      firstChunkWidth,
      0,
      secondChunkWidth,
      DST_HEIGHT
    )
  } else {
    dstContext.drawImage(
      sourceCanvas,
      offsetX * scale,
      0,
      DST_WIDTH * scale,
      DST_HEIGHT * scale,
      0,
      0,
      DST_WIDTH,
      DST_HEIGHT
    )
  }

}
