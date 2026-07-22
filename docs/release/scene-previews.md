# Scene OG preview GIFs

Offline pipeline that captures every scene via WebGL and publishes length-capped animated GIFs for `og:image`.

## Prerequisites

- Node 24+ (`nvm use`)
- GameDB media at `packages/www/public/GameDB` (or path passed to inventory)
- Map at `packages/morpheus/client/js/service/morpheus.map.json`
- `ffmpeg` on `PATH`
- Playwright Chromium: `yarn workspace morpheus-next add -D playwright` then `npx playwright install chromium`
- Next app running: `yarn workspace morpheus-next dev` (or `CAPTURE_MODE=1` for non-dev)

## Commands

```bash
# Enumerate scenes + content hashes (optional --write)
yarn workspace morpheus-next preview:inventory --write

# Capture + encode one scene (app must be running)
yarn workspace morpheus-next preview:generate --scene 1010

# Dry-run dirty set against existing manifest
yarn workspace morpheus-next preview:generate --dry-run
```

Capture URL (self-driving):

```text
http://localhost:3000/capture/scene/1010?frames=24
```

When finished, the page sets `document.documentElement.dataset.captureState` to `done` or `failed` and exposes `window.__MORPHEUS_CAPTURE__` with PNG data URLs.

## Outputs

- Intermediates (native **640×400** PNGs, **480** pano frames ≈ 0.75° steps):  
  `packages/www/.scene-previews/intermediates/{sceneId}/fXXX.png`
- Master MP4 (**60 fps**, full 640×400 — smooth shareable spin, ~8s/rev):  
  `packages/www/.scene-previews/master/{sceneId}.mp4`
- HQ WebM/VP9 (**60 fps**, 640×400):  
  `packages/www/.scene-previews/webm/{sceneId}.webm`
- OG GIF (**12 fps** temporal subsample, default **320** wide):  
  `packages/www/.scene-previews/gif/{sceneId}.gif`
- Manifest: `packages/www/.scene-previews/manifest.json`

Prefer re-encoding GIF/WebP from intermediates when only size/fps change; use `--force` to recapture.

Publish GIFs to public CDN under `previews/scenes/{sceneId}.gif` (same discipline as GameDB uploads). Point `NEXT_PUBLIC_SCENE_PREVIEWS_ORIGIN` at that origin so `generateMetadata` can emit absolute `og:image` URLs.

## Policy notes

- Fresh-start gamestate only (new-player activation)
- Pano = full 360° WebGL spin **one direction** from entry (**1500 − 75 = 1425**). After grab, frames are rotated so the last sample becomes GIF frame 0 (static OG poster) without rewinding yaw mid-capture; specials = timed motion grab of active special/TRN casts
- MCP is not used for batch capture
- Capture route returns 404 when `CAPTURE_MODE` is off and not in development
