'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Scene } from '@soapbubble/morpheus-client/morpheus/casts/types';
import { fetch as fetchScene } from '@soapbubble/morpheus-client/service/scene';

import { findScene, getSceneTypeLabel } from '@/lib/sceneCatalog';
import { GameStageShell } from '@/morpheus-app/components/GameStageShell';
import { RuntimeProvider } from '@/morpheus-app/runtime/RuntimeProvider';
import { explorerRuntimePolicy } from '@/morpheus-app/runtime/runtimePolicy';
import { replaceSceneAddress } from './sceneAddress';
import {
  readSceneMutedPreference,
  writeSceneMutedPreference,
} from './sceneAudioPreference';
import { shareScene, type SceneShareOutcome } from './sceneSharing';
import styles from './scene-page.module.css';

interface ClientProps {
  scene: Scene;
  mcpSessionName: string | null;
}

type RuntimeSeed = {
  generation: number;
  scene: Scene;
};

type ShareFeedback = 'idle' | 'sharing' | SceneShareOutcome | 'failed';
type ResetFeedback = 'idle' | 'resetting' | 'reset' | 'failed';

const shareLabels: Record<ShareFeedback, string> = {
  idle: 'Share scene',
  sharing: 'Sharing…',
  shared: 'Shared',
  copied: 'Copied',
  dismissed: 'Share scene',
  failed: 'Try sharing again',
};

const resetLabels: Record<ResetFeedback, string> = {
  idle: 'Reset scene',
  resetting: 'Resetting…',
  reset: 'Scene reset',
  failed: 'Try reset again',
};

const SpeakerIcon = ({ isMuted }: { isMuted: boolean }) => (
  <svg aria-hidden="true" className={styles.audioIcon} viewBox="0 0 24 24">
    <path d="M4 9v6h4l5 4V5L8 9H4Z" />
    {isMuted ? (
      <path d="m17 9 4 4m0-4-4 4" />
    ) : (
      <path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" />
    )}
  </svg>
);

