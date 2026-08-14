'use client';

import { useEffect } from 'react';

import {
  MAX_RETAINED_SCENE_PREVIEWS,
  SCENE_PREVIEW_LONG_PRESS_MS,
  selectScenePreviewSource,
  shouldPlayScenePreview,
} from './scenePreviewPlayback';
import type { ScenePreviewSources } from './scenePreviewPlayback';

type MutableCandidate = {
  card: HTMLElement;
  hovered: boolean;
  longPressed: boolean;
  longPressTimer: number | undefined;
  suppressClick: boolean;
  suppressClickTimer: number | undefined;
  sources: ScenePreviewSources;
  video: HTMLVideoElement;
};

type CurrentTouch = {
  candidate: MutableCandidate;
  pointerId: number;
};

export function SceneMediaController() {
  useEffect(() => {
    const videos = Array.from(
      document.querySelectorAll<HTMLVideoElement>('[data-scene-preview]'),
    );
    const motionPreference = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    );
    const candidates = new Map<HTMLElement, MutableCandidate>();
    const loadedCandidates = new Set<MutableCandidate>();
    let currentTouch: CurrentTouch | undefined;
    let reduceMotion = motionPreference.matches;

    for (const video of videos) {
      const id = video.dataset.scenePreview;
      const mp4Source = video.dataset.srcMp4;
      const webmSource = video.dataset.srcWebm;
      const card = video.closest<HTMLElement>('[data-scene-card]');
      if (!id || !mp4Source || !webmSource || !card) {
        throw new Error(
          'Scene preview is missing its card, ID, or media sources',
        );
      }
      candidates.set(card, {
        card,
        hovered: false,
        longPressed: false,
        longPressTimer: undefined,
        suppressClick: false,
        suppressClickTimer: undefined,
        sources: { mp4: mp4Source, webm: webmSource },
        video,
      });
    }

    const candidateFor = (
      target: EventTarget | null,
    ): MutableCandidate | undefined => {
      if (!(target instanceof Element)) return undefined;
      const card = target.closest<HTMLElement>('[data-scene-card]');
      return card ? candidates.get(card) : undefined;
    };

    const shouldPlay = (candidate: MutableCandidate) =>
      shouldPlayScenePreview({
        hovered: candidate.hovered,
        longPressed: candidate.longPressed,
        reduceMotion,
      });

    const pause = (candidate: MutableCandidate) => {
      if (!candidate.video.hasAttribute('src')) return;
      candidate.video.pause();
      candidate.video.dataset.playback = 'paused';
    };

    const unload = (candidate: MutableCandidate) => {
      pause(candidate);
      candidate.video.removeAttribute('src');
      candidate.video.load();
      delete candidate.video.dataset.mediaReady;
      delete candidate.video.dataset.mediaSource;
      delete candidate.video.dataset.playback;
      loadedCandidates.delete(candidate);
    };

    const retain = (candidate: MutableCandidate) => {
      loadedCandidates.delete(candidate);
      loadedCandidates.add(candidate);
      while (loadedCandidates.size > MAX_RETAINED_SCENE_PREVIEWS) {
        const oldestInactive = [...loadedCandidates].find(
          (retained) => retained !== candidate && !shouldPlay(retained),
        );
        if (!oldestInactive) return;
        unload(oldestInactive);
      }
    };

    const play = (candidate: MutableCandidate) => {
      const { video } = candidate;
      if (!video.hasAttribute('src')) {
        const source = selectScenePreviewSource(
          candidate.sources,
          video.canPlayType.bind(video),
        );
        video.src = source.src;
        video.dataset.mediaSource = source.kind;
        video.load();
      }
      retain(candidate);
      if (video.dataset.playback === 'loading' || !video.paused) return;
      video.dataset.playback = 'loading';
      void video
        .play()
        .then(() => {
          video.dataset.mediaReady = 'true';
          if (shouldPlay(candidate)) {
            video.dataset.playback = 'playing';
          } else {
            pause(candidate);
          }
        })
        .catch(() => {
          video.dataset.playback = 'paused';
        });
    };

    const reconcile = (candidate: MutableCandidate) => {
      if (shouldPlay(candidate)) play(candidate);
      else pause(candidate);
    };

    const clearLongPressTimer = (candidate: MutableCandidate) => {
      if (candidate.longPressTimer === undefined) return;
      window.clearTimeout(candidate.longPressTimer);
      candidate.longPressTimer = undefined;
    };

    const scheduleClickReset = (candidate: MutableCandidate) => {
      if (!candidate.suppressClick) return;
      if (candidate.suppressClickTimer !== undefined) {
        window.clearTimeout(candidate.suppressClickTimer);
      }
      candidate.suppressClickTimer = window.setTimeout(() => {
        candidate.suppressClick = false;
        candidate.suppressClickTimer = undefined;
      }, 750);
    };

    const finishCurrentTouch = (pointerId?: number) => {
      if (!currentTouch) return;
      if (pointerId !== undefined && currentTouch.pointerId !== pointerId) {
        return;
      }
      const { candidate } = currentTouch;
      currentTouch = undefined;
      clearLongPressTimer(candidate);
      if (candidate.longPressed) {
        candidate.longPressed = false;
        reconcile(candidate);
      }
      scheduleClickReset(candidate);
    };

    const handlePointerOver = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      const candidate = candidateFor(event.target);
      const relatedTarget =
        event.relatedTarget instanceof Node ? event.relatedTarget : null;
      if (!candidate || candidate.card.contains(relatedTarget)) return;
      candidate.hovered = true;
      reconcile(candidate);
    };

    const handlePointerOut = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      const candidate = candidateFor(event.target);
      const relatedTarget =
        event.relatedTarget instanceof Node ? event.relatedTarget : null;
      if (!candidate || candidate.card.contains(relatedTarget)) return;
      candidate.hovered = false;
      reconcile(candidate);
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (event.pointerType !== 'touch') return;
      finishCurrentTouch();
      const candidate = candidateFor(event.target);
      if (!candidate || reduceMotion) return;
      currentTouch = { candidate, pointerId: event.pointerId };
      candidate.longPressTimer = window.setTimeout(() => {
        candidate.longPressTimer = undefined;
        if (currentTouch?.pointerId !== event.pointerId) return;
        candidate.longPressed = true;
        candidate.suppressClick = true;
        reconcile(candidate);
      }, SCENE_PREVIEW_LONG_PRESS_MS);
    };

    const handlePointerUp = (event: PointerEvent) => {
      finishCurrentTouch(event.pointerId);
    };

    const handlePointerCancel = (event: PointerEvent) => {
      finishCurrentTouch(event.pointerId);
    };

    const handleClick = (event: MouseEvent) => {
      const candidate = candidateFor(event.target);
      if (!candidate?.suppressClick) return;
      event.preventDefault();
      candidate.suppressClick = false;
      if (candidate.suppressClickTimer !== undefined) {
        window.clearTimeout(candidate.suppressClickTimer);
        candidate.suppressClickTimer = undefined;
      }
    };

    const handleContextMenu = (event: MouseEvent) => {
      const candidate = candidateFor(event.target);
      if (
        candidate &&
        (currentTouch?.candidate === candidate || candidate.longPressed)
      ) {
        event.preventDefault();
      }
    };

    const handleMotionPreferenceChange = (event: MediaQueryListEvent) => {
      reduceMotion = event.matches;
      if (!reduceMotion) return;
      finishCurrentTouch();
      for (const candidate of candidates.values()) {
        candidate.hovered = false;
        reconcile(candidate);
      }
    };

    const handleScroll = () => {
      finishCurrentTouch();
    };

    document.addEventListener('pointerover', handlePointerOver);
    document.addEventListener('pointerout', handlePointerOut);
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('pointerup', handlePointerUp);
    document.addEventListener('pointercancel', handlePointerCancel);
    document.addEventListener('click', handleClick, true);
    document.addEventListener('contextmenu', handleContextMenu);
    window.addEventListener('scroll', handleScroll, { passive: true });
    motionPreference.addEventListener('change', handleMotionPreferenceChange);

    return () => {
      document.removeEventListener('pointerover', handlePointerOver);
      document.removeEventListener('pointerout', handlePointerOut);
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('pointerup', handlePointerUp);
      document.removeEventListener('pointercancel', handlePointerCancel);
      document.removeEventListener('click', handleClick, true);
      document.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('scroll', handleScroll);
      motionPreference.removeEventListener(
        'change',
        handleMotionPreferenceChange,
      );
      if (currentTouch) clearLongPressTimer(currentTouch.candidate);
      for (const candidate of candidates.values()) {
        if (candidate.suppressClickTimer !== undefined) {
          window.clearTimeout(candidate.suppressClickTimer);
        }
        unload(candidate);
      }
    };
  }, []);

  return null;
}
