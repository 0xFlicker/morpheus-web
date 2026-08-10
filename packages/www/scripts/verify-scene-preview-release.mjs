import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  collectScenePreviewFiles,
  DEFAULT_PREVIEWS_SOURCE,
  PREVIEW_KIND_DIRS,
  scenePreviewBlobKey,
} from './preview-paths.mjs';

const packageDirectory = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_CATALOG_PATH = path.resolve(
  packageDirectory,
  '../src/generated/sceneCatalog.json',
);
const DEFAULT_MANIFEST_PATH = path.resolve(
  packageDirectory,
  '../.scene-previews/manifest.json',
);

function assertUniqueIds(label, ids) {
  const unique = new Set(ids);
  if (unique.size !== ids.length) {
    throw new Error(`${label} contains duplicate scene IDs`);
  }
  return unique;
}

function assertExactIds(label, expectedIds, actualIds) {
  const expected = new Set(expectedIds);
  const actual = assertUniqueIds(label, actualIds);
  const missing = [...expected].filter((sceneId) => !actual.has(sceneId));
  const unexpected = [...actual].filter((sceneId) => !expected.has(sceneId));
  if (missing.length || unexpected.length) {
    throw new Error(
      `${label} does not match the catalog: ` +
        `${missing.length} missing, ${unexpected.length} unexpected` +
        `${missing.length ? `; first missing: ${missing.slice(0, 5).join(', ')}` : ''}` +
        `${unexpected.length ? `; first unexpected: ${unexpected.slice(0, 5).join(', ')}` : ''}`,
    );
  }
}

export function verifyScenePreviewRelease({
  catalog,
  manifest,
  files,
  uploadReport = null,
}) {
  if (!Array.isArray(catalog?.scenes)) {
    throw new Error('Scene catalog must contain a scenes array');
  }
  if (!Array.isArray(manifest?.scenes) || !Array.isArray(manifest?.results)) {
    throw new Error('Preview manifest must contain scenes and results arrays');
  }

  const catalogIds = catalog.scenes.map((scene) => scene.sceneId);
  assertUniqueIds('Scene catalog', catalogIds);
  assertExactIds(
    'Preview manifest inventory',
    catalogIds,
    manifest.scenes.map((scene) => scene.sceneId),
  );
  assertExactIds(
    'Preview manifest results',
    catalogIds,
    manifest.results.map((result) => result.sceneId),
  );

  const sceneById = new Map(
    manifest.scenes.map((scene) => [scene.sceneId, scene]),
  );
  for (const result of manifest.results) {
    if (result.status !== 'ok') {
      throw new Error(
        `Preview manifest scene ${result.sceneId} is ${result.status ?? 'missing status'}`,
      );
    }
    if (result.inputHash !== sceneById.get(result.sceneId)?.inputHash) {
      throw new Error(
        `Preview manifest scene ${result.sceneId} has a stale input hash`,
      );
    }
  }

  const fileKeys = new Set();
  for (const kind of Object.keys(PREVIEW_KIND_DIRS)) {
    const kindFiles = files.filter((file) => file.kind === kind);
    assertExactIds(
      `Local ${kind} previews`,
      catalogIds,
      kindFiles.map((file) => file.sceneId),
    );
    for (const file of kindFiles) {
      if (file.size <= 0) {
        throw new Error(`Local preview is empty: ${file.key}`);
      }
      fileKeys.add(file.key);
    }
  }

  if (uploadReport) {
    if (!Array.isArray(uploadReport.files)) {
      throw new Error('Upload report must contain a files array');
    }
    const uploadedKeys = uploadReport.files.map((file) => file.pathname);
    const uniqueUploadedKeys = new Set(uploadedKeys);
    if (uniqueUploadedKeys.size !== uploadedKeys.length) {
      throw new Error('Upload report contains duplicate object paths');
    }
    const missing = [...fileKeys].filter((key) => !uniqueUploadedKeys.has(key));
    const unexpected = uploadedKeys.filter((key) => !fileKeys.has(key));
    if (missing.length || unexpected.length) {
      throw new Error(
        `Upload report does not match local previews: ` +
          `${missing.length} missing, ${unexpected.length} unexpected`,
      );
    }
    for (const file of uploadReport.files) {
      if (typeof file.etag !== 'string' || file.etag.length === 0) {
        throw new Error(
          `Upload report is missing an ETag for ${file.pathname}`,
        );
      }
      const expectedKey = scenePreviewBlobKey(file.sceneId, file.kind);
      if (file.pathname !== expectedKey) {
        throw new Error(
          `Upload report has an invalid object path: ${file.pathname}`,
        );
      }
    }
  }

  return {
    sceneCount: catalogIds.length,
    fileCount: fileKeys.size,
    formats: Object.fromEntries(
      Object.keys(PREVIEW_KIND_DIRS).map((kind) => [
        kind,
        files.filter((file) => file.kind === kind).length,
      ]),
    ),
    uploadVerified: uploadReport !== null,
  };
}

export function parseArguments(argv = process.argv.slice(2)) {
  const options = {
    catalogPath: DEFAULT_CATALOG_PATH,
    manifestPath: DEFAULT_MANIFEST_PATH,
    source: DEFAULT_PREVIEWS_SOURCE,
    uploadReportPath: null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (
      argument === '--catalog' ||
      argument === '--manifest' ||
      argument === '--source' ||
      argument === '--upload-report'
    ) {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error(`Missing value for ${argument}`);
      }
      const key =
        argument === '--upload-report'
          ? 'uploadReportPath'
          : argument === '--source'
            ? 'source'
            : `${argument.slice(2)}Path`;
      options[key] = path.resolve(value);
      index += 1;
    } else if (argument === '--help' || argument === '-h') {
      options.help = true;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  return options;
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

async function main() {
  const options = parseArguments();
  if (options.help) {
    process.stdout.write(
      `Usage: node scripts/verify-scene-preview-release.mjs [options]\n\nOptions:\n  --catalog <path>       Scene catalog JSON\n  --manifest <path>      Generated preview manifest JSON\n  --source <dir>         Local .scene-previews root\n  --upload-report <path> Completed upload report with ETags\n`,
    );
    return;
  }

  const [catalog, manifest, inventory, uploadReport] = await Promise.all([
    readJson(options.catalogPath),
    readJson(options.manifestPath),
    collectScenePreviewFiles(options.source),
    options.uploadReportPath ? readJson(options.uploadReportPath) : null,
  ]);
  if (inventory.collisions.length) {
    throw new Error(
      `Local preview inventory has duplicate object paths: ${inventory.collisions.join(', ')}`,
    );
  }
  const result = verifyScenePreviewRelease({
    catalog,
    manifest,
    files: inventory.files,
    uploadReport,
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

const isDirectRun =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
