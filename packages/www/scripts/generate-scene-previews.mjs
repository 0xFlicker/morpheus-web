/**
 * Batch driver: open self-driving capture URLs, collect frames, encode OG GIFs.
 *
 * Requires: running Next app (CAPTURE_MODE or dev), Chromium via playwright,
 * ffmpeg on PATH.
 *
 * Example:
 *   yarn workspace morpheus-next preview:inventory --write
 *   yarn workspace morpheus-next dev   # separate terminal
 *   yarn workspace morpheus-next preview:generate --scene 1010
 */

import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildInventory,
  computeDirtySet,
  PREVIEW_POLICY_VERSION,
} from './scene-preview-inventory.mjs';

const packageDirectory = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_OUT = path.resolve(packageDirectory, '../.scene-previews');
const DEFAULT_MANIFEST = path.join(DEFAULT_OUT, 'manifest.json');
const DEFAULT_BASE_URL = 'http://localhost:3000';

/** Authored stage size — source PNGs stay 640×400; GIF may downscale further. */
export const NATIVE_WIDTH = 640;
export const NATIVE_HEIGHT = 400;
export const DEFAULT_PANO_FRAMES = 24;
export const DEFAULT_GIF_WIDTH = 480;

export function parseGenerateArguments(argv = process.argv.slice(2)) {
  const options = {
    baseUrl: DEFAULT_BASE_URL,
    outDir: DEFAULT_OUT,
    manifestPath: DEFAULT_MANIFEST,
    sceneIds: null,
    allDirty: true,
    dryRun: false,
    /** OG GIF width (≤ native 640). Full-res frames always written at 640×400. */
    maxWidth: DEFAULT_GIF_WIDTH,
    panoFrames: DEFAULT_PANO_FRAMES,
    concurrency: 1,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--base-url' && argv[i + 1]) {
      options.baseUrl = argv[++i].replace(/\/$/, '');
    } else if (arg === '--out' && argv[i + 1]) {
      options.outDir = path.resolve(argv[++i]);
    } else if (arg === '--manifest' && argv[i + 1]) {
      options.manifestPath = path.resolve(argv[++i]);
    } else if (arg === '--scene' && argv[i + 1]) {
      options.sceneIds = options.sceneIds ?? [];
      options.sceneIds.push(Number(argv[++i]));
      options.allDirty = false;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--width' && argv[i + 1]) {
      options.maxWidth = Math.min(NATIVE_WIDTH, Number(argv[++i]));
    } else if (arg === '--frames' && argv[i + 1]) {
      options.panoFrames = Number(argv[++i]);
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    }
  }
  return options;
}

export function captureUrl(baseUrl, sceneId, frames = DEFAULT_PANO_FRAMES) {
  return `${baseUrl}/capture/scene/${sceneId}?frames=${frames}&w=${NATIVE_WIDTH}&h=${NATIVE_HEIGHT}`;
}

export async function dataUrlToPngFile(dataUrl, filePath) {
  const match = /^data:image\/png;base64,(.+)$/.exec(dataUrl);
  if (!match) {
    throw new Error('expected png data url');
  }
  const buffer = Buffer.from(match[1], 'base64');
  await writeFile(filePath, buffer);
}

export function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const child = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-800)}`));
      }
    });
  });
}

/** Full-res intermediate MP4 from native 640×400 PNGs (no upscale). */
export function runFfmpegMasterMp4(framePattern, outputMp4, framerate = 10) {
  return runFfmpeg([
    '-y',
    '-framerate',
    String(framerate),
    '-i',
    framePattern,
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-crf',
    '18',
    '-preset',
    'medium',
    '-an',
    outputMp4,
  ]);
}

/** OG GIF: optional downscale from native frames + high-quality palette. */
export function runFfmpegGif(framePattern, outputGif, maxWidth = DEFAULT_GIF_WIDTH) {
  const scale =
    maxWidth < NATIVE_WIDTH
      ? `scale=${maxWidth}:-1:flags=lanczos,`
      : '';
  return runFfmpeg([
    '-y',
    '-framerate',
    '10',
    '-i',
    framePattern,
    '-vf',
    `fps=10,${scale}split[s0][s1];[s0]palettegen=max_colors=256:stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=3`,
    outputGif,
  ]);
}

async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    throw new Error(
      'playwright is required. Install with: yarn workspace morpheus-next add -D playwright',
    );
  }
}

export async function captureSceneInBrowser({
  browser,
  baseUrl,
  sceneId,
  framesDir,
  panoFrames = DEFAULT_PANO_FRAMES,
  timeoutMs = 90000,
}) {
  const page = await browser.newPage({
    viewport: { width: NATIVE_WIDTH, height: NATIVE_HEIGHT },
    deviceScaleFactor: 1,
  });
  try {
    const url = captureUrl(baseUrl, sceneId, panoFrames);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    await page.waitForFunction(
      () => {
        const state = document.documentElement.dataset.captureState;
        return state === 'done' || state === 'failed';
      },
      { timeout: timeoutMs },
    );
    const result = await page.evaluate(() => window.__MORPHEUS_CAPTURE__);
    if (!result || result.status !== 'done' || !result.frames?.length) {
      throw new Error(
        result?.error ??
          `capture failed for scene ${sceneId}: ${result?.status ?? 'no result'}`,
      );
    }
    await mkdir(framesDir, { recursive: true });
    for (let i = 0; i < result.frames.length; i += 1) {
      const filePath = path.join(
        framesDir,
        `f${String(i).padStart(3, '0')}.png`,
      );
      await dataUrlToPngFile(result.frames[i], filePath);
    }
    return {
      sceneId,
      kind: result.kind,
      frameCount: result.frames.length,
      framesDir,
    };
  } finally {
    await page.close();
  }
}

async function main() {
  const options = parseGenerateArguments();
  if (options.help) {
    process.stdout.write(`Usage: node scripts/generate-scene-previews.mjs [options]

