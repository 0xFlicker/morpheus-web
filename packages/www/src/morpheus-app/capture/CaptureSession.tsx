'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { Scene } from '@soapbubble/morpheus-client/morpheus/casts/types';
import {
  getScenePresentationRenderers,
  type ScenePresentationRequest,
} from 'morpheus/casts/presentation';

import InteractiveStage from '@/morpheus-app/components/InteractiveStage';
import { captureStageFrame } from '@/morpheus-app/capture/captureStageFrame';
import { useAppDispatch, useAppSelector } from '@/morpheus-app/store/hooks';
import { selectGamestatesAccessor } from '@/morpheus-app/store/slices/gamestateSlice';
import {
  activateScene,
  scenePrefetched,
} from '@/morpheus-app/store/slices/sceneSlice';
import {
  selectRotation,
  setRotation,
} from '@/morpheus-app/store/slices/rotationSlice';

export type CaptureStatus =
  | 'booting'
  | 'waiting_ready'
  | 'capturing'
  | 'done'
  | 'failed';

export type CaptureResult = {
  sceneId: number;
  kind: 'pano' | 'special';
  status: CaptureStatus;
  frames: string[];
  frameCount: number;
  error?: string;
  policyVersion: string;
};

const CAPTURE_POLICY_VERSION = 'og-gif-v1';
const DEFAULT_PANO_FRAMES = 24;
/**
 * Authored / living-save entry heading (morpheus ROT / yaw3600).
 * Matches livingSaveCoordinator bootstrap.
 */
export const PANO_AUTHORED_ENTRY_YAW3600 = 1500;
export const PANO_FULL_ROTATION = 3600;
/**
 * Small left nudge so the first frame matches entry framing.
 * Half of one 24-frame sector (3600/24/2 = 75). A full FOV half-slice
 * (~352) overshot hard left in capture.
 */
export const PANO_ENTRY_YAW_NUDGE = Math.round(PANO_FULL_ROTATION / 24 / 2); // 75
/** Capture start yaw after nudge. */
export const PANO_ENTRY_YAW3600 =
  (PANO_AUTHORED_ENTRY_YAW3600 - PANO_ENTRY_YAW_NUDGE + PANO_FULL_ROTATION) %
  PANO_FULL_ROTATION; // 1425
const DEFAULT_SPECIAL_MS = 3000;
const SPECIAL_FPS = 8;
const READY_TIMEOUT_MS = 45000;
const POST_READY_SETTLE_MS = 200;

/**
 * Full 360° yaw samples (morpheus ROT units 0–3600).
 *
 * First frame is the previous sequence’s last sample (entry + (n−1)·step), so
 * static GIF clients (OG crawlers that freeze on frame 0) show the best entry
 * framing. Remaining frames walk a full revolution and loop cleanly back.
 */
