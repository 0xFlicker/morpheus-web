import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getScene } from '@/app/actions';
import { findScene, getSceneTypeLabel } from '@/lib/sceneCatalog';
import { scenePreviewMp4Url, scenePreviewOgImage } from '@/lib/scenePreviewUrl';
import { Client } from './client';

type PageProps = {
  params: Promise<{ sceneId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { sceneId: raw } = await params;
  const sceneId = Number(raw);
  const catalogScene = findScene(sceneId);
  const title = catalogScene ? `Morpheus Scene ${sceneId}` : 'Morpheus Scene';
  const description = catalogScene
    ? `Explore Morpheus scene ${sceneId}, a ${getSceneTypeLabel(catalogScene).toLowerCase()} scene.`
    : 'Explore a scene from Morpheus.';
  const ogImage = catalogScene ? scenePreviewOgImage(sceneId) : undefined;
  const images = ogImage ? [ogImage] : undefined;
  // Optional: platforms that honor og:video (not a substitute for og:image).
  const mp4 = catalogScene ? scenePreviewMp4Url(sceneId) : undefined;
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

const ScenePage = async ({ params, searchParams }: PageProps) => {
  const { sceneId: rawSceneId } = await params;
  const sceneId = Number(rawSceneId);
  if (!findScene(sceneId)) {
    notFound();
  }
  const scene = await getScene(sceneId);
  if (!scene) {
    notFound();
  }
  const query = await searchParams;
  const mcpSessionName = typeof query.mcp === 'string' ? query.mcp : null;
  return (
    <Client key={scene.sceneId} scene={scene} mcpSessionName={mcpSessionName} />
  );
};

export default ScenePage;
