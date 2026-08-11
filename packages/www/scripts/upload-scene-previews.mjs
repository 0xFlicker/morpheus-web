/**
 * Upload pre-rendered scene previews (poster PNG / GIF / MP4 / WebM) to public Vercel Blob.
 *
 * Requires BLOB_READ_WRITE_TOKEN for the **public media store** (same store as
 * GameDB — host matches NEXT_PUBLIC_MORPHEUS_GAMEDB_ORIGIN). The private map
 * store token only sees morpheus.map.json and cannot write previews.
 *
 * Example:
 *   set -a && source ../../.env.local && set +a
 *   # if needed, override with public-store token:
 *   # export BLOB_READ_WRITE_TOKEN=vercel_blob_rw_<public_store>_...
 *   yarn workspace morpheus-next upload:previews -- --report previews-import.json --dry-run
 */

import { createReadStream } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  collectScenePreviewFiles,
  DEFAULT_PREVIEWS_SOURCE,
  PREVIEW_KINDS,
} from './preview-paths.mjs';

const CACHE_CONTROL_MAX_AGE = 86_400;
const DEFAULT_UPLOAD_CONCURRENCY = 4;
const MAX_UPLOAD_CONCURRENCY = 32;

function usage() {
  return [
    'Usage: yarn workspace morpheus-next upload:previews -- --report <report.json> [options]',
    '',
    'Options:',
    '  --source <dir>         Local .scene-previews root (default: packages/www/.scene-previews)',
    '  --kinds gif,mp4,poster,webm  Which outputs to upload (default: all four)',
    '  --concurrency <1-32>   Parallel uploads (default 4)',
    '  --dry-run              Inventory only',
    '  --update               Allow overwrite; requires --expect prior report',
    '  --resume               Resume interrupted import; requires --expect partial report',
    '  --expect <report.json> Prior ETag inventory for --update / --resume',
    '  --report <report.json> Output report path (required)',
    '',
    'Token must be for the public Blob store (GameDB host), not the private map store.',
  ].join('\n');
}

export function parseArguments(args) {
  const options = {
    concurrency: DEFAULT_UPLOAD_CONCURRENCY,
    dryRun: false,
    resume: false,
    source: DEFAULT_PREVIEWS_SOURCE,
    update: false,
    kinds: [...PREVIEW_KINDS],
  };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--dry-run') options.dryRun = true;
    else if (argument === '--update') options.update = true;
    else if (argument === '--resume') options.resume = true;
    else if (argument === '--concurrency') {
      const value = Number(args[index + 1]);
      if (
        !Number.isInteger(value) ||
        value < 1 ||
        value > MAX_UPLOAD_CONCURRENCY
      ) {
        throw new Error(
          `--concurrency must be an integer from 1 to ${MAX_UPLOAD_CONCURRENCY}.`,
        );
      }
      options.concurrency = value;
      index += 1;
    } else if (argument === '--kinds') {
      const value = args[index + 1];
      if (!value || value.startsWith('--'))
        throw new Error('Missing value for --kinds');
      options.kinds = value
        .split(',')
        .map((k) => k.trim())
        .filter(Boolean);
      index += 1;
    } else if (
      argument === '--source' ||
      argument === '--report' ||
      argument === '--expect'
    ) {
      const value = args[index + 1];
      if (!value || value.startsWith('--'))
        throw new Error(`Missing value for ${argument}`);
      options[argument.slice(2)] = path.resolve(value);
      index += 1;
    } else if (argument === '--help' || argument === '-h') {
      return { help: true };
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }

  if (!options.report)
    throw new Error('A --report path is required to record uploaded ETags.');
  if (options.update && !options.expect) {
    throw new Error('--update requires --expect <previous-report.json>.');
  }
  if (options.resume && options.update) {
    throw new Error('Use either --resume or --update, not both.');
  }
  if (options.resume && !options.expect) {
    throw new Error('--resume requires --expect <partial-report.json>.');
  }
  if (!options.update && !options.resume && options.expect) {
    throw new Error('--expect is only valid with --update or --resume.');
  }
  return options;
}

async function readExpectedEtags(reportPath) {
  let parsed;
  try {
    parsed = JSON.parse(await readFile(reportPath, 'utf8'));
  } catch (error) {
    throw new Error(
      `Cannot read expected inventory report ${reportPath}: ${error.message}`,
    );
  }
  if (!Array.isArray(parsed.files)) {
    throw new Error('Expected inventory report must contain a files array.');
  }
  const etags = new Map();
  for (const file of parsed.files) {
    if (
      typeof file?.pathname !== 'string' ||
      typeof file?.etag !== 'string' ||
      !file.etag
    ) {
      throw new Error(
        'Expected inventory report contains a file without pathname+etag.',
      );
    }
    if (etags.has(file.pathname)) {
      throw new Error(`Expected inventory report repeats ${file.pathname}.`);
    }
    etags.set(file.pathname, file.etag);
  }
  return etags;
}

function makeReport({ inventory, options, uploaded, errors, files }) {
  return {
    cacheControlMaxAge: CACHE_CONTROL_MAX_AGE,
    files,
    generatedAt: new Date().toISOString(),
    mode: options.update
      ? 'update'
      : options.resume
        ? 'resume'
        : 'initial-import',
    sourceRoot: inventory.sourceRoot,
    summary: {
      discovered: inventory.files.length,
      errors: errors.length,
      skipped: inventory.skipped.length,
      uploaded,
    },
    skipped: inventory.skipped,
  };
}

