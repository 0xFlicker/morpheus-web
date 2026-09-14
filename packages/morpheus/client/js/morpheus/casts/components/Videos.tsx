import { createMoviePlayback } from './moviePlayback'
import { useHDAssetsEnabled } from 'service/useHDAssetsEnabled'
import React, {
  useRef,
  useEffect,
  useMemo,
  useCallback,
  SyntheticEvent,
} from 'react'
import { getAssetUrl } from 'service/gamedb'
import { MovieSpecialCast } from '../types'
import { MediaPlaybackResult } from './mediaPlayback'
import {
  waitForVideoFrames,
  type CancelVideoFrameWait,
} from './videoPresentation'

// The first compositor callback can still expose a decoder startup frame.
// Waiting for the following frame removed the observed one-frame black seam.
const MOVIE_PRESENTATION_FRAME_COUNT = 2

type VideoEvent = (e: SyntheticEvent<HTMLVideoElement>) => void
type VideoRef = (el: HTMLVideoElement | null) => void
export interface VideoController {
  el: HTMLVideoElement | null
  castIds: number[]
  play: (presentationKey: string, activationKey: string) => Promise<MediaPlaybackResult>
  pause: () => void
  end: () => void
}
type VideoControllerRef = (a: VideoController) => void
export type VideoCastEventCallback = (
  ref: [HTMLVideoElement, MovieSpecialCast[]]
) => void
export type VideoCastRefCallback = (
  ref: [VideoController, MovieSpecialCast[]]
) => void
export type VideoCastFramePresentedCallback = (
  ref: [HTMLVideoElement, MovieSpecialCast[], string]
) => void

interface VideoElProps {
  url: string
  volume: number
  casts: MovieSpecialCast[]
  looping: boolean
  onVideoRef: VideoControllerRef
  onVideoEnded: VideoEvent
  onVideoCanPlayThrough: VideoEvent
  onVideoFramePresented: (
    video: HTMLVideoElement,
    presentationKey: string
  ) => void
}

const VideoEl = ({
  url,
  volume,
  looping,
  casts,
  onVideoRef,
  onVideoEnded,
  onVideoCanPlayThrough,
  onVideoFramePresented,
}: VideoElProps) => {
  const hdEnabled = useHDAssetsEnabled()
  const videoRef = useRef<HTMLVideoElement>(null)
  const playbackRef = useRef<ReturnType<typeof createMoviePlayback> | undefined>(undefined)
  const hasRegistered = useRef(false)
  const cancelFrameWaitRef = useRef<CancelVideoFrameWait | undefined>(undefined)
  // Store latest values in refs to avoid callback dependencies
  const castsRef = useRef(casts)
  const onVideoRefRef = useRef(onVideoRef)
  const onVideoFramePresentedRef = useRef(onVideoFramePresented)
  castsRef.current = casts
  onVideoRefRef.current = onVideoRef
  onVideoFramePresentedRef.current = onVideoFramePresented

  const handleVideoRef = useCallback((el: HTMLVideoElement | null) => {
    videoRef.current = el
    if (el && !hasRegistered.current) {
      hasRegistered.current = true
      const playback = createMoviePlayback(el)
      playbackRef.current = playback
      const currentCasts = castsRef.current
      const controller = {
        el,
        castIds: currentCasts.map((c) => c.castId),
        async play(presentationKey: string, activationKey: string) {
          if (!videoRef.current) {
            return 'failed'
          }
          const result = await playback.play(activationKey, () => {
            cancelFrameWaitRef.current?.()
            cancelFrameWaitRef.current = waitForVideoFrames(
              el,
              MOVIE_PRESENTATION_FRAME_COUNT,
              () => {
                cancelFrameWaitRef.current = undefined
                if (videoRef.current) {
                  onVideoFramePresentedRef.current(
                    videoRef.current,
                    presentationKey
                  )
                }
              }
            )
          })
          if (result === 'completed' && videoRef.current) {
            onVideoFramePresentedRef.current(videoRef.current, presentationKey)
          }
          if (result === 'failed') {
            cancelFrameWaitRef.current?.()
            cancelFrameWaitRef.current = undefined
          }
          return result
        },
        pause() {
          if (videoRef.current) {
            videoRef.current.pause()
          }
        },
        end() {
          cancelFrameWaitRef.current?.()
          cancelFrameWaitRef.current = undefined
          playback.end()
        },
      }
      onVideoRefRef.current(controller)
    } else if (!el) {
      cancelFrameWaitRef.current?.()
      cancelFrameWaitRef.current = undefined
      playbackRef.current = undefined
      hasRegistered.current = false
    }
  }, [])

  useEffect(
    () => () => {
      cancelFrameWaitRef.current?.()
      cancelFrameWaitRef.current = undefined
    },
    []
  )

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.volume = volume
      videoRef.current.muted = volume === 0
    }
  }, [volume])

  return (
    <video
      ref={handleVideoRef}
      style={{
        display: 'none',
      }}
      autoPlay={false}
      crossOrigin="anonymous"
      muted={volume === 0}
      playsInline
      webkit-playsinline="webkit-playsinline"
      loop={looping}
      onEnded={event => {
        playbackRef.current?.complete()
        onVideoEnded(event)
      }}
      onCanPlayThrough={onVideoCanPlayThrough}
    >
      <source src={getAssetUrl(`${url}.mp4`, undefined, hdEnabled)} type="video/mp4" />
      <source src={getAssetUrl(`${url}.webm`, undefined, hdEnabled)} type="video/webm" />
    </video>
  )
}

