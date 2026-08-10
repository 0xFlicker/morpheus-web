import { cache } from 'react';
import { notFound } from 'next/navigation';
import type { Metadata, NextPage } from 'next';

import Render from '@/morpheus-app/Render/Render';
import { fetch as fetchScene } from '@soapbubble/morpheus-client/service/scene';
import type { Scene } from 'morpheus/casts/types';
import { scenePreviewMp4Url, scenePreviewOgImage } from '@/lib/scenePreviewUrl';
import { RuntimeProvider } from '@/morpheus-app/runtime/RuntimeProvider';
import { toolingRuntimePolicy } from '@/morpheus-app/runtime/runtimePolicy';

type PageParams = {
  scene: string;
};

type PageProps = {
  params: Promise<PageParams>;
};

const getScene = cache(
  async (sceneId: number): Promise<Scene | undefined> => fetchScene(sceneId),
);

const parseSceneId = (rawValue: string): number => {
  const parsed = Number.parseInt(rawValue, 10);
  if (Number.isNaN(parsed)) {
    return 2000;
  }
  return parsed;
};

const resolveBaseUrl = (): string | undefined => {
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '');
  }
  if (process.env.SITE_URL) {
    return process.env.SITE_URL.replace(/\/$/, '');
  }
  if (process.env.VERCEL_URL) {
    const value = process.env.VERCEL_URL.startsWith('http')
      ? process.env.VERCEL_URL
      : `https://${process.env.VERCEL_URL}`;
    return value.replace(/\/$/, '');
  }
  return undefined;
};

const baseUrl = resolveBaseUrl();

const resolveScene = async (params: PageParams) => {
  const sceneId = parseSceneId(params.scene);
  const scene = await getScene(sceneId);
  return { sceneId, scene };
};

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { sceneId, scene } = await resolveScene(await params);
  const title = scene
    ? `Morpheus Scene ${scene.sceneId}`
    : `Morpheus Scene ${sceneId}`;
  const description = scene
    ? `Scene ${scene.sceneId} with ${scene.casts.length} casts`
    : 'Scene could not be loaded.';
  const url = baseUrl ? `${baseUrl}/render/${sceneId}` : undefined;
  const ogImage = scenePreviewOgImage(sceneId);
  const images = ogImage ? [ogImage] : undefined;
  const mp4 = scenePreviewMp4Url(sceneId);
  const videos = mp4
    ? [{ url: mp4, width: 640, height: 400, type: 'video/mp4' as const }]
    : undefined;
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url,
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

const RenderScenePage = (async ({ params }) => {
  const { scene } = await resolveScene(await params);
  if (!scene) {
    notFound();
  }
  return (
    <RuntimeProvider
      key={scene.sceneId}
      policy={toolingRuntimePolicy(scene.sceneId)}
      scene={scene}
    >
      <Render scene={scene} />
    </RuntimeProvider>
  );
}) as NextPage<PageProps>;

export default RenderScenePage;
