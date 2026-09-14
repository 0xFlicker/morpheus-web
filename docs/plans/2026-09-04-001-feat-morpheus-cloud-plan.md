---
title: The Big Morpheus Cloud
status: active
execution: code
---

# The Big Morpheus Cloud

## Outcome

One Morpheus identity and continuous progress across the web and Apple apps. Play starts without an account, saves to the device immediately, and synchronizes in the background. Signing in connects devices. Only genuinely divergent progress asks the player to choose a version. Account and network failures must never prevent local play or erase progress.

The user authorizes logical commits, private repository pushes, Vercel deployment, Neon and private Blob provisioning, and Morpheus/soapbubble.xyz secret management. Work directly in the existing checkouts and preserve unrelated changes. The native checkout's pre-existing edits and the Apple capability/profile impact have pending questions; independent web work can proceed.

## Decisions

- Use the existing Clerk application and existing identical Swift/TypeScript living-save envelope. The API derives authenticated ownership from verified Clerk tokens. Anonymous installations receive an opaque server-issued bearer credential, stored securely and hashed on the server. Never accept an owner ID from a request body.
- Keep three existing slots. Synchronize slot snapshots using server revisions and durable client acknowledgments, with idempotent writes. A stale device may download when it has no new progress; competing changes are preserved until explicitly resolved. Deletion is a revisioned change. Never select a winner using wall-clock timestamps.
- A local checkpoint completes before networking starts. Retry on reconnect, foreground, and subsequent checkpoints; serialise requests and discard responses from an obsolete identity. Cloud application must compare the local revision before replacing local data.
- Neon stores player/session records, save JSON, discovery, achievements, and report metadata. A separate private Blob store holds optional report attachments. Development/preview must not write to production player storage. Existing map and media bindings remain intact.
- API inputs are bounded and structurally validated. Authored state bounds and scene existence are checked on the server. This proves well-formedness, not a legal playthrough. Imports and unverified checkpoints never acquire a verified achievement or competitive ranking merely by supplying a percentage or flag.
- Discovery is based on a versioned, documented authored-content catalog, with ship, dream-world, and ending sections. Count stable discoverable locations, not animation frames or arbitrary numeric IDs. Server calculates percentages and achievements. Endgame comparisons state the cohort and omit misleading results when it is too small.
- Collect only first-party service data needed for save continuity, session diagnostics, requested reports, and the disclosed discovery experience. No advertising identifiers, sale, third-party advertising, fingerprinting, or raw IP retention. The privacy work must distinguish what the implementation does from any legal exemption; wording cannot turn optional tracking into necessary storage.
- Keep `/admin` and every admin data/attachment API behind the configured Clerk admin ID plus the existing verified-email check. Initial achievements remain admin-side; Game Center is evaluated against account/entitlement requirements before adoption.

## Implementation units

### U1: Cloud service and persistence

Goal: provide owned, bounded, transactional APIs for anonymous/authenticated players, saves, session diagnostics, reports, and admin reads.

Files: new `packages/www/src/lib/cloud/` protocol, server and tests; new `packages/www/src/app/api/` routes; SQL and operational scripts; dependency and environment examples. Existing `adminAccess.ts` is the authorization pattern. Existing `livingSaveSchema.ts` is the envelope validator.

Approach: specify the wire contract first, provision isolated Neon and Blob storage, implement revision comparison and idempotency under a transaction, and expose a narrowly scoped anonymous-to-account association. Store report uploads privately with bounded size/type and retention. Apply rate limits in shared persistence, including anonymous issuance and uploads.

Tests: foreign-account access, forged/expired credentials, malformed/oversized input, stale revision, identical retries, delete versus offline update, database failure, concurrent writes against real Postgres, private attachment denial.

Verification: focused tests and typecheck plus real local API/Postgres calls; deployment HTTP probes are separate evidence.

### U2: Discovery and achievement rules

