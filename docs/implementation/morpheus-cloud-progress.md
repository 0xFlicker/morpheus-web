# Morpheus Cloud execution

- Goal created; Apple/Clerk handoff and both checkouts inspected.
- Web branch: `codex/morpheus-cloud`; native `main` has pre-existing cache/session/test edits preserved.
- U1 implemented: separate production/development Neon and private report Blob stores; strict ownership, transactional save revisions, bounded retry receipts, reporting, deletion and daily retention. Development database/API/storage checks pass. Production schema and deployment remain pending.
- U2 committed: authored discovery catalog and observed achievement rules. Server comparisons exclude imports and require 20 other completed players; results remain explicitly unverified.
- U3 implemented: durable local checkpoints/outbox, identity archives, safe resume boundaries, preserved competing tab checkpoints, and quiet camera synchronization. Authenticated continuity and an ordinary gameplay move passed between the in-app browser and Chrome. Offline divergence and production checks remain pending.
- U4 in progress: inspect native sync/auth/report integration in the existing checkout, preserving pre-existing edits. Only the external Apple capability/profile-impact approval remains a prerequisite for its affected provisioning and sign-in verification.
- U5 web implementation ready: False Floor, LLC privacy/license disclosures and public support form. Native disclosures and Apple account-deletion/revocation remain pending.
- U6 implemented: admin-only report, session, save, and observed achievement browsing. Ordinary-user browser denial and authenticated browser report submission pass. Actual admin browsing and production verification remain pending.

## Current verification

The full web suite passed 382 tests across 73 files, with typecheck and the production build passing. This includes identity-transition checkpoint draining, camera acknowledgments, retained competing tab views, and report wire-size/rate limits. The authored catalog check covers 1,843 scenes.

Real development Neon checks verify concurrent writes, canonical idempotent retries after later camera/progress changes, retained checkpoints, and receipt quotas. The local API checks use real Neon/private Blob for ownership isolation, invalid-save rejection, private reports, comparison thresholds, and erasure. The maintenance runner verifies signed Clerk payloads with the actual verifier, linked-account erasure, and physical Blob cleanup. These are separate from actual provider delivery, authenticated browser, production, and native-device evidence.

The cloud preview at commit `b9354384` built successfully. Browser verification then found the native HTML game dialog obscured Clerk portals; a follow-up closes it before opening account controls and keeps sign-out in Morpheus. The optimized build passes after that correction.

Only the development Clerk deletion endpoint is configured; actual provider delivery remains unverified. The production Svix application has been initialized, but its endpoint/signing secret, schema application, promotion, and post-release checks remain outstanding. See `docs/release/morpheus-cloud.md` for the operational contract.

## Initial evidence

Both platforms already use `morpheus-living-save-session`, schema 1, game-data version 1. Each has three save slots. Web uses IndexedDB and authored state/scene validation; native JSON encoding matches the same fields. Web `/admin` already checks configured Clerk user ID plus verified admin email. No cloud API routes or native Clerk integration were present at inspection.

The linked Vercel project is `morpheus-web-www` (`prj_Ck4KfsUOD3ECmJMr9JtfhGNHFSND`), team `team_Eam5iv5Hn4S5k8mGzMlZRSpH`.