export const Client = ({ scene, mcpSessionName }: ClientProps) => {
  const [runtimeSeed, setRuntimeSeed] = useState<RuntimeSeed>({
    generation: 0,
    scene,
  });
  const [currentSceneId, setCurrentSceneId] = useState(scene.sceneId);
  const [shareFeedback, setShareFeedback] = useState<ShareFeedback>('idle');
  const [resetFeedback, setResetFeedback] = useState<ResetFeedback>('idle');
  const [isMuted, setIsMuted] = useState(true);
  const shareFeedbackTimerRef = useRef<number | null>(null);
  const resetFeedbackTimerRef = useRef<number | null>(null);
  const policy = useMemo(
    () => explorerRuntimePolicy(runtimeSeed.scene.sceneId),
    [runtimeSeed.scene.sceneId],
  );
  const catalogScene = findScene(currentSceneId);
  const sceneType = catalogScene
    ? getSceneTypeLabel(catalogScene)
    : 'Morpheus scene';

  useEffect(
    () => () => {
      if (shareFeedbackTimerRef.current !== null) {
        window.clearTimeout(shareFeedbackTimerRef.current);
      }
      if (resetFeedbackTimerRef.current !== null) {
        window.clearTimeout(resetFeedbackTimerRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    try {
      setIsMuted(readSceneMutedPreference(window.localStorage));
    } catch (error) {
      console.warn(
        'Unable to read the scene explorer audio preference.',
        error,
      );
    }
  }, []);

  const clearFeedbackAfterDelay = useCallback(
    (timerRef: typeof shareFeedbackTimerRef, reset: () => void) => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
      timerRef.current = window.setTimeout(reset, 1800);
    },
    [],
  );

  const handleCurrentSceneChange = useCallback((sceneId: number) => {
    setCurrentSceneId(sceneId);
    setResetFeedback('idle');
    replaceSceneAddress(sceneId, window.history, window.location.search);
  }, []);

  const handleShare = useCallback(async () => {
    setShareFeedback('sharing');
    try {
      const outcome = await shareScene(
        window.navigator,
        currentSceneId,
        window.location.href,
      );
      setShareFeedback(outcome === 'dismissed' ? 'idle' : outcome);
      if (outcome !== 'dismissed') {
        clearFeedbackAfterDelay(shareFeedbackTimerRef, () =>
          setShareFeedback('idle'),
        );
      }
    } catch {
      setShareFeedback('failed');
      clearFeedbackAfterDelay(shareFeedbackTimerRef, () =>
        setShareFeedback('idle'),
      );
    }
  }, [clearFeedbackAfterDelay, currentSceneId]);

  const handleReset = useCallback(async () => {
    setResetFeedback('resetting');
    try {
      const resetScene = await fetchScene(currentSceneId);
      if (!resetScene) {
        throw new Error(`Scene ${currentSceneId} could not be loaded`);
      }
      setRuntimeSeed((current) => ({
        generation: current.generation + 1,
        scene: resetScene,
      }));
      setResetFeedback('reset');
      clearFeedbackAfterDelay(resetFeedbackTimerRef, () =>
        setResetFeedback('idle'),
      );
    } catch {
      setResetFeedback('failed');
    }
  }, [clearFeedbackAfterDelay, currentSceneId]);

  const handleMuteToggle = useCallback(() => {
    setIsMuted((current) => {
      const next = !current;
      try {
        writeSceneMutedPreference(window.localStorage, next);
      } catch (error) {
        console.warn(
          'Unable to save the scene explorer audio preference.',
          error,
        );
      }
      return next;
    });
  }, []);

  return (
    <div className={styles.page}>
      <a className={styles.skipLink} href="#scene-stage">
        Skip to scene
      </a>
      <header className={styles.header}>
        <div className={styles.issueLine}>
          <Link href="/">Soap Bubble Productions</Link>
          <span>Interactive map folio</span>
          <Link href="/scenes">All scenes →</Link>
        </div>
        <div className={styles.titleRow}>
          <div>
            <p className={styles.kicker}>{sceneType}</p>
            <h1 aria-live="polite">
              <span>Scene</span> {currentSceneId}
            </h1>
          </div>
        </div>
      </header>

      <main className={styles.main}>
        <section className={styles.playerSection} aria-label="Playable scene">
          <div id="scene-stage" className={styles.stageFrame}>
            <RuntimeProvider
              key={`${runtimeSeed.scene.sceneId}:${runtimeSeed.generation}`}
              policy={policy}
              scene={runtimeSeed.scene}
            >
              <GameStageShell
                mcpSessionName={mcpSessionName}
                onCurrentSceneChange={handleCurrentSceneChange}
                sizing="container"
                volume={isMuted ? 0 : 0.5}
              />
            </RuntimeProvider>
          </div>

          <div className={styles.controls}>
            <p>
              <span>Now exploring</span>
              Scene {currentSceneId}
            </p>
            <div className={styles.actions}>
              <button
                type="button"
                data-feedback={resetFeedback}
                disabled={resetFeedback === 'resetting'}
                onClick={() => void handleReset()}
              >
                {resetLabels[resetFeedback]}
              </button>
              <button
                type="button"
                aria-label="Mute scene audio"
                aria-pressed={isMuted}
                className={styles.audioButton}
                onClick={handleMuteToggle}
              >
                <SpeakerIcon isMuted={isMuted} />
                {isMuted ? 'Muted' : 'Sound on'}
              </button>
              <button
                type="button"
                data-feedback={shareFeedback}
                disabled={shareFeedback === 'sharing'}
                onClick={() => void handleShare()}
              >
                {shareLabels[shareFeedback]}
              </button>
            </div>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <Link href="/scenes">← Return to the scene index</Link>
        <Link href="/morpheus">Play the complete game →</Link>
      </footer>
    </div>
  );
};
