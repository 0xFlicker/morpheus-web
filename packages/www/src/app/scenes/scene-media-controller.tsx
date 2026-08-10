'use client';

import { useEffect } from 'react';

import {
  chooseActiveSceneMedia,
  type SceneMediaCandidate,
} from './sceneMediaActivation';

type MutableCandidate = {
  video: HTMLVideoElement;
  focused: boolean;
  nearViewport: boolean;
  sequence: number;
};

export function SceneMediaController() {
  useEffect(() => {
    const videos = Array.from(
      document.querySelectorAll<HTMLVideoElement>('[data-scene-preview]'),
    );
    const reduceMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    const candidates = new Map<string, MutableCandidate>();
    let sequence = 0;

    for (const video of videos) {
      const id = video.dataset.scenePreview;
      const source = video.dataset.src;
      if (!id || !source) {
        throw new Error('Scene preview is missing its ID or source');
      }
      candidates.set(id, {
        video,
        focused: false,
        nearViewport: false,
        sequence: 0,
      });
    }

    const deactivate = (video: HTMLVideoElement) => {
      if (!video.hasAttribute('src')) return;
      video.pause();
      video.removeAttribute('src');
      video.load();
      delete video.dataset.mediaActive;
    };

    const activate = (video: HTMLVideoElement) => {
      if (video.hasAttribute('src')) return;
      const source = video.dataset.src;
      if (!source) {
        throw new Error('Scene preview is missing its source');
      }
      video.autoplay = !reduceMotion;
      video.src = source;
      video.load();
      video.dataset.mediaActive = 'true';
      if (!reduceMotion) {
        void video.play().catch(() => {
          video.dataset.playback = 'paused';
        });
      }
    };

    const reconcile = () => {
      const rows: SceneMediaCandidate[] = Array.from(
        candidates,
        ([id, candidate]) => ({
          id,
          focused: candidate.focused,
          nearViewport: candidate.nearViewport,
          sequence: candidate.sequence,
        }),
      );
      const activeIds = new Set(chooseActiveSceneMedia(rows));
      for (const [id, candidate] of candidates) {
        if (activeIds.has(id)) activate(candidate.video);
        else deactivate(candidate.video);
      }
    };

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!(entry.target instanceof HTMLVideoElement)) continue;
          const video = entry.target;
          const id = video.dataset.scenePreview;
          const candidate = id ? candidates.get(id) : undefined;
          if (!candidate) continue;
          candidate.nearViewport = entry.isIntersecting;
          if (entry.isIntersecting) candidate.sequence = ++sequence;
        }
        reconcile();
      },
      { rootMargin: '600px 0px' },
    );

    const handleFocusIn = (event: FocusEvent) => {
      if (!(event.target instanceof Element)) return;
      const card = event.target.closest<HTMLElement>('[data-scene-card]');
      const video = card?.querySelector<HTMLVideoElement>(
        '[data-scene-preview]',
      );
      const id = video?.dataset.scenePreview;
      const candidate = id ? candidates.get(id) : undefined;
      if (!candidate) return;
      candidate.focused = true;
      candidate.sequence = ++sequence;
      reconcile();
    };

    const handleFocusOut = (event: FocusEvent) => {
      if (!(event.target instanceof Element)) return;
      const card = event.target.closest<HTMLElement>('[data-scene-card]');
      const relatedTarget =
        event.relatedTarget instanceof Node ? event.relatedTarget : null;
      if (card?.contains(relatedTarget)) return;
      const video = card?.querySelector<HTMLVideoElement>(
        '[data-scene-preview]',
      );
      const id = video?.dataset.scenePreview;
      const candidate = id ? candidates.get(id) : undefined;
      if (!candidate) return;
      candidate.focused = false;
      reconcile();
    };

    for (const video of videos) observer.observe(video);
    document.addEventListener('focusin', handleFocusIn);
    document.addEventListener('focusout', handleFocusOut);

    return () => {
      observer.disconnect();
      document.removeEventListener('focusin', handleFocusIn);
      document.removeEventListener('focusout', handleFocusOut);
      for (const video of videos) deactivate(video);
    };
  }, []);

  return null;
}
