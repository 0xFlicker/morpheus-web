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
const DEFAULT_SPECIAL_MS = 3000;
const SPECIAL_FPS = 8;
const READY_TIMEOUT_MS = 45000;
const POST_READY_SETTLE_MS = 200;

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
    dispatch(setRotation({ yaw3600: 0, pitch: 0 }));
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
        const steps = Math.max(2, panoFrames);
        for (let i = 0; i < steps; i += 1) {
          const yaw3600 = Math.round((i * 3600) / steps) % 3600;
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
