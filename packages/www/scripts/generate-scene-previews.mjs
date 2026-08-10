/**
 * Batch driver: self-driving WebGL capture → native 640×400 PNGs →
 * HQ master MP4 + animated WebP + smaller high-fps OG GIF.
 *
 * Requires: running Next app, Playwright Chromium, ffmpeg on PATH.
 */

import { spawn } from 'node:child_process';
import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildInventory,
  computeDirtySet,
  PREVIEW_POLICY_VERSION,
} from './scene-preview-inventory.mjs';
import {
  collectScenePreviewFiles,
  completeSceneIds,
} from './preview-paths.mjs';

const packageDirectory = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_OUT = path.resolve(packageDirectory, '../.scene-previews');
const DEFAULT_MANIFEST = path.join(DEFAULT_OUT, 'manifest.json');
const DEFAULT_BASE_URL = 'http://localhost:3000';

/** Authored stage size — never upscale. */
export const NATIVE_WIDTH = 640;
export const NATIVE_HEIGHT = 400;
/** Dense pano samples (~0.75° steps) for smooth 60fps masters. */
export const DEFAULT_PANO_FRAMES = 480;
/** Prefer motion over resolution on GIF. */
export const DEFAULT_GIF_WIDTH = 320;
/** Smooth shareable masters. */
export const DEFAULT_MASTER_FPS = 60;
/** GIF temporal downsample from dense sources. */
export const DEFAULT_GIF_FPS = 12;
export const DEFAULT_WEBM_FPS = 60;

export function parseGenerateArguments(argv = process.argv.slice(2)) {
  const options = {
    baseUrl: DEFAULT_BASE_URL,
    outDir: DEFAULT_OUT,
    manifestPath: DEFAULT_MANIFEST,
    sceneIds: null,
    allDirty: true,
    dryRun: false,
    force: false,
    maxWidth: DEFAULT_GIF_WIDTH,
    panoFrames: DEFAULT_PANO_FRAMES,
    masterFps: DEFAULT_MASTER_FPS,
    webmFps: DEFAULT_WEBM_FPS,
    gifFps: DEFAULT_GIF_FPS,
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
    } else if (arg === '--force') {
      options.force = true;
    } else if (arg === '--encode-only') {
      // Re-encode master/webm/gif from existing intermediate PNGs (no browser).
      options.encodeOnly = true;
      options.force = true;
    } else if (arg === '--width' && argv[i + 1]) {
      options.maxWidth = Math.min(NATIVE_WIDTH, Number(argv[++i]));
    } else if (arg === '--frames' && argv[i + 1]) {
      options.panoFrames = Number(argv[++i]);
    } else if (arg === '--fps' && argv[i + 1]) {
      // Master/webm only — GIF stays at gifFps unless --gif-fps is set
      const fps = Number(argv[++i]);
      options.masterFps = fps;
      options.webmFps = fps;
    } else if (arg === '--gif-fps' && argv[i + 1]) {
      options.gifFps = Number(argv[++i]);
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    }
  }
  return options;
}

export function captureUrl(baseUrl, sceneId, frames = DEFAULT_PANO_FRAMES) {
  return `${baseUrl}/capture/scene/${sceneId}?frames=${frames}&w=${NATIVE_WIDTH}&h=${NATIVE_HEIGHT}`;
}

export function mergePreviewResults(previousResults, currentResults, scenes) {
  const currentById = new Map(
    currentResults.map((result) => [result.sceneId, result]),
  );
  const previousById = new Map(
    (previousResults ?? []).map((result) => [result.sceneId, result]),
  );
  return scenes.flatMap((scene) => {
    const current = currentById.get(scene.sceneId);
    if (current) return [current];
    const previous = previousById.get(scene.sceneId);
    return previous?.inputHash === scene.inputHash ? [previous] : [];
  });
}

