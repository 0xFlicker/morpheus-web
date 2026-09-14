# Morpheus discovery and achievement rules

Catalog version **2** measures **518 reviewed content units**: panorama/location families, distinct 2D views, closeups, documents, puzzle screens, and selected full-screen authored movies. It measures recorded content seen during one journey, not time played, puzzle correctness, every animation frame, or progress toward winning. Reaching the ending remains separate from discovering everything.

## Authored evidence and counting choices

The approved audit is [discovery-2d-audit/README.md](discovery-2d-audit/README.md); [proposed-units.md](discovery-2d-audit/proposed-units.md) lists every reviewed unit, and the scene inventory accounts for all 1,844 authored records including scene 0. The authored map SHA-256 is `8504cc0dc7f18afe3f77c1b13c553a3bd040993158aef92fe4f848dfb54cc094`. Actual original-media dimensions, authored placement, frame range, asset identity, linked interactions, and explicit user review ground membership and grouping. Converter output dimensions are not reliable inclusion evidence.

| Section | Panorama/location families | Added 2D content | Total |
| --- | ---: | ---: | ---: |
| Ship | 142 | 192 | 334 |
| Island dream | 7 | 15 | 22 |
| Palace dream | 23 | 9 | 32 |
| Waterfront dream | 33 | 56 | 89 |
| Carnival dream | 10 | 24 | 34 |
| Ending | 3 | 4 | 7 |
| **Overall** | **218** | **300** | **518** |

Independent views remain distinct even in the same room. Explicit approved families count once: each container, book/diary/map item, Carnival exhibit, the bird cage, the Island platform network, each of nine grave bases, and the five gondola route areas. Billy's portrait is included. Monkey placements, missed flares, unopened cargo variants, lightning configurations, feather stages, and gondola control combinations add no requirements. The frozen explorer and expedition journal remain separate content. Intro, titles, ordinary menus, credits, transitions, and incidental animation frames add no units.

Scene `710050` conditionally presents one of three shack interiors. Its raw scene ID earns no unit: the actually visible `shack1STL`, `shack2STL`, or `shack3STL` selects the corresponding unit. No game-state inference awards all three. All recording requires the relevant catalog asset to be among the actually presented scene's assets.

Narrative credits `895051–895058`, `895065`, and `895066` establish observed story completion independently of the denominator. The preceding ending movie `895050` is discoverable content but entering it alone does not establish completion. Menu credits `100200–100207` never complete the story. These are accounting rules; they do not change authored transitions, scripts, or hotspot eligibility.

## Evidence, persistence, and display

`CloudSave.runId` identifies one journey. `discoveredSceneIds` preserves historical raw observations. `observedDiscoveryIds` stores canonical content identities from new visible presentations, including conditional content. Calculators union both forms by unit identity and ignore repeat visits. Missing optional content evidence is empty; it never reconstructs historical visits from a save's current scene or game-state values. New games start empty. Local saves, cloud writes, retries, downloads, conflict choices, and resume carry the chosen journey's evidence. Discarded conflict branches are not merged into the retained journey.

Checkpointing, importing, prefetching, and asset downloading do not award visits. Recording is tied to actual renderer presentation, with current scene/journey identity, a visible foreground game, and no covering menu or modal. Web transition covers must finish before observation. Tooling/explorer runtimes cannot record game discovery. Resume can record the currently shown scene once it is actually visible; it cannot invent earlier visits. A stopped, replaced, or stale presentation cannot award evidence to another journey.

Version 1 measured 227 units. Version 2 consolidates some panorama variants and removes the credits milestone, then adds 300 2D units. Existing raw visits are retained and reinterpreted against the new catalog; old percentages usually decrease as the denominator grows. Previously stored 2D IDs can contribute where membership is unambiguous, but old checkpoint-based evidence cannot retroactively prove the content was visible. There is no automatic historical backfill. Both old and new evidence remain unverified client observations.

Percentages truncate to one decimal so incomplete discovery never displays 100%. The optional in-game display remains in the existing **left side black bar**, hidden when the gutter cannot fit it. No game resizing or space below the game is added. Overall and current-section percentages remain available in the menu. Sections follow authored content membership, not numeric scene-ID guesses; the last known section can remain displayed through uncounted transitions.

The canonical source is `packages/www/src/lib/discovery/catalog.json`. The Swift catalog is generated from it with `scripts/discovery/generate-swift.mjs`; `--check` detects drift. Web `calculateDiscovery(rawIds, observedIds)` and Swift `MorpheusDiscovery.count` compute equivalent results. `resolveDiscoveryObservation` / `observedIDs` resolve an actual scene presentation and its visible asset paths. Catalog changes require authored review and a version increment, not silently changing the denominator or grouping by shared filename alone.

## Initial admin achievements

