import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

const packageDirectory = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_CATALOG_PATH = path.resolve(
  packageDirectory,
  '../src/generated/sceneCatalog.json',
);

function parseArguments(argv = process.argv.slice(2)) {
  const options = {
    baseUrl: 'http://localhost:3000',
    catalogPath: DEFAULT_CATALOG_PATH,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--base-url' || argument === '--catalog') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error(`Missing value for ${argument}`);
      }
      if (argument === '--base-url') options.baseUrl = value.replace(/\/$/, '');
      else options.catalogPath = path.resolve(value);
      index += 1;
    } else if (argument === '--help' || argument === '-h') {
      options.help = true;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  return options;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function registerPageFailures(page, failures) {
  page.on('console', (message) => {
    if (message.type() === 'error') {
      if (message.text().startsWith('Failed to load resource:')) return;
      failures.push(`console: ${message.text()}`);
    }
  });
  page.on('pageerror', (error) => failures.push(`page: ${error.message}`));
  page.on('response', (response) => {
    if (response.status() < 400) return;
    const url = new URL(response.url());
    if (url.pathname === '/scene/not-a-scene') return;
    failures.push(`response ${response.status()}: ${response.url()}`);
  });
}

async function assertNoHorizontalOverflow(page, route) {
  const overflows = await page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth,
  );
  assert(!overflows, `${route} has horizontal overflow`);
}

async function verifyHomepage(browser, baseUrl, failures) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  registerPageFailures(page, failures);
  await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle' });
  await page
    .getByRole('heading', { name: 'Soap Bubble Productions' })
    .waitFor();
  assert(
    (await page.locator('canvas').count()) === 0,
    'Homepage booted the game',
  );
  await page.getByRole('link', { name: 'Play Morpheus' }).click();
  await page.waitForURL(`${baseUrl}/morpheus`);
  await page.goBack({ waitUntil: 'networkidle' });
  await page.getByRole('link', { name: 'Open scene index' }).click();
  await page.waitForURL(`${baseUrl}/scenes`);
  await page.goBack({ waitUntil: 'networkidle' });
  await assertNoHorizontalOverflow(page, '/');
  await context.close();
}

