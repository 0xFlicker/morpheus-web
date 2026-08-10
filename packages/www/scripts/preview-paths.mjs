import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { contentTypeFor } from './gamedb-paths.mjs';

const packageDirectory = path.dirname(fileURLToPath(import.meta.url));

export const DEFAULT_PREVIEWS_SOURCE = path.resolve(
  packageDirectory,
  '../.scene-previews',
);

/** Local folder → Blob key prefix under previews/scenes/ */
export const PREVIEW_KIND_DIRS = {
  gif: { localDir: 'gif', ext: '.gif', blobExt: '.gif' },
  mp4: { localDir: 'master', ext: '.mp4', blobExt: '.mp4' },
  webm: { localDir: 'webm', ext: '.webm', blobExt: '.webm' },
};

export function scenePreviewBlobKey(sceneId, kind) {
  const spec = PREVIEW_KIND_DIRS[kind];
  if (!spec) {
    throw new Error(`Unknown preview kind: ${kind}`);
  }
  return `previews/scenes/${sceneId}${spec.blobExt}`;
}

/**
 * Collect local rendered previews for upload.
 * @param {string} sourceRoot
 * @param {{ kinds?: string[] }} [options]
 */
export async function collectScenePreviewFiles(
  sourceRoot = DEFAULT_PREVIEWS_SOURCE,
  { kinds = ['gif', 'mp4', 'webm'] } = {},
) {
  const files = [];
  const skipped = [];
  const collisions = [];
  const keys = new Set();

  for (const kind of kinds) {
    const spec = PREVIEW_KIND_DIRS[kind];
    if (!spec) {
      throw new Error(`Unknown preview kind: ${kind}`);
    }
    const dir = path.join(sourceRoot, spec.localDir);
    let names = [];
    try {
      names = await readdir(dir);
    } catch {
      skipped.push({ path: dir, reason: 'missing-dir' });
      continue;
    }
    for (const name of names) {
      if (!name.endsWith(spec.ext)) {
        skipped.push({ path: path.join(dir, name), reason: 'wrong-extension' });
        continue;
      }
      const stem = name.slice(0, -spec.ext.length);
      if (!/^\d+$/.test(stem)) {
        skipped.push({
          path: path.join(dir, name),
          reason: 'non-numeric-scene-id',
        });
        continue;
      }
      const sceneId = Number(stem);
      const absolutePath = path.join(dir, name);
      const st = await stat(absolutePath);
      if (!st.isFile()) {
        skipped.push({ path: absolutePath, reason: 'not-file' });
        continue;
      }
      const key = scenePreviewBlobKey(sceneId, kind);
      if (keys.has(key)) {
        collisions.push(key);
        continue;
      }
      keys.add(key);
      files.push({
        absolutePath,
        contentType: contentTypeFor(absolutePath),
        key,
        kind,
        sceneId,
        size: st.size,
      });
    }
  }

  files.sort((a, b) => a.key.localeCompare(b.key));
  return { collisions, files, skipped, sourceRoot: path.resolve(sourceRoot) };
}

export function completeSceneIds(files, kinds = ['gif', 'mp4', 'webm']) {
  const kindsByScene = new Map();
  for (const file of files) {
    if (file.size <= 0) continue;
    const sceneKinds = kindsByScene.get(file.sceneId) ?? new Set();
    sceneKinds.add(file.kind);
    kindsByScene.set(file.sceneId, sceneKinds);
  }
  return new Set(
    [...kindsByScene.entries()]
      .filter(([, sceneKinds]) => kinds.every((kind) => sceneKinds.has(kind)))
      .map(([sceneId]) => sceneId),
  );
}