The rule set observes first discovery, entering each of the four dreams, entering all four dreams, discovering every location in each section, reaching the ending, and discovering every location overall. It intentionally excludes guessed puzzle-solved flags: a bounded state value is not proof that the puzzle was solved. Achievement observations are recomputed from visits and have stable IDs within the catalog version. Store a server timestamp on first observation if admin history needs timing; the pure calculator does not take client-earned timestamps.

Imported saves can show admin matches labeled `source: 'imported'`. They cannot acquire verified achievements through this module. A claimed `source: 'played'` also returns `verified: false`, including a fabricated complete visit list. No code path here awards a public badge, Game Center achievement, or verified ranking.

## Endgame comparison

The descriptive comparison uses each **other player's best currently saved completed playthrough**, interpreted with the current authored catalog, with at least **one other server-owned player identity**, displaying the sample size. It excludes the current player's records, imports, incomplete runs, and expired guests. Multiple slots or linked guest/account records cannot multiply that player's weight. Anonymous identities can still represent multiple installations of the same human.

The result contains only the other-player count, the player's discovery percentage, the cohort mean, a cohort label, and `verified: false`. It returns no percentile, rank, individual identity, or leaderboard. Suggested text: “You discovered 72.2% of locations. Other players’ best recorded completed games average 64.8%.” This describes recorded data; it does not assert cheating was ruled out. Omit the comparison when unavailable. Never call this “all players” when only completed recorded games are included.

The `played` label is client-reported. Excluding known imports reduces obvious noise but does not make this cohort resistant to manufactured players or fabricated visits. Do not use the aggregate for rewards, scarce benefits, or competitive placement.

## Save integrity and a legal move from blank state

The current save envelope plus visit list is a snapshot. Authentication establishes who submitted it; validation establishes that it is structurally compatible with the authored data. Neither establishes that the player reached it through legal actions. A checksum, client signature with an embedded secret, compressed/encrypted save file, or monotonic-looking percentage cannot provide that guarantee.

Useful immediate checks belong in the cloud service: bound payloads and list lengths, validate complete state keys and authored allowed values, reject unknown active/return scenes, serialize revision checks, and rate-limit writes. Preserve authored initial values that deliberately sit outside min/max; rejecting the game's own blank state is not anti-cheat. Derive discovery from the catalog; never persist a client-provided total, percentage, earned badge, or verification boolean as authority. Keep imports and observations explicitly unverified.

Actual legal-history verification would require replaying an ordered action log from the versioned authored initial state with the same shared eligibility, comparator, script, controlled-movie callback, and transition rules used by the runtime. The server would need to validate the exact action against its prior state and compare the resulting state, rather than merely checking adjacent scene IDs. For offline play, retain the sequence and verify it on reconnect; reject invalid competitive evidence without deleting the player's local save. State bounds and a scene adjacency graph cannot prove this: puzzle scripts, return destinations, and state-gated callbacks matter. This implementation does not claim that replay verifier exists.

## Game Center suitability

Game Center is a reasonable later destination for proven achievement definitions, but its player identity is separate from Clerk/Sign in with Apple. Apple requires enabling and configuring Game Center and initializing the local GameKit player before using GameKit services. That is additional product/account/capability work, not automatic save synchronization. See [Initializing and configuring Game Center](https://developer.apple.com/documentation/gamekit/initializing-and-configuring-game-center) and [Authenticating a player](https://developer.apple.com/documentation/gamekit/authenticating-a-player), checked September 4, 2026.

GameKit reports achievement progress against configured achievement IDs; completing an achievement makes it visible as earned. These unverified admin observations should not be forwarded to GameKit. See [Rewarding players with achievements](https://developer.apple.com/documentation/gamekit/rewarding-players-with-achievements). Keep Game Center authentication optional and independent of anonymous play and cloud save continuity if integrated later.

## Verification and catalog updates

From the web repository root, after selecting Node with `nvm use`:

```sh
yarn workspace morpheus-next test run src/lib/discovery/discovery.test.ts
```

Tests cover authored inventory membership, aliases, approved grouping, conditional visible assets, section boundaries, repeats, retained historical evidence, narrative completion, and unverified achievements. `scripts/discovery/check-swift-parity.mjs` compiles and exercises the actual Swift calculator against all catalog units. Server summary tests cover response gating; `scripts/cloud/verify-api.mjs` exercises actual Postgres cohort exclusion, linked-identity deduplication, and the nonempty-cohort threshold. The catalog test pins the map digest so authored changes require reviewing membership and explicitly revising the discovery catalog/version where counting semantics change. It must not be fixed by blindly updating only the digest.

These tests prove deterministic accounting over authored data. They do not prove browser/native visit capture, real cloud persistence, hardware playback, end-to-end game reachability, or a legal playthrough. Those are separate integration/release checks owned by the cloud and client implementation units.
