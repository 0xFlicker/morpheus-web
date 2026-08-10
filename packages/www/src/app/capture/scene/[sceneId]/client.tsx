'use client';

import type { Scene } from '@soapbubble/morpheus-client/morpheus/casts/types';
import { CaptureSession } from '@/morpheus-app/capture/CaptureSession';
import { RuntimeProvider } from '@/morpheus-app/runtime/RuntimeProvider';
import { toolingRuntimePolicy } from '@/morpheus-app/runtime/runtimePolicy';

type CaptureClientProps = {
  scene: Scene;
  panoFrames?: number;
  specialDurationMs?: number;
  width?: number;
  height?: number;
};

export function CaptureClient({
  scene,
  panoFrames,
  specialDurationMs,
  width,
  height,
}: CaptureClientProps) {
  return (
    <RuntimeProvider
      key={scene.sceneId}
      policy={toolingRuntimePolicy(scene.sceneId)}
      scene={scene}
    >
      <CaptureSession
        scene={scene}
        panoFrames={panoFrames}
        specialDurationMs={specialDurationMs}
        width={width}
        height={height}
      />
    </RuntimeProvider>
  );
}
