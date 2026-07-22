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

- Intermediates: `packages/www/.scene-previews/intermediates/{sceneId}/fXXX.png`
- GIFs: `packages/www/.scene-previews/gif/{sceneId}.gif`
- Manifest: `packages/www/.scene-previews/manifest.json`

Publish GIFs to public CDN under `previews/scenes/{sceneId}.gif` (same discipline as GameDB uploads). Point `NEXT_PUBLIC_SCENE_PREVIEWS_ORIGIN` at that origin so `generateMetadata` can emit absolute `og:image` URLs.

## Policy notes

- Fresh-start gamestate only (new-player activation)
- Pano = full 360° WebGL loop starting at entry heading **1500** (morpheus ROT / `yaw3600`, same as living-save default); specials = timed motion grab of active special/TRN casts
- MCP is not used for batch capture
- Capture route returns 404 when `CAPTURE_MODE` is off and not in development
