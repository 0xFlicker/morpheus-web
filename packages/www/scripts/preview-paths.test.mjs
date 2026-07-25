import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  collectScenePreviewFiles,
  scenePreviewBlobKey,
} from './preview-paths.mjs';

const dirs = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

describe('scenePreviewBlobKey', () => {
  it('maps kinds to stable public paths', () => {
    expect(scenePreviewBlobKey(1010, 'gif')).toBe('previews/scenes/1010.gif');
    expect(scenePreviewBlobKey(1010, 'mp4')).toBe('previews/scenes/1010.mp4');
    expect(scenePreviewBlobKey(1010, 'webm')).toBe('previews/scenes/1010.webm');
  });
});

describe('collectScenePreviewFiles', () => {
  it('inventories gif/master/webm by numeric scene id', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'previews-'));
    dirs.push(root);
    await mkdir(path.join(root, 'gif'), { recursive: true });
    await mkdir(path.join(root, 'master'), { recursive: true });
    await mkdir(path.join(root, 'webm'), { recursive: true });
    await writeFile(path.join(root, 'gif', '1010.gif'), 'g');
    await writeFile(path.join(root, 'master', '1010.mp4'), 'm');
    await writeFile(path.join(root, 'webm', '1010.webm'), 'w');
    await writeFile(path.join(root, 'gif', 'notes.txt'), 'x');

    const inv = await collectScenePreviewFiles(root);
    expect(inv.files.map((f) => f.key)).toEqual([
      'previews/scenes/1010.gif',
      'previews/scenes/1010.mp4',
      'previews/scenes/1010.webm',
    ]);
    expect(inv.files.every((f) => f.contentType)).toBe(true);
    expect(inv.skipped.some((s) => s.reason === 'wrong-extension')).toBe(true);
  });
});