async function verifySceneDirectory(browser, baseUrl, catalog, failures) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  registerPageFailures(page, failures);
  await page.goto(`${baseUrl}/scenes`, { waitUntil: 'domcontentloaded' });
  const cards = page.locator('[data-scene-card]');
  await cards.first().waitFor();
  assert(
    (await cards.count()) === catalog.sceneCount,
    `Scene index did not render ${catalog.sceneCount} cards`,
  );
  const firstCard = cards.first();
  const firstPoster = firstCard.locator('img');
  const firstVideo = firstCard.locator('[data-scene-preview]');
  await firstPoster.evaluate((image) => image.decode());
  assert(
    (await firstPoster.getAttribute('src'))?.endsWith('/1010.png'),
    'Scene index did not render the first-frame poster',
  );
  assert(
    (await page.locator('[data-scene-preview][src]').count()) === 0,
    'Scene index loaded movies before interaction',
  );
  assert(
    (await firstVideo.getAttribute('data-src-mp4'))?.endsWith('/1010.mp4'),
    'Scene index did not expose the published MP4 fallback',
  );
  assert(
    (await firstVideo.getAttribute('data-src-webm'))?.endsWith('/1010.webm'),
    'Scene index did not expose the WebM preview source',
  );

  await firstCard.hover();
  await page.waitForFunction(() => {
    const video = document.querySelector('[data-scene-preview="1010"]');
    return video instanceof HTMLVideoElement && !video.paused;
  });
  const timeBeforePause = await firstVideo.evaluate(
    (video) => video.currentTime,
  );
  assert(
    (await firstVideo.getAttribute('data-media-source')) === 'webm',
    'Compatible browser did not select the WebM preview source',
  );
  await page.mouse.move(0, 0);
  await page.waitForFunction(() => {
    const video = document.querySelector('[data-scene-preview="1010"]');
    return video instanceof HTMLVideoElement && video.paused;
  });
  const pausedMovie = await firstVideo.evaluate((video) => ({
    currentTime: video.currentTime,
    hasSource: video.hasAttribute('src'),
  }));
  assert(pausedMovie.hasSource, 'Scene movie was unloaded when hover ended');
  assert(
    pausedMovie.currentTime >= timeBeforePause,
    'Scene movie reset when hover ended',
  );

  const query = String(catalog.scenes.at(-1).sceneId);
  await page.getByRole('searchbox', { name: 'Find a scene ID' }).fill(query);
  const visibleIds = await page
    .locator('[data-scene-card]:visible')
    .evaluateAll((elements) =>
      elements.map((element) => element.getAttribute('data-scene-id')),
    );
  assert(visibleIds.length > 0, `Scene search found no results for ${query}`);
  assert(
    visibleIds.every((sceneId) => sceneId?.includes(query)),
    `Scene search returned an unrelated result for ${query}`,
  );
  await assertNoHorizontalOverflow(page, '/scenes');
  await context.close();

  const fallbackContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  await fallbackContext.addInitScript(() => {
    const nativeCanPlayType = HTMLMediaElement.prototype.canPlayType;
    Object.defineProperty(HTMLMediaElement.prototype, 'canPlayType', {
      configurable: true,
      value(type) {
        if (type === 'video/webm') return '';
        return nativeCanPlayType.call(this, type);
      },
    });
  });
  const fallbackPage = await fallbackContext.newPage();
  registerPageFailures(fallbackPage, failures);
  await fallbackPage.goto(`${baseUrl}/scenes`, {
    waitUntil: 'domcontentloaded',
  });
  const fallbackCard = fallbackPage.locator('[data-scene-card]').first();
  const fallbackVideo = fallbackCard.locator('[data-scene-preview]');
  await fallbackCard.hover();
  await fallbackPage.waitForFunction(() => {
    const video = document.querySelector('[data-scene-preview="1010"]');
    return (
      video instanceof HTMLVideoElement &&
      video.dataset.mediaSource === 'mp4' &&
      !video.paused
    );
  });
  assert(
    (await fallbackVideo.getAttribute('src'))?.endsWith('/1010.mp4'),
    'Unsupported WebM did not select the published MP4 fallback',
  );
  await fallbackContext.close();

  const touchContext = await browser.newContext({
    hasTouch: true,
    viewport: { width: 390, height: 844 },
  });
  const touchPage = await touchContext.newPage();
  registerPageFailures(touchPage, failures);
  await touchPage.goto(`${baseUrl}/scenes`, {
    waitUntil: 'domcontentloaded',
  });
  const touchCard = touchPage.locator('[data-scene-card]').first();
  const touchVideo = touchCard.locator('[data-scene-preview]');
  await touchCard.dispatchEvent('pointerdown', {
    bubbles: true,
    isPrimary: true,
    pointerId: 1,
    pointerType: 'touch',
  });
  await touchPage.waitForTimeout(550);
  await touchPage.waitForFunction(() => {
    const video = document.querySelector('[data-scene-preview="1010"]');
    return video instanceof HTMLVideoElement && !video.paused;
  });
  const touchTimeBeforePause = await touchVideo.evaluate(
    (video) => video.currentTime,
  );
  await touchCard.dispatchEvent('pointerup', {
    bubbles: true,
    isPrimary: true,
    pointerId: 1,
    pointerType: 'touch',
  });
  await touchPage.waitForFunction(() => {
    const video = document.querySelector('[data-scene-preview="1010"]');
    return video instanceof HTMLVideoElement && video.paused;
  });
  const pausedTouchMovie = await touchVideo.evaluate((video) => ({
    currentTime: video.currentTime,
    hasSource: video.hasAttribute('src'),
  }));
  assert(pausedTouchMovie.hasSource, 'Scene movie was unloaded after long tap');
  assert(
    pausedTouchMovie.currentTime >= touchTimeBeforePause,
    'Scene movie reset after long tap',
  );
  await touchContext.close();

  const reducedContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: 'reduce',
  });
  const reducedPage = await reducedContext.newPage();
  registerPageFailures(reducedPage, failures);
  await reducedPage.goto(`${baseUrl}/scenes`, {
    waitUntil: 'domcontentloaded',
  });
  await reducedPage.locator('[data-scene-card]').first().waitFor();
  await reducedPage.locator('[data-scene-card]').first().hover();
  await reducedPage.waitForTimeout(100);
  assert(
    (await reducedPage.locator('[data-scene-preview][src]').count()) === 0,
    'Reduced-motion scene preview loaded a movie',
  );
  await assertNoHorizontalOverflow(reducedPage, '/scenes mobile');
  await reducedContext.close();
}