export function panoCaptureYawSequence(
  steps: number,
  entryYaw3600 = PANO_ENTRY_YAW3600,
): number[] {
  const count = Math.max(2, steps);
  const step = PANO_FULL_ROTATION / count;
  // Old last frame when starting at entry: entry + (count-1)*step ≡ entry - step
  const startYaw =
    (entryYaw3600 - step + PANO_FULL_ROTATION) % PANO_FULL_ROTATION;
  const yaws: number[] = [];
  for (let i = 0; i < count; i += 1) {
    yaws.push(Math.round(startYaw + i * step) % PANO_FULL_ROTATION);
  }
  return yaws;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function sceneIsPano(scene: Scene, gamestates: ReturnType<typeof selectGamestatesAccessor>): boolean {
  const renderers = getScenePresentationRenderers(scene, gamestates);
  return renderers.has('webgl');
}

export type CaptureSessionProps = {
  scene: Scene;
  panoFrames?: number;
  specialDurationMs?: number;
  width?: number;
  height?: number;
};

export function CaptureSession({
  scene,
  panoFrames = DEFAULT_PANO_FRAMES,
  specialDurationMs = DEFAULT_SPECIAL_MS,
  width = 960,
  height = 600,
}: CaptureSessionProps) {
  const dispatch = useAppDispatch();
  const gamestates = useAppSelector(selectGamestatesAccessor);
  const rotation = useAppSelector(selectRotation);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const grabCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const captureStartedRef = useRef(false);
  const [status, setStatus] = useState<CaptureStatus>('booting');
  const [error, setError] = useState<string | null>(null);
  const [frameCount, setFrameCount] = useState(0);
  const [presentation, setPresentation] = useState<ScenePresentationRequest | null>(
    null,
  );

  const kind = useMemo(
    () => (sceneIsPano(scene, gamestates) ? 'pano' : 'special'),
    [scene, gamestates],
  );

  const publishResult = useCallback(
    (result: CaptureResult) => {
      const globalWindow = window as Window & {
        __MORPHEUS_CAPTURE__?: CaptureResult;
      };
      globalWindow.__MORPHEUS_CAPTURE__ = result;
      document.documentElement.dataset.captureState = result.status;
      document.documentElement.dataset.captureSceneId = String(result.sceneId);
      document.documentElement.dataset.captureFrameCount = String(
        result.frameCount,
      );
      if (result.error) {
        document.documentElement.dataset.captureError = result.error;
      } else {
        delete document.documentElement.dataset.captureError;
      }
    },
    [],
  );

  useEffect(() => {
    dispatch(scenePrefetched(scene));
    dispatch(activateScene(scene.sceneId));
    dispatch(setRotation({ yaw3600: PANO_ENTRY_YAW3600, pitch: 0 }));
    setStatus('waiting_ready');
    setPresentation({
      token: Date.now(),
      sceneId: scene.sceneId,
    });
  }, [dispatch, scene]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!captureStartedRef.current) {
        setStatus('failed');
        setError('presentation_timeout');
        publishResult({
          sceneId: scene.sceneId,
          kind,
          status: 'failed',
          frames: [],
          frameCount: 0,
          error: 'presentation_timeout',
          policyVersion: CAPTURE_POLICY_VERSION,
        });
      }
    }, READY_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [kind, publishResult, scene.sceneId]);

  const grabFrameDataUrl = useCallback((): string | null => {
    const source = stageRef.current;
    if (!source) {
      return null;
    }
    if (!grabCanvasRef.current) {
      grabCanvasRef.current = document.createElement('canvas');
    }
    const target = grabCanvasRef.current;
    const ok = captureStageFrame(source, target, { devicePixelRatio: 1 });
    if (!ok) {
      return null;
    }
    try {
      return target.toDataURL('image/png');
    } catch {
      return null;
    }
  }, []);

  const runCapture = useCallback(async () => {
    if (captureStartedRef.current) {
      return;
    }
    captureStartedRef.current = true;
    setStatus('capturing');
    await sleep(POST_READY_SETTLE_MS);

    const frames: string[] = [];
    try {
      if (kind === 'pano') {
        const yaws = panoCaptureYawSequence(panoFrames, PANO_ENTRY_YAW3600);
        for (const yaw3600 of yaws) {
          dispatch(setRotation({ yaw3600, pitch: 0 }));
          await sleep(80);
          const dataUrl = grabFrameDataUrl();
          if (dataUrl) {
            frames.push(dataUrl);
            setFrameCount(frames.length);
          }
        }
      } else {
        const interval = Math.round(1000 / SPECIAL_FPS);
        const total = Math.max(1, Math.round(specialDurationMs / interval));
        for (let i = 0; i < total; i += 1) {
          const dataUrl = grabFrameDataUrl();
          if (dataUrl) {
            frames.push(dataUrl);
            setFrameCount(frames.length);
          }
          await sleep(interval);
        }
      }

      if (frames.length === 0) {
        setStatus('failed');
        setError('no_frames');
        publishResult({
          sceneId: scene.sceneId,
          kind,
          status: 'failed',
          frames: [],
          frameCount: 0,
          error: 'no_frames',
          policyVersion: CAPTURE_POLICY_VERSION,
        });
        return;
      }

      setStatus('done');
      publishResult({
        sceneId: scene.sceneId,
        kind,
        status: 'done',
        frames,
        frameCount: frames.length,
        policyVersion: CAPTURE_POLICY_VERSION,
      });
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : 'capture_failed';
      setStatus('failed');
      setError(message);
      publishResult({
        sceneId: scene.sceneId,
        kind,
        status: 'failed',
        frames,
        frameCount: frames.length,
        error: message,
        policyVersion: CAPTURE_POLICY_VERSION,
      });
    }
  }, [
    dispatch,
    grabFrameDataUrl,
    kind,
    panoFrames,
    publishResult,
    scene.sceneId,
    specialDurationMs,
  ]);

  const handlePresented = useCallback(
    (request: ScenePresentationRequest) => {
      if (request.sceneId !== scene.sceneId) {
        return;
      }
      void runCapture();
    },
    [runCapture, scene.sceneId],
  );

  return (
    <div
      data-capture-status={status}
      data-capture-kind={kind}
      style={{
        width,
        height,
        margin: 0,
        padding: 0,
        background: '#000',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      <div ref={stageRef} style={{ width, height, position: 'relative' }}>
        {presentation ? (
          <InteractiveStage
            stageScenes={[scene]}
            activeScene={scene}
            pendingScenes={[]}
            gamestates={gamestates}
            width={width}
            height={height}
            top={0}
            left={0}
            volume={0}
            rotation={rotation}
            presentation={presentation}
            onScenePresented={handlePresented}
            inputEnabled={false}
          />
        ) : null}
      </div>
      <div
        aria-live="polite"
        style={{
          position: 'absolute',
          left: 8,
          bottom: 8,
          color: '#fff',
          fontFamily: 'monospace',
          fontSize: 12,
          textShadow: '0 0 4px #000',
        }}
      >
        capture {status}
        {error ? ` (${error})` : ''} · {kind} · frames={frameCount}
      </div>
    </div>
  );
}
