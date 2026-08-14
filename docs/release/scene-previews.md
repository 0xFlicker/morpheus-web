# Scene preview media

Offline pipeline that captures every scene via WebGL and publishes a static first-frame poster plus animated preview formats.

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

# Prove catalog, manifest, and all four local formats contain the same scenes
yarn workspace morpheus-next preview:verify
```

Capture URL (self-driving):

```text
http://localhost:3000/capture/scene/1010?frames=24
```

When finished, the page sets `document.documentElement.dataset.captureState` to `done` or `failed` and exposes `window.__MORPHEUS_CAPTURE__` with PNG data URLs.

## Outputs

- Intermediates (native **640×400** PNGs, **480** pano frames ≈ 0.75° steps):  
  `packages/www/.scene-previews/intermediates/{sceneId}/fXXX.png`
- Static poster (the existing first capture frame, **640×400**): `packages/www/.scene-previews/intermediates/{sceneId}/f000.png`
- Master MP4 (**60 fps**, full 640×400 — smooth shareable spin, ~8s/rev):  
  `packages/www/.scene-previews/master/{sceneId}.mp4`
- HQ WebM/VP9 (**60 fps**, 640×400):  
  `packages/www/.scene-previews/webm/{sceneId}.webm`
- OG GIF (**12 fps** temporal subsample, default **320** wide):  
  `packages/www/.scene-previews/gif/{sceneId}.gif`
- Manifest: `packages/www/.scene-previews/manifest.json`

Prefer re-encoding GIF/WebP from intermediates when only size/fps change; use `--force` to recapture.

## Upload to Vercel Blob (public media store)

Stable public keys (sibling to `GameDB/`):

| Local file                    | Blob key                    |
| ----------------------------- | --------------------------- |
| `intermediates/{id}/f000.png` | `previews/scenes/{id}.png`  |
| `gif/{id}.gif`                | `previews/scenes/{id}.gif`  |
| `master/{id}.mp4`             | `previews/scenes/{id}.mp4`  |
| `webm/{id}.webm`              | `previews/scenes/{id}.webm` |

```bash
# Dry-run inventory
yarn workspace morpheus-next upload:previews -- \
  --report /tmp/previews-import.json --dry-run

# Real upload (public-store token — see tokens below)
BLOB_READ_WRITE_TOKEN=... yarn workspace morpheus-next upload:previews -- \
  --report previews-import.json

# After upload, also prove the upload report contains the exact same objects
yarn workspace morpheus-next preview:verify -- \
  --upload-report previews-import.json
```

### Blob tokens (important)

There are **two** Blob stores:

| Store            | Host (example)                                                  | What lives there          | Token in `.env.local` today         |
| ---------------- | --------------------------------------------------------------- | ------------------------- | ----------------------------------- |
| **Private map**  | (map store id in `BLOB_READ_WRITE_TOKEN`)                       | `morpheus.map.json` only  | `BLOB_READ_WRITE_TOKEN` points here |
| **Public media** | `NEXT_PUBLIC_MORPHEUS_GAMEDB_ORIGIN` host (`ol0swvwh4hjeaxzf…`) | `GameDB/…` + `previews/…` | **Need a separate RW token**        |

The private-map token **cannot** upload previews (store only lists `morpheus.map.json`).

**Create a public-store RW token:** Vercel Dashboard → Storage → select the store behind `NEXT_PUBLIC_MORPHEUS_GAMEDB_ORIGIN` → Tokens → create read-write → export as `BLOB_READ_WRITE_TOKEN` for the upload command only (or a dedicated `BLOB_PUBLIC_READ_WRITE_TOKEN` if you prefer not to override the map token).

Doppler has no Morpheus project with these secrets; Vercel project `morpheus-web-www` currently stores the **map** token under `BLOB_READ_WRITE_TOKEN`.

### Site env for OG

| Variable                             | Role                                           |
| ------------------------------------ | ---------------------------------------------- |
| `NEXT_PUBLIC_MORPHEUS_GAMEDB_ORIGIN` | Public Blob origin (fallback for preview URLs) |
| `NEXT_PUBLIC_SCENE_PREVIEWS_ORIGIN`  | Optional override; defaults to GameDB origin   |

`/scene/{id}` and `/render/{id}` set:

- **`og:image` / Twitter image** → GIF (`previews/scenes/{id}.gif`, 320×200)
- **`og:video`** (optional) → MP4 for platforms that honor it — **not** a substitute for `og:image`

MP4 is **not** valid as `og:image`. GIF (or static image) is required for unfurl cards.

The public scene index loads the poster lazily. It does not attach either video
source until mouse hover or a 500 ms touch hold. At activation it prefers WebM
when `video.canPlayType('video/webm')` reports support and otherwise selects the
published MP4 fallback for Safari-compatible playback. Releasing either
interaction pauses on the current movie frame.

## Policy notes

- Fresh-start gamestate only (new-player activation)
- Pano = full 360° WebGL spin **one direction** from entry (**1500 − 75 = 1425**). After grab, frames are rotated so the last sample becomes GIF frame 0 (static OG poster) without rewinding yaw mid-capture; specials = timed motion grab of active special/TRN casts
- MCP is not used for batch capture
- Capture route returns 404 when `CAPTURE_MODE` is off and not in development