Goal: create a meaningful catalog and deterministic calculations for overall/section discovery and initial admin achievements.

Files: new `packages/www/src/lib/discovery/`, tests, and `docs/implementation/morpheus-discovery.md`. Ownership excludes cloud service, existing UI and native files.

Approach: inspect authored map/catalog/original source, explicitly define countable locations and section membership, derive percentages without accepting client totals, document integrity limits and Game Center suitability. Export small pure functions for cloud and UI consumers.

Tests: unknown scenes, duplicate visits, section boundaries, non-discoverable transitions, completion and empty/small comparison cohorts, imported/unverified evidence.

Verification: tests over representative authored data and catalog completeness/integrity checks.

### U3: Web save continuity and player interface

Goal: silently reconcile existing IndexedDB saves with the cloud, expose voluntary sign-in and real-conflict choices, and show discreet discovery and final comparison.

Files: existing living-save storage/coordinators, runtime provider, menu and game shell; new cloud client; browser tests. Depends on U1 contract and U2 exports.

Approach: durable per-identity slot acknowledgments/outbox; coalesce checkpoints; preserve exports/imports and deletion/Undo; background errors remain non-modal. Flush/apply only at valid checkpoint boundaries. Account changes cannot leak the previous account's data.

Tests: anonymous start, sign-in with existing progress, empty second device, offline divergent devices, retry after lost response, multiple tabs, sign-out/account switch during in-flight request, restart with pending local data, delete/Undo and conflict resolution race.

Verification: browser flow against local API plus existing save regression tests; real Clerk identity parity verified separately.

### U4: Apple sign-in and native continuity

Goal: use Clerk Swift for Sign in with Apple, sync the same saves, upload requested bug reports, and display the same discovery experience.

Files: Apple checkout application/Xcode configuration, new auth/cloud modules, living-save store and player hooks, Bug Snapshot panel, corresponding Swift tests. No worktrees. Wait for the pending dirty-checkout decision before native edits; preserve its asset-cache changes.

Approach: official Clerk SDK owns login and token refresh; Keychain holds anonymous credential. MainActor-facing orchestration and durable local acknowledgments use the U1 protocol. Configure native registration, entitlement, Apple Services ID/key and production Clerk only within granted authority, honoring the pending profile-impact question.

Tests: decode fixtures shared with web, offline/retry/conflict/account-switch parity, report error/retry, build macOS and iOS. Real device Apple sign-in and web/native same-user/save access are distinct release evidence.

### U5: Privacy and license disclosure

Goal: provide concise, accurate web and native disclosures for actual functional data processing, private reports, accounts, retention, deletion and game licensing.

Files: new `docs/implementation/morpheus-cloud-privacy.md` with researched requirements and proposed reusable copy. Ownership excludes application components and native files until root integration.

Approach: use current official legal/Apple documentation, avoid claiming blanket exemption for analytics, identify exact implementation obligations including account deletion and Apple privacy metadata. Prefer quiet persistent links and contextual report disclosure over banners where the actual storage basis permits it.

Verification: implementation-to-disclosure audit; source research is not a claim of legal certification. Root implements routes, links and native disclosures after requirements review.

### U6: Admin and release verification

Goal: an admin-only session/report/achievement browser and a working deployment with evidence for web/native continuity.

Files: existing `/admin` UI and access tests, private attachment routes, release/runbook docs. Depends on U1–U5.

Tests: signed-out/ordinary-user/admin authorization on every read; escaped report rendering; bounded pagination; no secret or private attachment in public output; production and preview separation.

Verification: focused and broader relevant tests, builds, review, browser/API proof, actual cloud persistence checks, logical commits and pushes. Track unfinished portal/hardware checks explicitly rather than implying tests prove them.

## Execution tracking

Progress and exact verification results live in `docs/implementation/morpheus-cloud-progress.md` and commits. This plan records decisions; do not turn it into a running transcript.
