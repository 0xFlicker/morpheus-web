import type { Metadata } from 'next';
import Link from 'next/link';

import { getSceneTypeLabel, listScenes } from '@/lib/sceneCatalog';
import {
  scenePreviewMp4Path,
  scenePreviewMp4Url,
  scenePreviewWebmPath,
  scenePreviewWebmUrl,
  scenePreviewPosterPath,
  scenePreviewPosterUrl,
} from '@/lib/scenePreviewUrl';
import { SceneDirectoryClient } from './scene-directory-client';
import { SceneMediaController } from './scene-media-controller';
import styles from './scene-directory.module.css';

export const metadata: Metadata = {
  title: 'Scene Index',
  description:
    'Browse every authored scene in Morpheus and begin anywhere with a fresh game state.',
};

function previewMp4Source(sceneId: number): string {
  return scenePreviewMp4Url(sceneId) ?? `/${scenePreviewMp4Path(sceneId)}`;
}

function previewWebmSource(sceneId: number): string {
  return scenePreviewWebmUrl(sceneId) ?? `/${scenePreviewWebmPath(sceneId)}`;
}

function posterSource(sceneId: number): string {
  return (
    scenePreviewPosterUrl(sceneId) ?? `/${scenePreviewPosterPath(sceneId)}`
  );
}

export default function ScenesPage() {
  const scenes = listScenes();

  return (
    <div className={styles.page}>
      <a className={styles.skipLink} href="#scene-directory-list">
        Skip to scenes
      </a>
      <header id="top" className={styles.header}>
        <div className={styles.issueLine}>
          <Link href="/">Soap Bubble Productions</Link>
          <span>Morpheus map registry</span>
          <Link href="/morpheus">Play the complete game →</Link>
        </div>
        <div className={styles.titleRow}>
          <div>
            <p className={styles.kicker}>Public index · Fresh game state</p>
            <h1>Scene Index</h1>
          </div>
          <p className={styles.intro}>
            Every authored Morpheus scene, in numeric order. Choose a frame to
            begin there, then follow its working hotspots through the map.
          </p>
        </div>
      </header>

      <main className={styles.main}>
        <SceneDirectoryClient totalScenes={scenes.length} />
        <ol id="scene-directory-list" className={styles.sceneList}>
          {scenes.map((scene, index) => (
            <li
              key={scene.sceneId}
              data-scene-card
              data-scene-id={scene.sceneId}
              data-scene-type={scene.type}
              {...(scene.subtype === undefined
                ? {}
                : { 'data-scene-subtype': scene.subtype })}
            >
              <Link
                className={styles.sceneCard}
                href={`/scene/${scene.sceneId}`}
                aria-label={`Explore scene ${scene.sceneId}, ${getSceneTypeLabel(scene)}`}
              >
                <span className={styles.previewFrame} aria-hidden="true">
                  <img
                    src={posterSource(scene.sceneId)}
                    alt=""
                    loading={index === 0 ? 'eager' : 'lazy'}
                    decoding="async"
                    width="640"
                    height="400"
                  />
                  <video
                    data-scene-preview={scene.sceneId}
                    data-src-mp4={previewMp4Source(scene.sceneId)}
                    data-src-webm={previewWebmSource(scene.sceneId)}
                    muted
                    loop
                    playsInline
                    preload="none"
                    width="640"
                    height="400"
                  />
                  <span className={styles.previewIndex}>
                    {String(index + 1).padStart(4, '0')}
                  </span>
                </span>
                <span className={styles.cardDetails}>
                  <span className={styles.sceneId}>Scene {scene.sceneId}</span>
                  <span className={styles.sceneType}>
                    {getSceneTypeLabel(scene)}
                  </span>
                  <span className={styles.sceneArrow} aria-hidden="true">
                    →
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ol>
        <SceneMediaController />
      </main>

      <footer className={styles.footer}>
        <span>End of index</span>
        <a href="#top">Back to top ↑</a>
      </footer>
    </div>
  );
}
