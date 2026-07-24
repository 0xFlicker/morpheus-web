import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getScene } from '@/app/actions';
import {
  scenePreviewMp4Url,
  scenePreviewOgImage,
} from '@/lib/scenePreviewUrl';
import { Client } from './client';

type PageProps = {
  params: Promise<{ sceneId: string }>;
};

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { sceneId: raw } = await params;
  const sceneId = Number(raw);
  const title = Number.isFinite(sceneId)
    ? `Morpheus Scene ${sceneId}`
    : 'Morpheus Scene';
  const description = `Interactive panorama scene ${raw}`;
  const ogImage =
    Number.isFinite(sceneId) ? scenePreviewOgImage(sceneId) : undefined;
  const images = ogImage ? [ogImage] : undefined;
  // Optional: platforms that honor og:video (not a substitute for og:image).
  const mp4 = Number.isFinite(sceneId) ? scenePreviewMp4Url(sceneId) : undefined;
  const videos = mp4
    ? [
        {
          url: mp4,
          width: 640,
          height: 400,
          type: 'video/mp4' as const,
        },
      ]
    : undefined;
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'website',
      images,
      videos,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: ogImage ? [ogImage.url] : undefined,
    },
  };
}

const ScenePage = async ({ params }: PageProps) => {
  const { sceneId } = await params;
  const scene = await getScene(Number(sceneId));
  if (!scene) {
    notFound();
  }
  return <Client scene={scene} />;
};

export default ScenePage;
