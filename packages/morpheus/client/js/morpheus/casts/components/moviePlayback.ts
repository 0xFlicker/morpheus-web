import { startMediaPlayback, type MediaPlaybackResult, type PlayableMedia } from './mediaPlayback'

interface MovieMedia extends PlayableMedia {
  currentTime: number
  readonly ended: boolean
  readonly loop: boolean
  pause: () => void
}

// Scene activation is distinct from presentation: clearing a transition cover
// must not make a completed movie eligible to play again.
export function createMoviePlayback(media: MovieMedia) {
  let activation: string | undefined
  let previouslyActivated = false
  let completed = false

  return {
    async play(key: string, beforePlay: () => void): Promise<MediaPlaybackResult> {
      if (activation !== key) {
        if (previouslyActivated) media.currentTime = 0
        activation = key
        previouslyActivated = true
        completed = false
      }
      if (!media.loop && (completed || media.ended)) {
        completed = true
        return 'completed'
      }
      beforePlay()
      return startMediaPlayback(media)
    },
    complete() {
      completed = true
    },
    end() {
      media.pause()
      activation = undefined
      completed = false
    },
  }
}
