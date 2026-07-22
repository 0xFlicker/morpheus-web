import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getScene } from '@/app/actions';
import { scenePreviewGifUrl } from '@/lib/scenePreviewUrl';
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
  const previewImage = Number.isFinite(sceneId)
    ? scenePreviewGifUrl(sceneId)
    : undefined;
  const images = previewImage
    ? [{ url: previewImage, width: 640, height: 400, alt: title }]
    : undefined;
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'website',
      images,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: previewImage ? [previewImage] : undefined,
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
