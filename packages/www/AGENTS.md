## `packages/www` (morpheus-next) — Agent Notes

Next.js (App Router) frontend for Morpheus. This package also contains the local WebSocket broker + MCP server used for agent-controlled testing.

### Commands (from repo root)

- **Dev (custom server + WS broker for MCP)**: `yarn workspace morpheus-next dev`
- **Dev (plain Next dev server)**: `yarn workspace morpheus-next dev:next`
- **Build**: `yarn workspace morpheus-next build`

Notes:
- Node is expected to be **>= 24** (see repo root `AGENTS.md`).
- The MCP/WebSocket broker is **local-dev only** (production deploys won’t have the WS broker).
- Public GameDB media uses `NEXT_PUBLIC_MORPHEUS_GAMEDB_ORIGIN`; copied UI
  images remain under `MORPHEUS_ASSET_BASE` / `/morpheus-assets`. Do not merge
  those two asset seams.
- The authored map is restored by the engine preflight from a private Blob
  build input when absent locally. The token must remain build-only; release
  setup and verification live in `docs/release/morpheus-vercel.md`.

### Public route contract

- `/` is the public Soap Bubble Productions / Morpheus homepage.
- `/morpheus` owns the persistent, full-game runtime. Authored scene changes do not change its URL.
- `/scene/[sceneId]` owns an isolated explorer runtime. Authored scene changes replace the current browser address without remounting that runtime.
- `/render/[scene]` and `/capture/scene/[sceneId]` remain root-level local preview tools with isolated, non-persistent runtimes.
- The local WebSocket/MCP broker remains at `/api/game-control`; route work must not move or re-scope it.
- Leave `NEXT_PUBLIC_MORPHEUS_GAMEDB_ORIGIN` and `/morpheus-assets` unchanged.

### WebSocket game-control broker (local dev)

- Implemented in `packages/www/server.ts`
- WebSocket endpoint: `ws://localhost:3000/api/game-control`
- Clients identify themselves via query params:
  - **Browser**: `?client=browser`
  - **MCP**: `?client=mcp&session=<id>`

The browser typically chooses the session name via the scene URL query param:
- `/scene/1050?mcp=mySessionName`

Hotspot click control is browser-authoritative:
- `morpheus_click_hotspot` sends an exact hotspot selector to the connected browser and waits for a browser-reported result.
- Static map data is only candidate discovery; active scene identity and gamestate eligibility are decided by the browser.
- `morpheus_rotate_to_hotspot` is a viewing helper, not evidence that a click occurred.
- Direct `morpheus_load_scene` remains available for explicit scene loads, but hotspot click helpers should not use it as a shortcut.

Living-save diagnostics are read-only and bounded:

- `morpheus_get_current_state` includes the active slot, catalog revision, three fixed slot summaries, resume-point identity, save health, and bounded failure/unloadable reasons.
- It must not expose complete gamestate maps, save envelopes, imported/exported file bytes, or add save-management tools.
- Slot selection, load, delete, Undo, import, and export remain browser-UI behaviors so MCP acceptance checks exercise the same player path.

### App Router entry points

- **Root layout**: `src/app/layout.tsx` is public-site chrome only; it does not own a game store.
- **Full game**: `src/app/morpheus/client.tsx` owns one persistent `RuntimeProvider` across title, intro, and stage phases.
- **Scene explorer**: `src/app/scene/[sceneId]/client.tsx` owns one fresh explorer `RuntimeProvider` per direct entry.
- **Shared runtime shell**: `src/morpheus-app/components/GameStageShell.tsx` renders `InteractiveStage` and handles authored transitions without owning route navigation.
- **Preview tools**: render and capture routes own ephemeral tooling `RuntimeProvider` instances.

### Rendering readiness

- `GameStageShell.tsx` owns the transition cover and commits pending scenes after `onSceneReady` (with a five-second escape hatch).
- Asset/media readiness is insufficient: panorama readiness requires the active WebGL texture to be committed; movie readiness requires two fresh compositor frames for the exact presentation token.
- Keep `preserveDrawingBuffer: true` for reliable pano capture. Cancel stale video-frame waits on replacement, ref detach, and unmount.
- Preserve authored movie/panorama behavior and browser-check affected boundaries; scene `1010 → 101004` is the regression path for pano-to-movie seams.

### State management

There are two “stores” in this package:

#### 1) Preferred: Redux Toolkit store for the App Router (`src/morpheus-app/store/`)

- **Store**: `src/morpheus-app/store/store.ts`
- **Typed hooks**: `src/morpheus-app/store/hooks.ts`
- **Provider wiring**: `src/morpheus-app/runtime/RuntimeProvider.tsx` → owned by each game, explorer, or tooling route

Current slices:
- **Scene**: `src/morpheus-app/store/slices/sceneSlice.ts`
  - `byId`: scene cache
  - `stack`: small LRU-ish stage stack (active + background scenes)
  - `activeSceneId`
  - `loadScene`: async thunk to fetch a scene when missing
  - selectors: `selectSceneById`, `selectStageScenes`, `selectActiveSceneId`
- **Rotation**: `src/morpheus-app/store/slices/rotationSlice.ts`
  - `current`: `{ yaw3600, pitch }`
  - `seededFromTransition`: one-shot seed flag for scene transitions
  - selectors: `selectRotation`, `selectRotationSeeded`

How to use in components:
- Prefer `useAppDispatch()` and `useAppSelector(...)` from `src/morpheus-app/store/hooks.ts`
- Keep selectors **pure** and co-locate them with the slice when possible
- For derived data, prefer `createSelector` (already used in `sceneSlice.ts`)

Where it’s used today:
- `src/morpheus-app/components/GameStageShell.tsx` drives transitions + rotation via slice actions/selectors.
- `src/morpheus-app/systems/useSceneSystem.ts` is a hook-style integration point that initializes/prefetches scenes and exposes `stageScenes`.

Adding a new slice (pattern):
- Create `src/morpheus-app/store/slices/<thing>Slice.ts`
- Export slice reducer + actions + selectors
- Add the reducer to `configureStore({ reducer: { ... } })` in `src/morpheus-app/store/store.ts`
- Use typed hooks throughout UI code (no untyped `useDispatch`/`useSelector`)

#### 2) Legacy: older Redux store (`src/store/`)

`src/store/index.ts` is a pre-RTK store with `redux-observable` + `redux-thunk` and some legacy typing. Treat it as **legacy** unless you are explicitly working on old codepaths (e.g. `src/morpheus-app/app.tsx` / `src/app.jsx`).

If you’re implementing new App Router behavior/state, prefer extending the **Redux Toolkit** store in `src/morpheus-app/store/` instead of adding more surface area to `src/store/`.

### TypeScript/React conventions (this package)

- Use **functional React** with explicit `react` imports (hooks/types).
- Keep types strict: avoid `as any` / unsafe casts.
- If a value is `unknown`, narrow it with safe runtime checks before using it.