async function writeReport(reportPath, report) {
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

/**
 * Fail fast if the token is the private map store (only morpheus.map.json).
 */
export async function assertPublicMediaStore(list) {
  const root = await list({ limit: 20 });
  const paths = (root.blobs ?? []).map((b) => b.pathname);
  const onlyMap =
    paths.length > 0 &&
    paths.every(
      (p) => p === 'morpheus.map.json' || p.endsWith('/morpheus.map.json'),
    );
  if (
    onlyMap &&
    !paths.some((p) => p.startsWith('GameDB/') || p.startsWith('previews/'))
  ) {
    // Still allow empty public store (fresh). Only reject when store clearly is map-only.
    const sample = await list({ prefix: 'GameDB/', limit: 1 });
    const previews = await list({ prefix: 'previews/', limit: 1 });
    if (
      (sample.blobs?.length ?? 0) === 0 &&
      (previews.blobs?.length ?? 0) === 0 &&
      paths.includes('morpheus.map.json')
    ) {
      throw new Error(
        'BLOB_READ_WRITE_TOKEN appears to target the private map store (only morpheus.map.json is visible). ' +
          'Create a read-write token for the **public** Blob store that backs NEXT_PUBLIC_MORPHEUS_GAMEDB_ORIGIN ' +
          '(Vercel → Storage → that store → Tokens), then export it as BLOB_READ_WRITE_TOKEN for this command.',
      );
    }
  }
}

export async function importScenePreviews(options) {
  const inventory = await collectScenePreviewFiles(options.source, {
    kinds: options.kinds,
  });
  if (inventory.collisions.length) {
    throw new Error(
      `Preview inventory has duplicate Blob keys: ${inventory.collisions.join(', ')}`,
    );
  }
  if (inventory.files.length === 0) {
    throw new Error(
      `No preview files found under ${inventory.sourceRoot} for kinds [${options.kinds.join(', ')}]. ` +
        'Run preview:generate first.',
    );
  }

  const expectedEtags = options.update
    ? await readExpectedEtags(options.expect)
    : null;
  const resumedEtags = options.resume
    ? await readExpectedEtags(options.expect)
    : null;

  let uploaded = 0;
  const errors = [];
  if (options.dryRun) {
    const report = makeReport({
      inventory,
      options,
      uploaded: 0,
      errors,
      files: inventory.files.map(
        ({ contentType, key, size, kind, sceneId }) => ({
          contentType,
          kind,
          pathname: key,
          sceneId,
          size,
        }),
      ),
    });
    await writeReport(options.report, report);
    return report;
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error(
      'BLOB_READ_WRITE_TOKEN is required. Use a token for the public media store ' +
        '(not the private map store).',
    );
  }

  const { BlobNotFoundError, head, put, list } = await import('@vercel/blob');
  await assertPublicMediaStore(list);

  if (expectedEtags) {
    for (const file of inventory.files) {
      if (!expectedEtags.has(file.key)) {
        // Allow new scenes on update
        continue;
      }
      const current = await head(file.key);
      if (current.etag !== expectedEtags.get(file.key)) {
        throw new Error(
          `Current Blob ETag differs for ${file.key}. Refuse stale stable-path update.`,
        );
      }
    }
  }

  const results = new Array(inventory.files.length);
  let nextFileIndex = 0;
  const uploadWorker = async () => {
    while (nextFileIndex < inventory.files.length) {
      const fileIndex = nextFileIndex;
      nextFileIndex += 1;
      const file = inventory.files[fileIndex];
      try {
        if (options.resume) {
          try {
            const existing = await head(file.key);
            const expectedEtag = resumedEtags.get(file.key);
            if (
              expectedEtag &&
              existing.etag === expectedEtag &&
              existing.size === file.size
            ) {
              results[fileIndex] = {
                contentType: file.contentType,
                etag: existing.etag,
                kind: file.kind,
                pathname: existing.pathname,
                sceneId: file.sceneId,
                size: file.size,
                url: existing.url,
              };
              continue;
            }
          } catch (error) {
            if (!(error instanceof BlobNotFoundError)) throw error;
          }
        }
        const blob = await put(
          file.key,
          Readable.toWeb(createReadStream(file.absolutePath)),
          {
            access: 'public',
            addRandomSuffix: false,
            allowOverwrite: Boolean(options.update || options.resume),
            cacheControlMaxAge: CACHE_CONTROL_MAX_AGE,
            contentType: file.contentType,
          },
        );
        results[fileIndex] = {
          contentType: file.contentType,
          etag: blob.etag,
          kind: file.kind,
          pathname: blob.pathname,
          sceneId: file.sceneId,
          size: file.size,
          url: blob.url,
        };
        uploaded += 1;
      } catch (error) {
        errors.push({
          pathname: file.key,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  };

  await Promise.all(
    Array.from(
      {
        length: Math.min(
          options.concurrency ?? DEFAULT_UPLOAD_CONCURRENCY,
          inventory.files.length,
        ),
      },
      uploadWorker,
    ),
  );

  const report = makeReport({
    inventory,
    options,
    uploaded,
    errors,
    files: results.filter(Boolean),
  });
  await writeReport(options.report, report);
  if (errors.length) {
    throw new Error(
      `${errors.length} preview files failed to upload. See ${options.report}.`,
    );
  }
  return report;
}

async function main() {
  let options;
  try {
    options = parseArguments(process.argv.slice(2));
    if (options.help) {
      console.log(usage());
      return;
    }
    const report = await importScenePreviews(options);
    console.log(JSON.stringify(report.summary, null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

const isDirectRun =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  main();
}

export { usage };