Options:
  --base-url <url>   Capture app base (default ${DEFAULT_BASE_URL})
  --out <dir>        Output root (default .scene-previews)
  --manifest <path>  Inventory/manifest path
  --scene <id>       Only this scene (repeatable)
  --frames <n>       Pano frame count (default ${DEFAULT_PANO_FRAMES})
  --width <n>        OG GIF max width ≤640 (default ${DEFAULT_GIF_WIDTH}; source PNGs stay 640×400)
  --dry-run          Print dirty set only
`);
    return;
  }

  let previous = null;
  try {
    previous = JSON.parse(await readFile(options.manifestPath, 'utf8'));
  } catch {
    previous = null;
  }

  const inventory = await buildInventory({
    sceneIds: options.sceneIds,
  });
  const { dirty } = computeDirtySet(
    options.allDirty ? previous : null,
    inventory,
  );
  const targets = options.sceneIds
    ? inventory.scenes.filter((row) => options.sceneIds.includes(row.sceneId))
    : dirty;

  process.stdout.write(
    JSON.stringify(
      {
        policyVersion: PREVIEW_POLICY_VERSION,
        targetCount: targets.length,
        targets: targets.map((row) => ({
          sceneId: row.sceneId,
          kind: row.kind,
          inputHash: row.inputHash,
        })),
      },
      null,
      2,
    ) + '\n',
  );

  if (options.dryRun || targets.length === 0) {
    return;
  }

  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--enable-webgl',
      '--ignore-gpu-blocklist',
      '--use-gl=angle',
      '--use-angle=metal',
    ],
  });

  const gifDir = path.join(options.outDir, 'gif');
  const masterDir = path.join(options.outDir, 'master');
  await mkdir(gifDir, { recursive: true });
  await mkdir(masterDir, { recursive: true });

  const results = [];
  let done = 0;
  try {
    for (const row of targets) {
      const framesDir = path.join(
        options.outDir,
        'intermediates',
        String(row.sceneId),
      );
      process.stderr.write(
        `[${done + 1}/${targets.length}] capturing scene ${row.sceneId} (${row.kind})\n`,
      );
      try {
        const captured = await captureSceneInBrowser({
          browser,
          baseUrl: options.baseUrl,
          sceneId: row.sceneId,
          framesDir,
          panoFrames: options.panoFrames,
        });
        const pattern = path.join(framesDir, 'f%03d.png');
        const masterPath = path.join(masterDir, `${row.sceneId}.mp4`);
        const gifPath = path.join(gifDir, `${row.sceneId}.gif`);
        await runFfmpegMasterMp4(pattern, masterPath);
        await runFfmpegGif(pattern, gifPath, options.maxWidth);
        results.push({
          sceneId: row.sceneId,
          kind: captured.kind,
          frameCount: captured.frameCount,
          masterPath,
          gifPath,
          inputHash: row.inputHash,
          status: 'ok',
        });
        process.stderr.write(`  wrote ${masterPath} + ${gifPath}\n`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        process.stderr.write(`  FAIL scene ${row.sceneId}: ${message}\n`);
        results.push({
          sceneId: row.sceneId,
          kind: row.kind,
          status: 'failed',
          error: message,
          inputHash: row.inputHash,
        });
      }
      done += 1;
    }
  } finally {
    await browser.close();
  }

  const nextManifest = {
    ...inventory,
    generatedAt: new Date().toISOString(),
    results,
  };
  await mkdir(path.dirname(options.manifestPath), { recursive: true });
  await writeFile(
    options.manifestPath,
    `${JSON.stringify(nextManifest, null, 2)}\n`,
    'utf8',
  );
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
