import { notFound } from 'next/navigation';
import { getScene } from '@/app/actions';
import { CaptureClient } from './client';

/**
 * Self-driving WebGL capture page for offline OG GIF pre-generation.
 * Enabled when CAPTURE_MODE=1 or NODE_ENV=development.
 */
const CaptureScenePage = async ({
  params,
  searchParams,
}: {
  params: Promise<{ sceneId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) => {
  const captureEnabled =
    process.env.CAPTURE_MODE === '1' || process.env.NODE_ENV === 'development';
  if (!captureEnabled) {
    notFound();
  }

  const { sceneId: rawId } = await params;
  const query = await searchParams;
  const sceneId = Number(rawId);
  if (!Number.isSafeInteger(sceneId) || sceneId <= 0) {
    notFound();
  }

  const scene = await getScene(sceneId);
  if (!scene) {
    notFound();
  }

  const panoFramesRaw = query.frames;
  const panoFrames =
    typeof panoFramesRaw === 'string' ? Number(panoFramesRaw) : undefined;
  const specialMsRaw = query.specialMs;
  const specialDurationMs =
    typeof specialMsRaw === 'string' ? Number(specialMsRaw) : undefined;
  // Native authored stage is 640×400; ignore requests to capture larger.
  const width = 640;
  const height = 400;

  return (
    <CaptureClient
      scene={scene}
      panoFrames={
        panoFrames && Number.isFinite(panoFrames) ? panoFrames : undefined
      }
      specialDurationMs={
        specialDurationMs && Number.isFinite(specialDurationMs)
          ? specialDurationMs
          : undefined
      }
      width={width}
      height={height}
    />
  );
};

export default CaptureScenePage;
