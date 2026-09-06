# Expanded discovery verification — 2026-09-06

Implemented the approved 518-unit catalog on web and Swift. The audit decision remains in `discovery-2d-audit/README.md`; exact measurement rules and limitations are in `morpheus-discovery.md`.

## Automated checks

- Web: **428 tests passed across 78 files**, TypeScript `tsc --noEmit` passed, production Next.js build passed, changed TypeScript/runtime scripts passed Prettier checks.
- Compiled Swift calculator: all 518 units, every ordinary alias, all conditional shack observations, section totals, repeat evidence, and independent ending detection passed. `node scripts/discovery/generate-swift.mjs --check` also passed.
- Native focused runtime/persistence/coordinator tests: **44 passed**, including no checkpoint/import awards, visibility gating, wrong/stale presentation rejection, tooling exclusion, same-journey resume, and retry after a failed disk write. The retry regression failed before its fix and passed afterward.
- Native full Swift Testing suite: **446 of 448 passed** when run serially. `pngStillAndControlledSpriteRespondToAuthoredState` and `hotspotSweepOwnsTheTransitionUntilDestinationPreparation` fail identically against the earlier macOS debug binary with discovery catalog version 1, using the same unchanged test source. They remain outside this change. The parallel full run also timed out `cancelledHotspotSweepKeepsTheSourceScene`; that test passed serially.
- iOS Release build and macOS build-for-testing passed without signing.
- The ordinary Xcode test launcher stalled after launching its host. `morpheus/scripts/run-built-tests.sh` runs the actual compiled Swift Testing bundle with the built app's fixture resources in a temporary bundle, without launching the player's app or accessing its save container. This is automated native runtime evidence, not native UI or hardware playback evidence.
- Repository `yarn lint` remains blocked: the legacy engine lint script invokes an uninstalled `eslint` executable. No dependency/configuration changes were made to conceal that failure.
- Approved audit regeneration reproduces the 518-unit proposal byte-for-byte from frozen version-1 panorama evidence and original-media observations.

## Real development cloud integration

`packages/www/scripts/cloud/verify-api.mjs` passed against the local API and isolated development Neon/private Blob. It verifies content IDs and journey identity survive upload/download, API ownership and revision handling, and the actual SQL cohort query's expanded counts, identity deduplication and exclusions. It removes the synthetic accounts and report attachments it creates.

The native `scripts/verify-cloud-api.sh` also passed against the same local service using the built native module: discovery IDs persisted to disk, uploaded, downloaded into a second independent repository, and survived runtime resume and conflict handling. This uses disposable anonymous credentials, not Apple identity; it does not prove cross-device Apple login or gameplay legality.

## Verified through browser gameplay

Used an isolated local browser and disposable imported fixture journeys. The imports only prepare starting states; verification then uses normal pointer hotspot interactions, not tooling scene jumps.

1. **Swan cabin panorama → scrapbook cover → opening movie → pages 1 and 2** (`3310 → 331030 → 331029 → 331031 → 331032`). Overall discovery increased from **0.1% to 0.3%** on opening the book; later pages stayed at **0.3%**, Ship **0.5%**. A full browser reload and normal slot resume restored page 2 and the same percentages.
2. **Island panorama → cemetery overview → grave base → overview → same grave base** (`7000 → 700010 → 700011`). Overall discovery progressed **0.1%, 0.3%, 0.5%**; Island discovery progressed **4.5%, 9%, 13.6%**. Revisiting the grave remained **0.5% / 13.6%**. No monkey placement was performed or required.
3. Toggled the optional display through the menu and visually confirmed it remains centered in the existing **left side black bar**. The game retained its authored aspect and existing stage rectangle; no space was added below it. The menu also showed the percentages.

No full ending playthrough, full 518-unit reachability walkthrough, phone playback, or native multi-layer/conditional-shack visual replay was performed. The native image/video presentation callbacks compile and the model gates are tested, but actual native compositing beneath a menu and after uncovering remains a visual follow-up.

## Release sequence

The new cloud evidence field is understood by the updated web and Swift clients. The previous native decoder rejects unknown fields. **Install the updated Swift build before promoting the web change to production**; production has intentionally not been changed by this work. Existing local saves must be retained during normal installation; do not delete the app.

## Post-Deploy Monitoring & Validation

On release day, check `/admin` save summaries and cloud request failures for the first resumed journeys. Healthy behavior is catalog version 2, totals of 518, unchanged run IDs after resume, and successful save/download requests. Watch for `CloudProtocolError.invalidData`, HTTP 400 cloud-save validation errors, repeated revision conflicts, and missing observed evidence after resume. A newly rejected save or discovery reset should stop rollout for investigation; keep each player's local save intact. Recheck the same journeys after a second device reconnects. The release operator owns this initial validation and the following day's error review.
