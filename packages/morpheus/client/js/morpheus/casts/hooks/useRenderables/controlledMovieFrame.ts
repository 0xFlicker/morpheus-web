export function calculateControlledFrameIndex({
  value,
  frames,
  frameCount,
}: {
  value: number
  frames: number
  frameCount: number
}): number {
  const logicalFrame = Math.max(0, value * frames)
  return Math.min(Math.max(0, frameCount - 1), logicalFrame)
}

// The original QuickTime scarab movie advances at 10 visual frames per second.
export const CONTROLLED_MOVIE_FRAME_DURATION_MS = 100

interface ControlledMovieFrameRequest {
  castId: number
  value: number
  frames: number
  direction: number
  frameCount: number
}

interface ControlledMoviePlaybackState {
  value: number
  startFrame: number
  stopFrame: number
  startedAtMs: number | null
}

export interface ControlledMoviePlaybackController {
  frameFor(request: ControlledMovieFrameRequest): number
}

function clampFrame(frame: number, frameCount: number): number {
  return Math.min(Math.max(0, frameCount - 1), Math.max(0, frame))
}

function defaultNow(): number {
  return typeof performance === 'undefined' ? Date.now() : performance.now()
}

export function createControlledMoviePlaybackController({
  frameDurationMs = CONTROLLED_MOVIE_FRAME_DURATION_MS,
  now = defaultNow,
}: {
  frameDurationMs?: number
  now?: () => number
} = {}): ControlledMoviePlaybackController {
  const stateByCastId = new Map<number, ControlledMoviePlaybackState>()

  return {
    frameFor({ castId, value, frames, direction, frameCount }) {
      const stopFrame = calculateControlledFrameIndex({
        value,
        frames,
        frameCount,
      })
      const existing = stateByCastId.get(castId)

      // Loading or restoring a scene presents the saved endpoint immediately.
      // The original runtime only starts playback in response to a later callback.
      if (!existing) {
        stateByCastId.set(castId, {
          value,
          startFrame: stopFrame,
          stopFrame,
          startedAtMs: null,
        })
        return stopFrame
      }

      if (existing.value !== value) {
        if (frames >= 1 && direction !== 0) {
          const startFrame = clampFrame(
            (value - direction) * frames,
            frameCount
          )
          stateByCastId.set(castId, {
            value,
            startFrame,
            stopFrame,
            startedAtMs: now(),
          })
          return startFrame
        }

        stateByCastId.set(castId, {
          value,
          startFrame: stopFrame,
          stopFrame,
          startedAtMs: null,
        })
        return stopFrame
      }

      if (
        existing.startedAtMs === null ||
        existing.startFrame === existing.stopFrame
      ) {
        return existing.stopFrame
      }

      const elapsedFrames = Math.floor(
        Math.max(0, now() - existing.startedAtMs) / frameDurationMs
      )
      const frameStep = Math.sign(existing.stopFrame - existing.startFrame)
      const currentFrame = existing.startFrame + elapsedFrames * frameStep
      const reachedStop =
        frameStep > 0
          ? currentFrame >= existing.stopFrame
          : currentFrame <= existing.stopFrame

      if (reachedStop) {
        existing.startedAtMs = null
        return existing.stopFrame
      }

      return clampFrame(currentFrame, frameCount)
    },
  }
}
