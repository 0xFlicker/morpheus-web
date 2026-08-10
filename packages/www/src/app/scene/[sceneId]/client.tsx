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

export const Client = ({ scene, mcpSessionName }: ClientProps) => {
  const [runtimeSeed, setRuntimeSeed] = useState<RuntimeSeed>({
    generation: 0,
    scene,
  });
  const [currentSceneId, setCurrentSceneId] = useState(scene.sceneId);
  const [shareFeedback, setShareFeedback] = useState<ShareFeedback>('idle');
  const [resetFeedback, setResetFeedback] = useState<ResetFeedback>('idle');
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
            <p className={styles.kicker}>{sceneType} · Fresh game state</p>
            <h1 aria-live="polite">
              <span>Scene</span> {currentSceneId}
            </h1>
          </div>
          <p className={styles.intro}>
            This is the game, started here from a clean state. Click its
            hotspots to follow the authored map; the scene folio follows along.
          </p>
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
