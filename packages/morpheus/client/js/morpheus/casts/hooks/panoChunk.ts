import { drawPanoramaChunk } from './panoramaRaster'
import { useCallback, useLayoutEffect, useMemo, useRef } from 'react'
import createCanvas from 'utils/canvas'
import { CanvasTexture } from 'three'
import { DST_WIDTH, DST_HEIGHT } from 'morpheus/constants'
import type { PanoAnim } from '../types'
import {
  getPanoAnimationFrameSignature,
  drawPanoAnimationFrame,
} from '../panoAnimation'

export interface PanoAnimationMediaLayer {
  cast: PanoAnim
  media: HTMLVideoElement
}

interface PanoChunk {
  texture: CanvasTexture | undefined
  updateAnimationFrames: () => void
}

export default function usePanoChunk(
  img: HTMLImageElement | undefined,
  offsetX: number,
  animationLayers: readonly PanoAnimationMediaLayer[] = []
): PanoChunk {
  const scale = img ? img.naturalWidth / 2048 : 1
  if (img && (!(scale === 1 || scale === 2) || img.naturalHeight !== 1024 * scale)) {
    throw new Error('Unsupported panorama atlas dimensions')
  }
  const canvas = useMemo(
    () =>
      createCanvas({
        width: DST_WIDTH * scale,
        height: DST_HEIGHT * scale,
      }),
    [scale]
  )
  const texture = useMemo(() => {
    if (canvas) {
      const texture = new CanvasTexture(canvas)
      texture.flipY = false
      return texture
    }
    return undefined
  }, [canvas])
  const sourceCanvas = useMemo(() => {
    if (img) {
      const fullPano = createCanvas({
        width: 3072 * scale,
        height: 512 * scale,
      })
      const ctx = fullPano.getContext('2d')
      if (ctx) {
        ctx.drawImage(img, 0, 0, 2048 * scale, 512 * scale, 0, 0, 2048 * scale, 512 * scale)
        ctx.drawImage(img, 0, 512 * scale, 1024 * scale, 512 * scale, 2048 * scale, 0, 1024 * scale, 512 * scale)
        return fullPano
      }
    }
    return undefined
  }, [img, scale])

  const drawChunk = useCallback(() => {
    if (!sourceCanvas || !texture) {
      return
    }

    const dstContext = canvas.getContext('2d')
    if (!dstContext) {
      return
    }

    drawPanoramaChunk(dstContext, sourceCanvas, offsetX, scale)

    for (const { cast, media } of animationLayers) {
      if (media.readyState < 2) {
        continue
      }

      drawPanoAnimationFrame(dstContext, media, cast, offsetX)
    }

    texture.needsUpdate = true
  }, [animationLayers, canvas, offsetX, scale, sourceCanvas, texture])

  useLayoutEffect(() => () => texture?.dispose(), [texture])

  const frameSignatureRef = useRef('')
  useLayoutEffect(() => {
    frameSignatureRef.current =
      getPanoAnimationFrameSignature(animationLayers)
    drawChunk()
  }, [animationLayers, drawChunk, img, offsetX])

  const updateAnimationFrames = useCallback(() => {
    const frameSignature = getPanoAnimationFrameSignature(animationLayers)
    if (frameSignature === frameSignatureRef.current) {
      return
    }
    frameSignatureRef.current = frameSignature
    drawChunk()
  }, [animationLayers, drawChunk])

  return { texture, updateAnimationFrames }
}
