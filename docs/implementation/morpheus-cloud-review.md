# Morpheus Cloud web review

Review scope: cloud identity and ownership, SQL save concurrency and deletion, private reports, local checkpoint persistence, account transitions, discovery calculations, and public/admin interfaces. Reviewers used source analysis and focused regressions. A separate Grok source review ran read-only against the private checkout. This record does not represent native, hardware, or production verification.

## Fixed findings

| Failure scenario | Resolution and evidence |
| --- | --- |
| Clerk changes account during player registration | Required identity assertion is checked before player creation or guest association; request ownership is asserted again on every owned operation. |
| Same-slot gameplay in two tabs loses the later checkpoint | Retain competing writer checkpoints in IndexedDB with bounded capacity and revision-checked resolution. Nine candidate regressions cover preservation and camera updates. |
| Account switching or returning after a failed drain restores older progress | Capture checkpoints before queueing; withhold runtime reopening until retained progress drains, then recheck catalog owner. Fifteen provider lifecycle and seven checkpoint tests cover the boundaries. |
| Accepted retry response loses envelope fields or changes after later progress | Parenthesize PostgreSQL JSONB operands; retain canonical receipt metadata. Real Postgres regressions verify retries after camera and progress changes without altering the newer checkpoint. |
| Full saves duplicated in idempotency receipts amplify storage | Compact receipts, per-player/day budgets, and existing-retry lookup before quota enforcement. Real Postgres verification includes 25,000 synthetic receipts. |
| Reports duplicate under a new guest after a lost first response | Establish identity without report contents first; retain the confirmed owner and immutable request across retries. |
| Large reports bypass useful throttling or exceed combined field limits | Apply request rate limits before reading content, rate-limit identity preflight, and share a 4 MiB wire limit with browser preflight. |
| Standalone support report associates previous guest gameplay | Guest association is restricted to game registration with a verified identity assertion. |
| Camera-only resume changes are never synchronized | Separate acknowledged view from gameplay progress; quiet local uploads and safe-boundary remote downloads, with no progress conflict or revision increment. |
| Active guest credential expires despite ongoing play | Refresh the anonymous cookie and server activity expiry on functional activity. |
| Unused comparison helper diverges from the production aggregate | Remove it; use the actual database cohort calculation and server tests. |
| The game dialog obscures Clerk's account portals | Browser reproduction confirmed the top-layer dialog trapped input. Close it before opening Clerk and use explicit Account/Sign out controls in the game menu. The Account dialog is now accessible in the built app. |

## Verification

The complete web test suite passes **382/382 tests in 73 files**. Typecheck, catalog validation, and the optimized production build pass. Real development API checks use Neon and private Vercel Blob for ownership, save writes/retries, report storage and PNG metadata stripping, admin denial, comparison eligibility, and online erasure. The maintenance runner verifies actual Clerk signed-payload handling, linked-account deletion, and physical Blob cleanup.

Grok's report-test mismatch referred to an earlier source snapshot; current report tests pass. Its aggregation cost concern remains a performance measurement task: the query aggregates played saves, and the release runbook calls for measuring query latency and database load before adding a stored summary. There is no measured production scale claim.

Authenticated continuity was exercised between the in-app browser and Chrome with a labeled development account: the guest journey survived sign-in, appeared automatically in the second browser, and an ordinary move from scene 2000 to 2040 increased discovery in both browsers at the menu boundary. Neon recorded two distinct devices for the same owner. The authenticated report panel displayed its successful receipt.

Offline divergent gameplay choices, real webhook delivery, production promotion, native Apple account parity, and physical-device playback remain separate release evidence. Initial achievements and saved discovery are observations; neither snapshot validation nor this review proves a legal playthrough from the authored blank state.
