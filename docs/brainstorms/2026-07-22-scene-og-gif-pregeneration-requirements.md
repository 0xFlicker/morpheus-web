---
date: 2026-07-22
topic: scene-og-gif-pregeneration
status: active
type: requirements
source: ideation + ce-brainstorm
---

# Scene OG GIF pre-generation

## Summary

Pre-generate motion previews for every scene in `morpheus.map.json` via an offline WebGL capture path, then publish length-capped animated GIFs for Open Graph / share meta (`og:image`). Local batch runs keep full renders; public OG output is size- and duration-capped. Capture is a self-driving app mode (not MCP). Panoramas use the real cylindrical WebGL view with a full 360° loop. Non-pano specials use motion from their active special / TRN movie casts under fresh-start game state.

## Problem Frame

Scene share links and social cards need a faithful, animated preview of each room. Live WebGL at request time is out of scope for hosting and cost. Packed PAN textures are not a safe ffmpeg-only path without a correct remapper. The product needs offline, batch, engine-faithful motion assets and a first consumer: OG GIF URLs.

## Goals

- Every scene in the map has a pre-generated motion artifact suitable for OG.
- Previews match what a new player would see (fresh-start activation), not a bare single cast and not force-all layers.
- Operators can regenerate locally with full fidelity and derive smaller OG GIFs without re-capturing when only encode policy changes (when intermediates exist).
- Automation does not depend on the MCP game-control broker.

## Non-Goals

- Just-in-time cloud WebGL renders for arbitrary visitors.
- ffmpeg cylindrical/equirect remapping of packed `*PAN.png` as the pano source of truth.
- MCP-driven rotate/load as the batch pipeline spine.
- Graph “edge” GIFs keyed by (fromScene, toScene) or hotspot path previews.
- First-ship scene picker gallery, live scene chrome loaders, or non-OG UI embeds (later consumers of the same catalog).
- Combinatorial gamestate facades or mid-playthrough saves as render policies.

## Requirements

### Corpus and classification

- R1. The pipeline enumerates every scene in `packages/morpheus/client/js/service/morpheus.map.json` (or the same map source the app loads) and produces an OG GIF for each scene id.
- R2. A scene is treated as a **panorama** when it has an active pano cast under fresh-start state (cast-shape truth), not only by `sceneType` label.
- R3. All other scenes use the **2D special / movie** capture path (including scenes whose motion comes from special or TRN movie casts).

### Presentation policy

- R4. Renders use **fresh-start / new-player game state** (engine default entry state). Only casts that activate under that state appear.
- R5. The capture must composite the full **active visual stack**, not only the hero PanoCast or primary MovieSpecialCast. Inactive gated casts stay off.
- R6. **TRN transition movie casts** that are active under fresh-start state are included in the render like any other active movie/special cast. This is cast inclusion, not scene-graph edge products.

### Pano motion

- R7. Panorama scenes produce a **full 360° continuous loop** from the live WebGL cylindrical view (same presentation family as the player).
- R8. Pano generation does not rely on offline remapping of packed PAN GPU textures via ffmpeg as the primary path.

### Special / TRN motion

- R9. Non-pano scenes produce an **animated** preview with real motion from the active special/TRN media under fresh-start state.
- R10. Local/full renders may retain longer motion; **OG GIFs are length-capped** (and size-budgeted) so cards stay practical. Exact caps are encode policy, not per-scene art direction.

### Capture mechanism

- R11. Capture is a **self-driving mode** in the app: a dedicated route or query loads one scene, waits until the stage is actually ready (textures / specials settled, not merely a DOM canvas), runs the motion program, and exports frames and/or a video intermediate.
- R12. Automation only starts the capture URL and collects outputs. It does not own yaw stepping or readiness heuristics via MCP WebSocket commands.
- R13. Stage pixel capture may reuse the existing multi-canvas stage grab pattern used for dissolve covers (`captureStageFrame` in `packages/www/src/app/scene/stage-shell.tsx`), or an equivalent engine-faithful grab.

### Artifacts and OG

- R14. Each scene has at least: a **full local render intermediate** (video and/or frame sequence) and a **length-capped animated GIF** for OG.
- R15. Optional sibling intermediate formats (WebP/MP4) are allowed; GIF is required for `og:image`.
- R16. OG meta for a scene URL resolves to that scene’s pre-generated GIF as `og:image` (public absolute URL).
- R17. The first frame of each OG GIF should be a usable still for crawlers that do not animate GIFs.

### Operability

- R18. Rebuild is **per-scene**: content identity covers map scene definition, fresh-start activation inputs, source media digests for active casts, capture/encode policy version. One scene change does not force a full corpus re-render.
- R19. Content hashes may be stored on or alongside the map (or a map-linked manifest) so staleness is queryable.
- R20. Public OG GIFs are stable, cacheable URLs appropriate for social crawlers (CDN-style public media, not login-gated).

### Success criteria

