# Morpheus Cloud execution

- Goal created; Apple/Clerk handoff and both checkouts inspected.
- Web branch: `codex/morpheus-cloud`; native `main` has pre-existing cache/session/test edits preserved.
- U1 implemented: separate production/development Neon and private report Blob stores; strict ownership, transactional save revisions, bounded retry receipts, reporting, deletion and daily retention. Development database/API/storage checks pass. Production schema and deployment remain pending.
- U2 committed: authored discovery catalog and observed achievement rules. Server comparisons exclude imports and require 20 other completed players; results remain explicitly unverified.
- U3 implemented: durable local checkpoints/outbox, identity archives, safe resume boundaries, preserved competing tab checkpoints, and quiet camera synchronization. Final browser verification remains pending.
- U4 pending: native sync/auth/report integration. Pre-existing native edits remain untouched; dirty-checkout and Apple capability/profile-impact questions are still pending.
- U5 web implementation ready: False Floor, LLC privacy/license disclosures and public support form. Native disclosures and Apple account-deletion/revocation remain pending.
- U6 implemented: admin-only report, session, save, and observed achievement browsing. Final authenticated browser and deployment verification remain pending.

## Current verification

The full web suite passed 382 tests across 73 files, with typecheck and the production build passing. This includes identity-transition checkpoint draining, camera acknowledgments, retained competing tab views, and report wire-size/rate limits. The authored catalog check covers 1,843 scenes.

Real development Neon checks verify concurrent writes, canonical idempotent retries after later camera/progress changes, retained checkpoints, and receipt quotas. The local API checks use real Neon/private Blob for ownership isolation, invalid-save rejection, private reports, comparison thresholds, and erasure. The maintenance runner verifies signed Clerk payloads with the actual verifier, linked-account erasure, and physical Blob cleanup. These are separate from actual provider delivery, authenticated browser, production, and native-device evidence.

Only the development Clerk deletion endpoint is configured. Its stable preview URL needs the cloud implementation deployed before actual provider delivery can pass. Production webhook configuration, schema application, promotion, and post-release checks remain outstanding. See `docs/release/morpheus-cloud.md` for the operational contract.

## Initial evidence

Both platforms already use `morpheus-living-save-session`, schema 1, game-data version 1. Each has three save slots. Web uses IndexedDB and authored state/scene validation; native JSON encoding matches the same fields. Web `/admin` already checks configured Clerk user ID plus verified admin email. No cloud API routes or native Clerk integration were present at inspection.

The linked Vercel project is `morpheus-web-www` (`prj_Ck4KfsUOD3ECmJMr9JtfhGNHFSND`), team `team_Eam5iv5Hn4S5k8mGzMlZRSpH`.
