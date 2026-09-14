# Morpheus Vercel Release Runbook

This runbook deploys the Next.js player without committing converted `GameDB`
media or the authored `morpheus.map.json`. It deliberately uses stable public
media paths; it is not a content-release or pointer system.

## Project configuration

Configure the `morpheus-web-www` Vercel project as follows:

| Setting         | Value                               |
| --------------- | ----------------------------------- |
| Root Directory  | `packages/www`                      |
| Framework       | Next.js                             |
| Node.js         | `24.x`                              |
| Install command | Vercel default Yarn Classic install |
| Build command   | `yarn vercel-build`                 |
| Build output    | `.next`                             |

`packages/www/vercel.json` and its `vercel-build` script are the
source-controlled part of this configuration. That package script returns to
the workspace root to run the engine first: it restores or validates the map
and produces the engine UI images before Next evaluates
`packages/www/next.config.js`.

## Blob stores and variables

Create two stores with named owners recorded in the project settings:

| Purpose                               | Access               | Vercel variable                                        | Value                                                                                                         |
| ------------------------------------- | -------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| Game media                            | public               | `NEXT_PUBLIC_MORPHEUS_GAMEDB_ORIGIN`                   | Parent URL of `GameDB` (and scene `previews/…`), for example `https://<store>.public.blob.vercel-storage.com` |
| Scene OG previews (optional override) | public               | `NEXT_PUBLIC_SCENE_PREVIEWS_ORIGIN`                    | Defaults to GameDB origin; set only if previews live on a different public store                              |
| Authored map                          | private              | `MORPHEUS_MAP_BLOB_URL`                                | Full private Blob URL for `morpheus.map.json`                                                                 |
| Authored map read/write token         | build-only           | `BLOB_READ_WRITE_TOKEN`                                | Token scoped to the **private map store** (not the public GameDB store)                                       |
| Public media upload token             | operator workstation | (export as `BLOB_READ_WRITE_TOKEN` for upload scripts) | Read-write token for the **public** store — used by `upload:gamedb` and `upload:previews`                     |

Set the public origin for Preview and Production. Set the private-map URL and
token only for trusted Preview and Production deployment refs. Never use a
`NEXT_PUBLIC_` variable for the map URL/token, and do not inject the token into
untrusted forks or arbitrary external PR deployments. Rotate it when Vercel
project access or the deployment trust boundary changes.

The map is protected as a repository/build input, not as client secrecy: the
browser bundle currently imports scene data.

## Clerk authentication

The `/admin` route requires a matched Clerk key pair from the same instance:

| Purpose                | Access      | Vercel variable                     |
| ---------------------- | ----------- | ----------------------------------- |
| Clerk browser SDK      | public      | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` |
| Clerk server and proxy | server-only | `CLERK_SECRET_KEY`                  |
| Admin owner prefilter  | server-only | `CLERK_ADMIN_USER_ID`               |

Use development keys only in ignored local `.env.local` files. Provision
Preview and Production with their corresponding Clerk instances before
deploying; never expose `CLERK_SECRET_KEY` through a `NEXT_PUBLIC_` variable.
The production instance must contain `me@0xflick.xyz` as a verified primary
email before the admin route is considered usable. Set `CLERK_ADMIN_USER_ID` to
that account's immutable Clerk user ID. Local development can omit the user ID
while the first account is created; Preview and Production fail closed without
it so rejected accounts cannot consume a Clerk user-profile lookup.

## Import the media once

From a workstation with the converted source available, run the importer with
the public-store token in the process environment. It resolves the local
`packages/www/public/GameDB` symlink target, skips nested symlinks, preserves
each `GameDB/...` pathname, and reports inventory and ETags.

```bash
BLOB_READ_WRITE_TOKEN=... yarn workspace morpheus-next upload:gamedb -- --report gamedb-import.json
```

Keep the importer report and the source corpus location with the release
record. Upload only rights-cleared converted archive media.

## Native macOS download

Publish notarized macOS exports in the public media store under immutable keys
of the form `downloads/Morpheus-<version>-<build>-macOS.zip`. Do not overwrite a
published build. Package the exported `.app` with `ditto -c -k
--sequesterRsrc --keepParent`, extract the resulting ZIP into a temporary
directory, and run `codesign --verify --deep --strict --verbose=4` against both
the source and extracted app outside restricted execution sandboxes. Upload
with the public media store token and serve the Blob `downloadUrl` so browsers
receive an attachment response.

Current public release:

| Field         | Value                                                              |
| ------------- | ------------------------------------------------------------------ |
| App version   | `1.0 (5)`                                                          |
| Compatibility | Universal `arm64` + `x86_64`; macOS 14 or later                    |
| Blob key      | `downloads/Morpheus-1.0-5-macOS.zip`                               |
| SHA-256       | `009a4caecc77fbae011c12d6381881b2839e24ef304d105d15ad84758dd984ab` |
| Size          | `11,399,098` bytes                                                 |

For a stable-path correction, retain the prior source, record the current
ETag, and run the importer in its explicit update mode. Before it writes,
update mode checks every current Blob ETag against that prior report and
refuses the entire update if any object changed. Record the new ETags and wait
through the documented finite cache lifetime before declaring success. This is
a stale-state guard, not an atomic conditional overwrite: Vercel Blob documents
overwrite support, but does not document a conditional PUT by ETag. If another
operator can write concurrently, pause the update or serialize ownership.

## Preview and promotion gate

1. Create the private map object and variables before triggering the build.
   A missing map must fail early with a credential-safe error.
2. Confirm the preview build invokes the engine preflight before Next and
   contains no local `GameDB` corpus.
3. Request a PNG, MP4/WebM, and AAC/MP3/Ogg object directly from the public
   Blob origin. Verify content types, `ETag`, `Accept-Ranges`, and a video
   byte-range `206` response.
4. In a desktop preview, replay title intro, deep-link to a known scene, rotate
   the panorama, play a panorama animation/audio/controlled movie, and perform
   an authored scene transition. Inspect console/network: no Blob CORS failure
   and no `/api/game-control` WebSocket attempt.
5. On a physical Safari/iOS device, replay a panorama animation from the direct
   public origin. A failure blocks promotion; do not add a proxy as a shortcut.
6. Only then promote and repeat the network/media checks on the final hostname.
   Create/resume a save and switch slots there; IndexedDB saves do not migrate
   between localhost, preview, and production origins.
7. In a fresh browser, open `/admin` and confirm Clerk renders for a signed-out
   visitor. Verify that another signed-in account sees the rejection state and
   that the verified `me@0xflick.xyz` account alone reaches the empty bug-report
   shell. Missing or mismatched Clerk keys block promotion.

Record preview/production URL, commit, Blob origin, map object identifier/ETag,
test scene IDs, browser/device, timestamp, and evidence capture.

## Rollback and operations

- **Code:** roll back by promoting the prior good Vercel deployment.
- **Media:** re-upload the retained known-good object at the same pathname,
  record old/new ETags, wait for the cache policy, and replay the affected
  scene in a fresh browser context.
- **Map:** restore the prior private object, update its URL only through the
  trusted build variable, and deploy a new build; map changes require normal
  code-review/change control.
- **Spend:** set a paid-plan spend notification before public launch. Review
  Blob transfer, edge requests, and cache-miss/origin usage after launch.

## HD playback assets

The optional HD setting selects the admitted RIFE x2 playback catalog under
`HD/rife-x2-v1/GameDB/` in the existing public GameDB store. Original paths,
map data, UI images, audio, stills, and controlled-state atlases remain intact.
The native checkout's `docs/hd-assets/report.md`, `coverage.csv`, and
`rife-x2-v1-audit.json` document admission and gaps. Keep the native
`HDAssetCatalog.swift` and engine `client/js/service/hd-assets.ts` catalogs in sync.

The upload script verifies hashes, refuses overwrites, verifies the public store
before writing, and records size/ETag/SHA-256 receipts. Rerunning with the same
receipt file verifies existing ETags before resuming. From `packages/www`, with
Node 24 selected and the existing operator environment loaded:

```sh
node --env-file=../../.env.local scripts/upload-hd-assets.mjs \
  /path/to/extracted-archive /path/to/rife-x2-v1-audit.json /path/to/receipts.json
```

It uses `MORPHEUS_GAMEDB_BLOB_TOKEN`, never the private map token. Keep credentials
out of reports and public environment variables. Local `dev:next` must receive
`NEXT_PUBLIC_MORPHEUS_GAMEDB_ORIGIN` to use uploaded HD media; a local original-only
`public/GameDB` symlink does not provide `public/HD`.

The setting is off by default, persists per browser, and is applied when media
elements are loaded or recreated. Media element identity includes the resolved tier URL so reused casts
select the new source. Panorama animation drawing samples the complete decoded
frame into unchanged authored bounds.

The spatial image catalog is `morpheus/docs/hd-assets/spatial-x2-v1-catalog.json`
in the adjacent Apple checkout. Pass that JSON instead of the RIFE audit to the
same uploader; it selects the `HD/spatial-x2-v1/` prefix and verifies each PNG.
There are 669 mapped PNGs (260 panoramas, 93 controlled atlases, 316 stills).
The remaining archive's spatial-only videos are not part of this image import.

Regenerate both image lookup tables with the Apple checkout's
`scripts/generate-hd-spatial-catalog.py /absolute/path/to/web`. Its input catalog
includes validated frame-zero aliases and explicit controlled-atlas layouts;
do not infer those layouts from authored cast size. The common HD setting
selects both rails. React media URL selection uses a hydration-safe preference
snapshot so a server-rendered original URL cannot remain stuck after page load.