async function verifyExplorer(browser, baseUrl, failures) {
  const context = await browser.newContext({
    viewport: { width: 1000, height: 900 },
  });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async (data) => {
        window.__morpheusSharedScene = data;
      },
    });
  });
  const page = await context.newPage();
  registerPageFailures(page, failures);
  await page.goto(`${baseUrl}/scene/105051`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Scene 105051' }).waitFor();
  const stage = page.locator('#scene-stage');
  await stage.locator('canvas').first().waitFor();
  const bounds = await stage.boundingBox();
  assert(bounds !== null, 'Explorer stage has no layout box');
  await page.mouse.click(
    bounds.x + bounds.width / 2,
    bounds.y + bounds.height / 2,
  );
  await page.waitForTimeout(500);
  await page.mouse.click(
    bounds.x + (bounds.width * 100) / 640,
    bounds.y + (bounds.height * 100) / 400,
  );
  await page.waitForURL((url) => url.pathname !== '/scene/105051', {
    timeout: 15000,
  });
  const currentSceneId = page.url().split('/').at(-1);
  await page
    .getByRole('heading', { name: `Scene ${currentSceneId}` })
    .waitFor();
  await page.getByRole('button', { name: 'Share scene' }).click();
  await page.getByRole('button', { name: 'Shared' }).waitFor();
  const sharedUrl = await page.evaluate(
    () => window.__morpheusSharedScene?.url ?? null,
  );
  assert(sharedUrl === page.url(), 'Explorer shared a stale scene URL');
  await page.getByRole('button', { name: 'Reset scene' }).click();
  await page.getByRole('button', { name: 'Scene reset' }).waitFor();
  await assertNoHorizontalOverflow(page, '/scene/[sceneId]');
  await context.close();

  const invalidContext = await browser.newContext();
  const invalidPage = await invalidContext.newPage();
  registerPageFailures(invalidPage, failures);
  await invalidPage.goto(`${baseUrl}/scene/not-a-scene`);
  await invalidPage
    .getByRole('heading', { name: 'Scene not found.' })
    .waitFor();
  await invalidContext.close();

  return Number(currentSceneId);
}

async function verifyFullGame(browser, baseUrl, failures) {
  const context = await browser.newContext({
    viewport: { width: 1000, height: 800 },
  });
  const page = await context.newPage();
  registerPageFailures(page, failures);
  await page.goto(`${baseUrl}/morpheus`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Choose your journey' }).waitFor();
  await page.getByRole('button', { name: /Slot 1/ }).click();
  await page.getByRole('button', { name: 'Skip intro' }).click();
  const stage = page.locator('[data-current-scene="2000"]');
  await stage.waitFor({ timeout: 30000 });
  const bounds = await stage.boundingBox();
  assert(bounds !== null, 'Full game stage has no layout box');
  // Let the panorama finish its initial GPU/media presentation before the
  // acceptance click; a mounted canvas is not yet an interactive frame.
  await page.waitForTimeout(5000);
  await page.mouse.click(
    bounds.x + bounds.width / 2,
    bounds.y + bounds.height / 2,
  );
  await page.waitForFunction(
    () =>
      document
        .querySelector('[data-current-scene]')
        ?.getAttribute('data-current-scene') !== '2000',
    null,
    { timeout: 15000 },
  );
  assert(
    new URL(page.url()).pathname === '/morpheus',
    'Full game changed its URL',
  );
  const resultingSceneId = await page
    .locator('[data-current-scene]')
    .getAttribute('data-current-scene');
  await context.close();
  return Number(resultingSceneId);
}

async function verifyMobileHomepage(browser, baseUrl, failures) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  registerPageFailures(page, failures);
  await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle' });
  await page
    .getByRole('heading', { name: 'Soap Bubble Productions' })
    .waitFor();
  await assertNoHorizontalOverflow(page, '/ mobile');
  await context.close();
}

async function main() {
  const options = parseArguments();
  if (options.help) {
    process.stdout.write(
      'Usage: node scripts/verify-public-site.mjs [--base-url http://localhost:3000] [--catalog path]\n',
    );
    return;
  }
  const catalog = JSON.parse(await readFile(options.catalogPath, 'utf8'));
  const browser = await chromium.launch({ headless: true });
  const failures = [];
  try {
    await verifyHomepage(browser, options.baseUrl, failures);
    await verifySceneDirectory(browser, options.baseUrl, catalog, failures);
    const explorerResult = await verifyExplorer(
      browser,
      options.baseUrl,
      failures,
    );
    const fullGameResult = await verifyFullGame(
      browser,
      options.baseUrl,
      failures,
    );
    await verifyMobileHomepage(browser, options.baseUrl, failures);
    if (failures.length) {
      throw new Error(`Browser errors:\n${failures.join('\n')}`);
    }
    process.stdout.write(
      `${JSON.stringify(
        {
          baseUrl: options.baseUrl,
          explorer: { from: 105051, to: explorerResult },
          fullGame: { from: 2000, to: fullGameResult, path: '/morpheus' },
          sceneCount: catalog.sceneCount,
          status: 'ok',
          viewports: ['1440x1000', '1000x900', '1000x800', '390x844'],
        },
        null,
        2,
      )}\n`,
    );
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
