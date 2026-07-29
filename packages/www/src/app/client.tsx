'use client';

import type { CSSProperties } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { LivingSaveSlotManager } from '@/morpheus-app/components/save-slots/LivingSaveSlotManager';
import { MORPHEUS_INITIAL_SCENE_ID } from '@/morpheus-app/storage/livingSaveIdentity';
import { useLivingSaveCoordinator } from '@/morpheus-app/store/LivingSaveCoordinatorContext';
import type { LivingSaveSlotSummary } from '@/morpheus-app/store/slices/livingSavesSlice';
import { getAssetUrl } from '@/service/gamedb';
import { createIntroCompletionGate } from './introCompletionGate';
import styles from './title-screen.module.css';

type TitlePhase = 'title' | 'intro' | 'error';

const assetBase =
  process.env.NEXT_PUBLIC_MORPHEUS_ASSET_BASE?.replace(/\/+$/, '') ||
  '/morpheus-assets';
const INTRO_WEBM = getAssetUrl('GameDB/Deck1/introMOV.webm');
const INTRO_MP4 = getAssetUrl('GameDB/Deck1/introMOV.mp4');
const TITLE_ART_STYLE: CSSProperties & { '--title-image': string } = {
  '--title-image': `url("${assetBase}/texture/title.png")`,
};

export const Client = () => {
  const router = useRouter();
  const coordinator = useLivingSaveCoordinator();
  const videoRef = useRef<HTMLVideoElement>(null);
  const mountedRef = useRef(true);
  const selectingSlotRef = useRef(false);
  const introCompletionGateRef = useRef(createIntroCompletionGate());
  const introPlaybackGenerationRef = useRef(0);
  const introPlaybackActiveRef = useRef(false);
  const cancelIntroErrorListenerRef = useRef<(() => void) | undefined>();
  const [phase, setPhase] = useState<TitlePhase>('title');

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      cancelIntroErrorListenerRef.current?.();
      cancelIntroErrorListenerRef.current = undefined;
    };
  }, []);

  const startGame = useCallback(() => {
    router.push(`/scene/${MORPHEUS_INITIAL_SCENE_ID}`);
  }, [router]);

  const finishIntro = useCallback(() => {
    if (introCompletionGateRef.current.markIntroFinished()) {
      startGame();
    }
  }, [startGame]);

  const clearIntroErrorListener = useCallback(() => {
    cancelIntroErrorListenerRef.current?.();
    cancelIntroErrorListenerRef.current = undefined;
  }, []);

  const playIntro = useCallback(() => {
    const video = videoRef.current;
    if (!video) {
      setPhase('error');
      return;
    }

    const playbackGeneration = ++introPlaybackGenerationRef.current;
    introPlaybackActiveRef.current = true;
    clearIntroErrorListener();
    const handleError = () => {
      if (
        mountedRef.current &&
        introPlaybackActiveRef.current &&
        playbackGeneration === introPlaybackGenerationRef.current
      ) {
        setPhase('error');
      }
    };
    video.addEventListener('error', handleError, { once: true });
    cancelIntroErrorListenerRef.current = () => {
      video.removeEventListener('error', handleError);
    };
    video.currentTime = 0;
    setPhase('intro');
    void video.play().catch(() => {
      if (
        mountedRef.current &&
        introPlaybackActiveRef.current &&
        playbackGeneration === introPlaybackGenerationRef.current
      ) {
        setPhase('error');
      }
    });
  }, [clearIntroErrorListener]);

  const selectSlot = useCallback(
    async (slot: LivingSaveSlotSummary) => {
      if (selectingSlotRef.current || phase !== 'title') {
        return;
      }
      if (slot.state === 'unloadable') {
        return;
      }

      selectingSlotRef.current = true;
      const isNewSlot = slot.state === 'empty';
      if (isNewSlot) {
        // iOS only permits audible media to start directly from the tap that
        // requested it. Creating the slot first crosses an async boundary and
        // turns this into a policy-blocked autoplay attempt.
        introCompletionGateRef.current.reset();
        playIntro();
      }
      const outcome =
        isNewSlot
          ? await coordinator.createNewSlot(slot.slotId)
          : await coordinator.restoreSlot(slot.slotId);

      if (!mountedRef.current) {
        return;
      }
      if (!outcome.ok) {
        if (isNewSlot) {
          const video = videoRef.current;
          introPlaybackActiveRef.current = false;
          introPlaybackGenerationRef.current += 1;
          clearIntroErrorListener();
          introCompletionGateRef.current.reset();
          video?.pause();
          if (video) {
            video.currentTime = 0;
          }
          setPhase('title');
        }
        selectingSlotRef.current = false;
        return;
      }
      if (isNewSlot && introCompletionGateRef.current.markSaveReady()) {
        startGame();
      }
    },
    [clearIntroErrorListener, coordinator, phase, playIntro, startGame],
  );

  return (
    <main className={styles.screen} data-title-phase={phase}>
      <section
        className={`${styles.title} ${phase === 'title' ? styles.visible : ''}`}
        aria-hidden={phase !== 'title'}
      >
        <div className={styles.titleArt} style={TITLE_ART_STYLE}>
          <div className={styles.slotHub}>
            <LivingSaveSlotManager
              title="Choose your journey"
              onSelect={(slot) => {
                void selectSlot(slot);
              }}
            />
          </div>
        </div>
      </section>

      <section
        className={`${styles.intro} ${phase === 'intro' ? styles.visible : ''}`}
        aria-hidden={phase !== 'intro'}
      >
        <video
          ref={videoRef}
          className={styles.introMovie}
          preload="metadata"
          playsInline
          onEnded={finishIntro}
        >
          <source src={INTRO_MP4} type="video/mp4" />
          <source src={INTRO_WEBM} type="video/webm" />
        </video>
        <button
          type="button"
          className={styles.skipButton}
          onClick={finishIntro}
          tabIndex={phase === 'intro' ? 0 : -1}
        >
          Skip intro
        </button>
      </section>

      {phase === 'error' && (
        <section className={styles.error} role="alert">
          <p>The game could not start.</p>
          <button type="button" onClick={startGame}>
            Start game
          </button>
        </section>
      )}
    </main>
  );
};
