# Morpheus Cloud execution

- Goal created; Apple/Clerk handoff and both checkouts inspected.
- Web and native branches: `codex/morpheus-cloud`; pre-existing native cache/session/test edits are preserved separately.
- U1 implemented: separate production/development Neon and private report Blob stores; strict ownership, transactional save revisions, bounded retry receipts, reporting, deletion and daily retention. Development database/API/storage checks pass. Production schema and deployment remain pending.
- U2 committed: authored discovery catalog and observed achievement rules. Server comparisons exclude imports and require 20 other completed players; results remain explicitly unverified.
- U3 implemented: durable local checkpoints/outbox, identity archives, safe resume boundaries, preserved competing tab checkpoints, and quiet camera synchronization. Authenticated continuity and an ordinary gameplay move passed between the in-app browser and Chrome. Offline divergence and production checks remain pending.
- U4 committed and pushed: shared native repository/coordinator/transport, scoped Clerk sessions, quiet save/resume, report uploads, discovery and durable deletion recovery. The final native boundary run passed 110 expanded cases; the Apple monitor/coordinator run passed 23. The integrated unsigned iOS Simulator build passes. Broader gameplay testing reproduces three existing media failures; no new failure appeared. Native UI/network verification remains pending. The external Apple capability/profile-impact approval remains a prerequisite for affected provisioning and Apple sign-in verification.
- U5 implementation ready: False Floor, LLC disclosures, public support form, native privacy controls/manifest and durable Apple account-deletion backend. Provider exchange/revocation and App Store release metadata remain pending.
- U6 implemented: admin-only report, session, save, and observed achievement browsing. Ordinary-user browser denial and authenticated browser report submission pass. Actual admin browsing and production verification remain pending.

## Current verification

The full web suite passed 413 tests across 78 files, with typecheck and the optimized build passing. This includes identity-transition checkpoint draining, camera acknowledgments, retained competing tab views, report wire-size/rate limits and durable Apple account deletion. The authored catalog check covers 1,843 scenes. Native/web discovery groups match across six sections, 227 locations and 305 scene variants.

Real development Neon checks verify concurrent writes, canonical idempotent retries after later camera/progress changes, retained checkpoints, and receipt quotas. The local API checks use real Neon/private Blob for ownership isolation, invalid-save rejection, private reports, comparison thresholds, and erasure. The maintenance runner verifies signed Clerk payloads with the actual verifier, linked-account erasure, and physical Blob cleanup. These are separate from actual provider delivery, authenticated browser, production, and native-device evidence.

The cloud preview at commit `b9354384` built successfully. Browser verification then found the native HTML game dialog obscured Clerk portals; a follow-up closes it before opening account controls and keeps sign-out in Morpheus. The optimized build passes after that correction.

Only the development Clerk deletion endpoint is configured; actual provider delivery remains unverified. The production Svix application has been initialized, but its endpoint/signing secret, schema application, promotion, and post-release checks remain outstanding. See `docs/release/morpheus-cloud.md` for the operational contract.

Clerk Native API is enabled in both environments, and both now register the verified `9X3DZHNHU6.xyz.soapbubble.morpheus` app with `xyz.soapbubble.morpheus://callback`. Separate Apple account-service encryption keys are installed in production and development/preview. The Apple portal still requires user sign-in and explicit approval of the provisioning-profile impact. No Apple signing key or production OAuth provider has been configured yet.

The Apple backend's final review corrected a late exchange/deletion race with an admitted reservation that remains attached to its receipt after target erasure. Focused tests and isolated PostgreSQL regressions verify late completion, concurrent revocation, abandoned reservations and sticky manual-revocation outcomes. Provider calls were mocked for this evidence.

## Initial evidence

Both platforms already use `morpheus-living-save-session`, schema 1, game-data version 1. Each has three save slots. Web uses IndexedDB and authored state/scene validation; native JSON encoding matches the same fields. Web `/admin` already checks configured Clerk user ID plus verified admin email. No cloud API routes or native Clerk integration were present at inspection.

The linked Vercel project is `morpheus-web-www` (`prj_Ck4KfsUOD3ECmJMr9JtfhGNHFSND`), team `team_Eam5iv5Hn4S5k8mGzMlZRSpH`.
