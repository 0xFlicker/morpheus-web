import { describe, expect, it } from 'vitest';

import { verifyScenePreviewRelease } from './verify-scene-preview-release.mjs';

function fixture() {
  const scenes = [1010, 2020].map((sceneId) => ({
    inputHash: `hash-${sceneId}`,
    sceneId,
  }));
  const files = scenes.flatMap(({ sceneId }) =>
    ['gif', 'mp4', 'webm'].map((kind) => ({
      key: `previews/scenes/${sceneId}.${kind}`,
      kind,
      sceneId,
      size: 10,
    })),
  );
  return {
    catalog: { scenes },
    manifest: {
      scenes,
      results: scenes.map((scene) => ({
        inputHash: scene.inputHash,
        sceneId: scene.sceneId,
        status: 'ok',
      })),
    },
    files,
    uploadReport: {
      files: files.map((file) => ({
        etag: `etag-${file.sceneId}-${file.kind}`,
        kind: file.kind,
        pathname: file.key,
        sceneId: file.sceneId,
      })),
    },
  };
}

describe('verifyScenePreviewRelease', () => {
  it('accepts exact catalog, manifest, local, and upload sets', () => {
    expect(verifyScenePreviewRelease(fixture())).toEqual({
      fileCount: 6,
      formats: { gif: 2, mp4: 2, webm: 2 },
      sceneCount: 2,
      uploadVerified: true,
    });
  });

  it('rejects failed manifest rows', () => {
    const input = fixture();
    input.manifest.results[0].status = 'failed';
    expect(() => verifyScenePreviewRelease(input)).toThrow(
      'Preview manifest scene 1010 is failed',
    );
  });

  it('rejects a missing local format', () => {
    const input = fixture();
    input.files = input.files.filter(
      (file) => !(file.sceneId === 2020 && file.kind === 'webm'),
    );
    expect(() => verifyScenePreviewRelease(input)).toThrow(
      'Local webm previews does not match the catalog',
    );
  });

  it('rejects an incomplete upload report', () => {
    const input = fixture();
    input.uploadReport.files.pop();
    expect(() => verifyScenePreviewRelease(input)).toThrow(
      'Upload report does not match local previews',
    );
  });
});
