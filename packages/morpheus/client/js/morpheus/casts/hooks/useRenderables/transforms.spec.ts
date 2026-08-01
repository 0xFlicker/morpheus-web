import { describe, expect, it } from 'vitest'
import {
  calculateControlledFrameIndex,
  createControlledMoviePlaybackController,
} from './controlledMovieFrame'

describe('controlled movie frame selection', () => {
  it('uses state times authored frames without atlas interpolation', () => {
    const carouselFrame = (value: number) =>
      calculateControlledFrameIndex({
        value,
        frames: 1,
        frameCount: 11,
      })

    expect(
      Array.from({ length: 10 }, (_, value) => carouselFrame(value))
    ).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
    expect([4, 2, 5].map(carouselFrame)).toEqual([4, 2, 5])
  })

  it('keeps 11-frame and 23-frame authored spans addressable', () => {
    expect(
      calculateControlledFrameIndex({
        value: 10,
        frames: 11,
        frameCount: 111,
      })
    ).toBe(110)
    expect(
      calculateControlledFrameIndex({
        value: 2,
        frames: 23,
        frameCount: 47,
      })
    ).toBe(46)
  })

  it('clamps only at the atlas bounds', () => {
    expect(
      calculateControlledFrameIndex({
        value: 10,
        frames: 11,
        frameCount: 110,
      })
    ).toBe(109)
    expect(
      calculateControlledFrameIndex({
        value: 7,
        frames: 0,
        frameCount: 11,
      })
    ).toBe(0)
  })

  it('plays every authored scarab frame before settling on the next number', () => {
    let nowMs = 0
    const playback = createControlledMoviePlaybackController({
      frameDurationMs: 100,
      now: () => nowMs,
    })
    const frameFor = (value: number) =>
      playback.frameFor({
        castId: 308352,
        value,
        frames: 11,
        direction: 1,
        frameCount: 111,
      })

    expect(frameFor(0)).toBe(0)
    expect(frameFor(1)).toBe(0)

    const observedFrames = Array.from({ length: 11 }, (_, elapsedFrame) => {
      nowMs = (elapsedFrame + 1) * 100
      return frameFor(1)
    })

    expect(observedFrames).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
    nowMs = 5000
    expect(frameFor(1)).toBe(11)
  })

  it('jumps to the authored endpoint when a cast first loads', () => {
    const playback = createControlledMoviePlaybackController({
      frameDurationMs: 100,
      now: () => 0,
    })

    expect(
      playback.frameFor({
        castId: 308352,
        value: 6,
        frames: 11,
        direction: 1,
        frameCount: 111,
      })
    ).toBe(66)
  })

  it('restarts from the authored boundary when another click interrupts playback', () => {
    let nowMs = 0
    const playback = createControlledMoviePlaybackController({
      frameDurationMs: 100,
      now: () => nowMs,
    })
    const frameFor = (value: number) =>
      playback.frameFor({
        castId: 308352,
        value,
        frames: 11,
        direction: 1,
        frameCount: 111,
      })

    expect(frameFor(0)).toBe(0)
    expect(frameFor(1)).toBe(0)
    nowMs = 300
    expect(frameFor(1)).toBe(3)

    expect(frameFor(2)).toBe(11)
    nowMs = 1400
    expect(frameFor(2)).toBe(22)
  })
})