interface IVideoProps {
  movieSpecialCasts: MovieSpecialCast[]
  volume: number
  onVideoCastEnded: VideoCastEventCallback
  onVideoCastCanPlaythrough: VideoCastEventCallback
  onVideoCastFramePresented: VideoCastFramePresentedCallback
  onVideoCastRef: VideoCastRefCallback
}

// Used to compute VideoMovieCastCollection
interface MovieCastCollectionMap {
  [key: string]: MovieSpecialCast[]
}

// A single HTMLVideoElement a collection of movieCasts the reference it
interface VideoMovieCastCollection {
  url: string
  looping: boolean
  casts: MovieSpecialCast[]
  onVideoEnded: VideoEvent
  onVideoCanPlaythrough: VideoEvent
  onVideoFramePresented: (
    video: HTMLVideoElement,
    presentationKey: string
  ) => void
  onVideoRef: VideoControllerRef
}

const Video = ({
  movieSpecialCasts,
  volume,
  onVideoCastRef,
  onVideoCastCanPlaythrough,
  onVideoCastFramePresented,
  onVideoCastEnded,
}: IVideoProps) => {
  const hdEnabled = useHDAssetsEnabled()
  const aggregatedCastRefs = useMemo(
    () =>
      Object.entries(
        movieSpecialCasts.reduce(
          (memo: MovieCastCollectionMap, curr: MovieSpecialCast) => {
            const { fileName } = curr
            const ref = (memo[fileName] = memo[fileName] || [])
            ref.push(curr)
            return memo
          },
          {} as MovieCastCollectionMap
        )
      ).map(([url, movieCasts]) => {
        return {
          url,
          casts: movieCasts,
          // autoplay: !!castRefs.find(({ autoplay }) => autoplay),
          looping: !!movieCasts.find(({ looping }) => looping),
          onVideoRef(ref) {
            onVideoCastRef([ref, movieCasts])
          },
          onVideoCanPlaythrough(e: SyntheticEvent<HTMLVideoElement>) {
            onVideoCastCanPlaythrough([e.currentTarget, movieCasts])
          },
          onVideoFramePresented(
            video: HTMLVideoElement,
            presentationKey: string
          ) {
            onVideoCastFramePresented([video, movieCasts, presentationKey])
          },
          onVideoEnded(e: SyntheticEvent<HTMLVideoElement>) {
            onVideoCastEnded([e.currentTarget, movieCasts])
          },
        } as VideoMovieCastCollection
      }),
    [
      movieSpecialCasts,
      onVideoCastCanPlaythrough,
      onVideoCastFramePresented,
      onVideoCastEnded,
      onVideoCastRef,
    ]
  )

  return (
    <React.Fragment>
      {aggregatedCastRefs.map(
        ({
          casts,
          url,
          looping,
          onVideoRef,
          onVideoCanPlaythrough,
          onVideoEnded,
          onVideoFramePresented,
        }) => {
          return (
            <VideoEl
              key={getAssetUrl(url, 'mp4', hdEnabled)}
              url={url}
              casts={casts}
              looping={looping}
              volume={volume}
              onVideoRef={onVideoRef}
              onVideoEnded={onVideoEnded}
              onVideoCanPlayThrough={onVideoCanPlaythrough}
              onVideoFramePresented={onVideoFramePresented}
            />
          )
        }
      )}
    </React.Fragment>
  )
}

export default Video
