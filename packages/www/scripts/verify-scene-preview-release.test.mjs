import { describe, expect, it } from 'vitest';

import { verifyScenePreviewRelease } from './verify-scene-preview-release.mjs';
import { PREVIEW_KINDS, scenePreviewBlobKey } from './preview-paths.mjs';

function fixture() {
  const scenes = [1010, 2020].map((sceneId) => ({
    inputHash: `hash-${sceneId}`,
    sceneId,
  }));
  const files = scenes.flatMap(({ sceneId }) =>
    PREVIEW_KINDS.map((kind) => ({
      key: scenePreviewBlobKey(sceneId, kind),
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
        contentType: {
          gif: 'image/gif',
          mp4: 'video/mp4',
          poster: 'image/png',
          webm: 'video/webm',
        }[file.kind],
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
      fileCount: 8,
      formats: { gif: 2, mp4: 2, poster: 2, webm: 2 },
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

  it('rejects an uploaded video with the wrong content type', () => {
    const input = fixture();
    input.uploadReport.files.find(
      (file) => file.sceneId === 1010 && file.kind === 'mp4',
    ).contentType = 'application/octet-stream';
    expect(() => verifyScenePreviewRelease(input)).toThrow(
      'Upload report has an invalid content type for previews/scenes/1010.mp4: expected video/mp4, got application/octet-stream',
    );
  });
});
