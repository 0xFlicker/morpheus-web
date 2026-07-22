'use client';

import type { Scene } from '@soapbubble/morpheus-client/morpheus/casts/types';
import { CaptureSession } from '@/morpheus-app/capture/CaptureSession';

type CaptureClientProps = {
  scene: Scene;
  panoFrames?: number;
  specialDurationMs?: number;
};

export function CaptureClient({
  scene,
  panoFrames,
  specialDurationMs,
}: CaptureClientProps) {
  return (
    <CaptureSession
      scene={scene}
      panoFrames={panoFrames}
      specialDurationMs={specialDurationMs}
    />
  );
}
