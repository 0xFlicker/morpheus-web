'use client';

import type { CSSProperties } from 'react';
import { useCallback, useEffect, useReducer, useRef } from 'react';
import { fetch as fetchScene } from '@soapbubble/morpheus-client/service/scene';

import { GameStageShell } from '@/morpheus-app/components/GameStageShell';
import { LivingSaveSlotManager } from '@/morpheus-app/components/save-slots/LivingSaveSlotManager';
import { RuntimeProvider } from '@/morpheus-app/runtime/RuntimeProvider';
import { gamePhaseReducer } from '@/morpheus-app/runtime/gamePhase';
import { fullGameRuntimePolicy } from '@/morpheus-app/runtime/runtimePolicy';
import { useLivingSaveCoordinator } from '@/morpheus-app/store/LivingSaveCoordinatorContext';
import { useAppSelector } from '@/morpheus-app/store/hooks';
import { createBrowserLivingSaveCoordinator } from '@/morpheus-app/store/livingSaveCoordinator';
import { selectLivingSaves } from '@/morpheus-app/store/slices/livingSavesSlice';
import type { LivingSaveSlotSummary } from '@/morpheus-app/store/slices/livingSavesSlice';
import type { AppStore } from '@/morpheus-app/store/store';
import { getAssetUrl } from '@/service/gamedb';
import { createIntroCompletionGate } from '../introCompletionGate';
import styles from './title-screen.module.css';

const assetBase =
  process.env.NEXT_PUBLIC_MORPHEUS_ASSET_BASE?.replace(/\/+$/, '') ||
  '/morpheus-assets';
const INTRO_WEBM = getAssetUrl('GameDB/Deck1/introMOV.webm');
const INTRO_MP4 = getAssetUrl('GameDB/Deck1/introMOV.mp4');
const TITLE_ART_STYLE: CSSProperties & { '--title-image': string } = {
  '--title-image': `url("${assetBase}/texture/title.png")`,
};

const FullGame = ({ mcpSessionName }: { mcpSessionName: string | null }) => {
  const coordinator = useLivingSaveCoordinator();
  const livingSaves = useAppSelector(selectLivingSaves);
  const videoRef = useRef<HTMLVideoElement>(null);
  const mountedRef = useRef(true);
  const selectingSlotRef = useRef(false);
  const introCompletionGateRef = useRef(createIntroCompletionGate());
  const introPlaybackGenerationRef = useRef(0);
  const introPlaybackActiveRef = useRef(false);
  const cancelIntroErrorListenerRef = useRef<(() => void) | undefined>(
    undefined,
  );
  const [phase, sendPhase] = useReducer(gamePhaseReducer, 'title');

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      cancelIntroErrorListenerRef.current?.();
      cancelIntroErrorListenerRef.current = undefined;
    };
  }, []);

  useEffect(() => {
    if (livingSaves.bootstrapPhase !== 'idle') {
      return;
    }
    void coordinator.bootstrap();
  }, [coordinator, livingSaves.bootstrapPhase]);

  const clearIntroErrorListener = useCallback(() => {
    cancelIntroErrorListenerRef.current?.();
    cancelIntroErrorListenerRef.current = undefined;
  }, []);

  const stopIntroPlayback = useCallback(() => {
    const video = videoRef.current;
    introPlaybackActiveRef.current = false;
    introPlaybackGenerationRef.current += 1;
    clearIntroErrorListener();
    video?.pause();
    if (video) {
      video.currentTime = 0;
    }
  }, [clearIntroErrorListener]);

  const startGame = useCallback(() => {
    selectingSlotRef.current = false;
    stopIntroPlayback();
    sendPhase({ type: 'game-ready' });
  }, [stopIntroPlayback]);

  const finishIntro = useCallback(() => {
    if (introCompletionGateRef.current.markIntroFinished()) {
      startGame();
    }
  }, [startGame]);

  const returnToTitle = useCallback(() => {
    selectingSlotRef.current = false;
    introCompletionGateRef.current.reset();
    stopIntroPlayback();
    sendPhase({ type: 'return-to-title' });
  }, [stopIntroPlayback]);

  const playIntro = useCallback(() => {
    const video = videoRef.current;
    if (!video) {
      sendPhase({ type: 'start-failed' });
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
        sendPhase({ type: 'start-failed' });
      }
    };
    video.addEventListener('error', handleError, { once: true });
    cancelIntroErrorListenerRef.current = () => {
      video.removeEventListener('error', handleError);
    };
    video.currentTime = 0;
    void video.play().catch(() => {
      if (
        mountedRef.current &&
        introPlaybackActiveRef.current &&
        playbackGeneration === introPlaybackGenerationRef.current
      ) {
        sendPhase({ type: 'start-failed' });
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
        sendPhase({ type: 'new-game-selected' });
        playIntro();
      }
      const outcome = isNewSlot
        ? await coordinator.createNewSlot(slot.slotId)
        : await coordinator.restoreSlot(slot.slotId);

      if (!mountedRef.current) {
        return;
      }
      if (!outcome.ok) {
        if (isNewSlot) {
          returnToTitle();
        }
        selectingSlotRef.current = false;
        return;
      }
      if (isNewSlot && introCompletionGateRef.current.markSaveReady()) {
        startGame();
      }
      if (!isNewSlot) {
        startGame();
      }
    },
    [coordinator, phase, playIntro, returnToTitle, startGame],
  );

  if (phase === 'stage') {
    return (
      <GameStageShell
        mcpSessionName={mcpSessionName}
        onReturnToTitle={returnToTitle}
      />
    );
  }

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
          <button type="button" onClick={finishIntro}>
            Start game
          </button>
        </section>
      )}
    </main>
  );
};

export const Client = ({
  mcpSessionName = null,
}: {
  mcpSessionName?: string | null;
}) => {
  const createCoordinator = useCallback(
    (store: AppStore) =>
      createBrowserLivingSaveCoordinator({
        dispatch: store.dispatch,
        getState: store.getState,
        fetchScene: async (sceneId) => {
          try {
            return (await fetchScene(sceneId)) ?? null;
          } catch {
            return null;
          }
        },
      }),
    [],
  );

  return (
    <RuntimeProvider
      policy={fullGameRuntimePolicy}
      createLivingSaveCoordinator={createCoordinator}
    >
      <FullGame mcpSessionName={mcpSessionName} />
    </RuntimeProvider>
  );
};