- R21. Spot-check: a known pano (e.g. scene 1010) OG GIF is a looping full revolution that matches the WebGL room, not a squashed remapped texture.
- R22. Spot-check: a multi-cast special with TRN/special motion under fresh-start state shows motion layers that appear in-game at entry, not a black or single-layer stub.
- R23. Full map batch completes offline without MCP session pairing.
- R24. Changing only GIF encode knobs can regenerate OG GIFs from stored intermediates without re-running WebGL capture (when intermediates are present).

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Primary consumer (v1) | OG / share meta | First surface is social and share cards |
| `og:image` format | Animated GIF | Explicit product choice; accept platform freeze-on-frame-1 |
| Pano generation | Offline headless WebGL | Engine-faithful cylinder; ffmpeg pan path rejected after bad unwrap tests |
| Capture control | Self-driving app mode | App owns ready + spin + export; no MCP batch spine |
| Layer policy | Fresh-start activation | Consistent catalog/OG truth; not force-all |
| TRN handling | Active TRN **casts** in-scene | Not graph edge GIFs |
| Local vs OG | Full local intermediate; capped OG GIF | Operator fidelity without huge public cards |
| Pano motion amount | Full 360° loop | Room survey for the card |
| Corpus | Full map offline | Every sceneId has an OG GIF |

## Scope Boundaries

**In v1**

- Full-map offline generation
- Self-driving WebGL capture mode
- Fresh-start active stack (including TRN movie casts when active)
- Full local intermediates + capped OG GIFs
- Per-scene content-addressed rebuild
- Wire scene routes’ OG meta to the GIF

**Deferred**

- Scene picker / gallery UI using the same catalog
- Live scene loading chrome using previews
- MCP retirement (orthogonal; batch must not depend on it)
- Fancy multi-format progressive OG (video cards) beyond GIF requirement

**Outside**

- Request-time cloud WebGL for OG
- Edge/path GIFs as graph products
- Mid-game save-based preview variants

## Key Flows

- F1. Offline batch
  - **Trigger:** Operator or CI runs the batch job.
  - **Steps:** Load map inventory → for each dirty sceneId open capture mode → wait ready → export full intermediate → encode capped OG GIF → write catalog/hashes → publish public GIF URLs.
  - **Outcome:** Full corpus current for OG.

- F2. Share card
  - **Trigger:** Crawler or chat unfurl hits a scene URL.
  - **Steps:** Page meta includes `og:image` pointing at pre-generated GIF.
  - **Outcome:** Share preview shows motion (or a good first frame).

- F3. Incremental rebuild
  - **Trigger:** Map or media change for a subset of scenes.
  - **Steps:** Hash diff → re-capture only dirty scenes (or re-encode only if policy/media intermediates allow).
  - **Outcome:** No full-map tax for one-room fixes.

## Acceptance Examples

- A1. Pano OG
  - **Given:** Scene 1010 has a pano cast active at fresh start.
  - **When:** Batch runs and OG meta is inspected.
  - **Then:** `og:image` is an animated GIF of a full 360° WebGL loop of that balcony, not a packed-texture distortion.

- A2. Special with TRN cast
  - **Given:** A special scene whose fresh-start active casts include a TRN or special movie.
  - **When:** Batch runs.
  - **Then:** Local full render and OG GIF both show that motion; gated-off casts do not appear.

- A3. No MCP
  - **Given:** MCP WebSocket is disconnected.
  - **When:** Batch runs.
  - **Then:** Capture still completes via direct URL load.

## Dependencies / Assumptions

- Dev/batch environment can run the Next app with WebGL (headless Chromium or equivalent) and GameDB media available.
- Map enumeration and scene fetch already exist for the player (`map-query` / scene service).
- Social platforms may not animate GIFs; first frame quality still matters.
- “Fresh-start state” means the same default entry gamestate the engine uses for a new play session (`fetchInitial` / equivalent), not an empty object that breaks cast rules.

## Outstanding Questions

- OQ1. Exact OG caps (max seconds, max width, target max KB) — planning default OK if documented.
- OQ2. Public path layout for GIFs (e.g. under GameDB-adjacent CDN vs `previews/`) — packaging choice for plan.
- OQ3. Whether capture mode is query on `/scene/:id` vs dedicated `/capture/...` route — mechanism only; both satisfy R11.

## Deferred to Planning

- Capture URL contract, ready signal, and export wire format (frames zip vs MediaRecorder).
- Encode recipe versions and intermediate storage layout.
- CI vs local-only batch entrypoints.
- How OG tags are injected on the scene App Router pages.

## References

- Ideation session (2026-07-22): offline scene GIF pre-generation; WebGL vs invalid ffmpeg pan tests; self-driving capture preference.
- `packages/www/src/app/scene/stage-shell.tsx` — existing stage canvas grab for dissolves.
- `packages/www/src/morpheus-app/components/OgMetaCanvas.tsx` — existing still OG path to replace/extend with pre-generated GIF URLs.
- `packages/morpheus/client/js/service/morpheus.map.json` — scene corpus.
- `packages/morpheus/client/js/morpheus/render/pano/loader.js` — packed PAN texture layout (not the batch pano source path).