export function isInfrastructureFailure(message) {
  return (
    message.includes('ERR_CONNECTION_REFUSED') ||
    message.includes('Target page, context or browser has been closed') ||
    message.includes('browser.newPage: Browser has been closed')
  );
}

async function writeManifestAtomic(manifestPath, manifest) {
  const temporaryPath = `${manifestPath}.${process.pid}.tmp`;
  await mkdir(path.dirname(manifestPath), { recursive: true });
  await writeFile(
    temporaryPath,
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  );
  await rename(temporaryPath, manifestPath);
}

async function assertCaptureServerReady(baseUrl, sceneId) {
  let response;
  try {
    response = await fetch(captureUrl(baseUrl, sceneId, 1));
  } catch (error) {
    throw new Error(
      `Capture server is not reachable at ${baseUrl}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!response.ok) {
    throw new Error(
      `Capture route is not ready at ${baseUrl} (HTTP ${response.status})`,
    );
  }
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

/** HQ master MP4 at native 640×400 (high fps, modest bitrate for share). */
export function runFfmpegMasterMp4(
  framePattern,
  outputMp4,
  framerate = DEFAULT_MASTER_FPS,
) {
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
    '-movflags',
    '+faststart',
    '-an',
    outputMp4,
  ]);
}

/**
 * HQ WebM (VP9) — modern animated sibling when libwebp is not built into ffmpeg.
 * Native 640×400, good quality, smaller than GIF.
 */
export function runFfmpegWebm(
  framePattern,
  outputWebm,
  framerate = DEFAULT_WEBM_FPS,
) {
  return runFfmpeg([
    '-y',
    '-framerate',
    String(framerate),
    '-i',
    framePattern,
    '-c:v',
    'libvpx-vp9',
    '-b:v',
    '0',
    '-crf',
    '28',
    '-row-mt',
    '1',
    '-deadline',
    'good',
    '-cpu-used',
    '2',
    '-pix_fmt',
    'yuv420p',
    '-an',
    outputWebm,
  ]);
}

/**
 * OG GIF: temporal + spatial downsample from dense HQ sources.
 *
 * Important: `-framerate` on input must be the *source* rate (e.g. 60 for
 * 480-frame panos) so duration matches the master. Then `fps=gifFps` drops
 * frames. Using gifFps as the input rate keeps every PNG → 40s GIFs.
 */
export function runFfmpegGif(
  framePattern,
  outputGif,
  {
    maxWidth = DEFAULT_GIF_WIDTH,
    sourceFps = DEFAULT_MASTER_FPS,
    gifFps = DEFAULT_GIF_FPS,
    maxColors = 128,
  } = {},
) {
  const scale =
    maxWidth < NATIVE_WIDTH ? `scale=${maxWidth}:-1:flags=lanczos,` : '';
  return runFfmpeg([
    '-y',
    '-framerate',
    String(sourceFps),
    '-i',
    framePattern,
    '-vf',
    `fps=${gifFps},${scale}split[s0][s1];[s0]palettegen=max_colors=${maxColors}:stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=5`,
    '-loop',
    '0',
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
  timeoutMs = 360000,
}) {
  const page = await browser.newPage({
    viewport: { width: NATIVE_WIDTH, height: NATIVE_HEIGHT },
    deviceScaleFactor: 1,
  });
  page.setDefaultTimeout(timeoutMs);
  try {
    const url = captureUrl(baseUrl, sceneId, panoFrames);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    await page.waitForFunction(
      () => {
        const state = document.documentElement.dataset.captureState;
        return state === 'done' || state === 'failed';
      },
      null,
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
    // Drop huge base64 payload from returned result
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

async function countPngFrames(framesDir) {
  try {
    const names = await readdir(framesDir);
    return names.filter((n) => /^f\d+\.png$/i.test(n)).length;
  } catch {
    return 0;
  }
}

async function encodeOutputsForScene({
  sceneId,
  kind,
  framesDir,
  frameCount,
  options,
  gifDir,
  masterDir,
  webmDir,
  inputHash,
}) {
  const pattern = path.join(framesDir, 'f%03d.png');
  const masterPath = path.join(masterDir, `${sceneId}.mp4`);
  const webmPath = path.join(webmDir, `${sceneId}.webm`);
  const gifPath = path.join(gifDir, `${sceneId}.gif`);
  // Specials ≈ game rate; panos use dense master rate for correct duration.
  const sourceFps = kind === 'pano' ? options.masterFps : options.gifFps;
  await runFfmpegMasterMp4(pattern, masterPath, sourceFps);
  await runFfmpegWebm(pattern, webmPath, sourceFps);
  await runFfmpegGif(pattern, gifPath, {
    maxWidth: options.maxWidth,
    sourceFps,
    gifFps: options.gifFps,
  });
  return {
    sceneId,
    kind,
    frameCount,
    masterPath,
    webmPath,
    gifPath,
    inputHash,
    status: 'ok',
  };
}

async function main() {
  const options = parseGenerateArguments();
  if (options.help) {
    process.stdout
      .write(`Usage: node scripts/generate-scene-previews.mjs [options]

Options:
  --base-url <url>   Capture app base (default ${DEFAULT_BASE_URL})
  --out <dir>        Output root (default .scene-previews)
  --manifest <path>  Inventory/manifest path
  --scene <id>       Only this scene (repeatable)
  --frames <n>       Pano frame count (default ${DEFAULT_PANO_FRAMES})
  --fps <n>          Master/WebM framerate (default ${DEFAULT_MASTER_FPS})
  --gif-fps <n>      GIF framerate (default ${DEFAULT_GIF_FPS}; can be lower)
  --width <n>        OG GIF max width ≤640 (default ${DEFAULT_GIF_WIDTH})
  --force            Ignore previous hashes; recapture all targets
  --encode-only      Re-encode from existing intermediate PNGs (no browser)
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

  const inventory = await buildInventory();
  const localFiles = await collectScenePreviewFiles(options.outDir);
  const completedSceneIds = completeSceneIds(localFiles.files);
  const { dirty } = computeDirtySet(
    options.allDirty && !options.force && !options.encodeOnly ? previous : null,
    inventory,
    { completedSceneIds },
  );
  let targets = options.sceneIds
    ? inventory.scenes.filter((row) => options.sceneIds.includes(row.sceneId))
    : dirty;

  if (options.encodeOnly) {
    // Prefer scenes that already have intermediates on disk
    const interRoot = path.join(options.outDir, 'intermediates');
    let dirs = [];
    try {
      dirs = await readdir(interRoot);
    } catch {
      dirs = [];
    }
    const onDisk = new Set(
      dirs.filter((d) => /^\d+$/.test(d)).map((d) => Number(d)),
    );
    targets = inventory.scenes.filter((row) => {
      if (options.sceneIds && !options.sceneIds.includes(row.sceneId)) {
        return false;
      }
      return onDisk.has(row.sceneId);
    });
  }

  process.stdout.write(
    JSON.stringify(
      {
        policyVersion: PREVIEW_POLICY_VERSION,
        encodeOnly: Boolean(options.encodeOnly),
        targetCount: targets.length,
        panoFrames: options.panoFrames,
        masterFps: options.masterFps,
        webmFps: options.webmFps,
        gifFps: options.gifFps,
        gifWidth: options.maxWidth,
        sampleTargets: targets.slice(0, 8).map((row) => ({
          sceneId: row.sceneId,
          kind: row.kind,
        })),
      },
      null,
      2,
    ) + '\n',
  );

  if (options.dryRun || targets.length === 0) {
    return;
  }

  const gifDir = path.join(options.outDir, 'gif');
  const masterDir = path.join(options.outDir, 'master');
  const webmDir = path.join(options.outDir, 'webm');
  await mkdir(gifDir, { recursive: true });
  await mkdir(masterDir, { recursive: true });
  await mkdir(webmDir, { recursive: true });

  let browser = null;
  if (!options.encodeOnly) {
    await assertCaptureServerReady(options.baseUrl, targets[0].sceneId);
    const { chromium } = await loadPlaywright();
    browser = await chromium.launch({
      headless: true,
      args: [
        '--enable-webgl',
        '--ignore-gpu-blocklist',
        '--use-gl=angle',
        '--use-angle=metal',
      ],
    });
  }

  const results = [];
  let done = 0;
  let consecutiveInfrastructureFailures = 0;
  const createManifest = () => ({
    ...inventory,
    generatedAt: new Date().toISOString(),
    encode: {
      panoFrames: options.panoFrames,
      masterFps: options.masterFps,
      webmFps: options.webmFps,
      gifFps: options.gifFps,
      gifWidth: options.maxWidth,
    },
    results: mergePreviewResults(previous?.results, results, inventory.scenes),
  });
  try {
    for (const row of targets) {
      const framesDir = path.join(
        options.outDir,
        'intermediates',
        String(row.sceneId),
      );
      process.stderr.write(
        `[${done + 1}/${targets.length}] ${options.encodeOnly ? 'encoding' : 'capturing'} scene ${row.sceneId} (${row.kind})\n`,
      );
      try {
        let frameCount = 0;
        let kind = row.kind;
        if (!options.encodeOnly) {
          const captured = await captureSceneInBrowser({
            browser,
            baseUrl: options.baseUrl,
            sceneId: row.sceneId,
            framesDir,
            panoFrames: options.panoFrames,
          });
          frameCount = captured.frameCount;
          kind = captured.kind;
        } else {
          frameCount = await countPngFrames(framesDir);
          if (frameCount === 0) {
            throw new Error('no intermediate PNGs on disk');
          }
          // Dense packs are panos; short packs are specials
          if (frameCount >= options.panoFrames * 0.5) {
            kind = 'pano';
          }
        }
        const encoded = await encodeOutputsForScene({
          sceneId: row.sceneId,
          kind,
          framesDir,
          frameCount,
          options,
          gifDir,
          masterDir,
          webmDir,
          inputHash: row.inputHash,
        });
        results.push(encoded);
        consecutiveInfrastructureFailures = 0;
        process.stderr.write(
          `  wrote master mp4 + webm + gif (${frameCount} frames → gif @ ${options.gifFps}fps / ${options.maxWidth}px)\n`,
        );
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
        consecutiveInfrastructureFailures = isInfrastructureFailure(message)
          ? consecutiveInfrastructureFailures + 1
          : 0;
      }
      done += 1;
      await writeManifestAtomic(options.manifestPath, createManifest());
      if (consecutiveInfrastructureFailures >= 3) {
        process.stderr.write(
          'stopping after 3 consecutive capture infrastructure failures\n',
        );
        break;
      }
    }
  } finally {
    if (browser) {
      await browser.close();
    }
  }

  const nextManifest = createManifest();
  await writeManifestAtomic(options.manifestPath, nextManifest);

  const ok = nextManifest.results.filter((r) => r.status === 'ok').length;
  const failed = nextManifest.results.filter(
    (r) => r.status === 'failed',
  ).length;
  process.stderr.write(`done: ${ok} ok, ${failed} failed\n`);
  const resultById = new Map(
    nextManifest.results.map((result) => [result.sceneId, result]),
  );
  const targetFailures = targets.filter(
    (target) => resultById.get(target.sceneId)?.status !== 'ok',
  );
  const fullRunIncomplete =
    options.sceneIds === null && (failed > 0 || ok !== inventory.sceneCount);
  if (targetFailures.length > 0 || fullRunIncomplete) {
    throw new Error(
      `Preview generation is incomplete: ${ok}/${inventory.sceneCount} scenes ready, ${failed} failed`,
    );
  }
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
