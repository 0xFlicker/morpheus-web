# Morpheus Cloud operations

The Vercel project is `morpheus-web-www` in `flicks-projects`, with repository root directory `packages/www`. Its production domains are `soapbubble.xyz` and `www.soapbubble.xyz`. Preserve the existing build command, map Blob token, and public GameDB configuration.

## Storage and environment separation

Production uses Neon `morpheus-players-production` (`store_Fb85fUpv5pQMN7BI`) and the private Blob store `morpheus-reports-production` (`store_0vEijxzjxAHdVXma`), both provisioned in iad1. Preview/development use separate stores `morpheus-players-development` (`store_wAE6dxls8njKX1gE`) and `morpheus-reports-development` (`store_BrmmXh2gbH46wAPN`). Never connect a preview to production player data.

Required server configuration:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Environment-specific Neon connection, supplied by the integration |
| `MORPHEUS_REPORTS_READ_WRITE_TOKEN` | Dedicated private report store; separate from the existing map token |
| `MORPHEUS_RATE_LIMIT_SECRET` | Independent production/development key for short-lived network-address hashes |
| `CRON_SECRET` | Authenticates the daily cleanup route |
| `CLERK_SECRET_KEY` | Matching environment's Clerk backend key |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Matching Clerk public key |
| `CLERK_ADMIN_USER_ID` | Required production admin ID, also checked against the existing verified admin email |
| `CLERK_WEBHOOK_SIGNING_SECRET` | Environment-specific `user.deleted` webhook signing secret |

Keep credentials in Vercel and ignored local environment files. The report token name does **not** contain `_BLOB_`. Pulls may contain `[SENSITIVE]` placeholders; these are not usable credentials. Obtain a matching Clerk key pair rather than mixing environments. Optional Clerk client telemetry is disabled in the provider.

## Initial schema and checks

The SQL file is the initial Cloud schema, not a backward-compatibility migration. Apply it explicitly to the intended database before deploying the new API. It is transactional and safe to reapply during development. No schema application occurs from a player request.

From the repository root, using an ignored environment file for the isolated development database:

```sh
nvm use
node --env-file=.env.cloud-preview.local packages/www/scripts/cloud/apply-schema.mjs
node --env-file=.env.cloud-preview.local packages/www/scripts/cloud/verify-database.mjs
node --env-file=.env.cloud-preview.local packages/www/scripts/cloud/verify-api.mjs
```

The API runner expects a local server at `http://localhost:3105` by default; `MORPHEUS_TEST_ORIGIN` may select another localhost port. The server must use the same development database and private report store. The maintenance runner additionally needs the development `CRON_SECRET` and `CLERK_WEBHOOK_SIGNING_SECRET` in its environment:

```sh
node packages/www/scripts/cloud/verify-maintenance.mjs
```

The runners create labeled/synthetic player data and clean up their records and attachments. They refuse production/non-local API verification. The database runner inserts 25,000 compact synthetic receipts to verify quota ordering, then removes them. The maintenance runner invokes the actual daily development cleanup, so it also removes any other expired development records. The cohort runner requires a development database without unrelated completed journeys.

## Identity and wire contract

`POST /api/cloud/player` takes a bounded session registration (`deviceId`, `sessionId`, `platform`, `appVersion`). It requires `x-morpheus-identity: anonymous` or the exact current Clerk user ID. This assertion is checked against server authentication before creating a player or associating guest history. It never authenticates the caller.

The response returns protocol version 1, `playerId`, `authenticated`, and an optional associated guest ID. A new anonymous native registration also returns `anonymousToken`; store it securely before uploading. Browsers receive an HttpOnly, SameSite=Lax cookie instead. Authenticated native clients supply a fresh Clerk bearer token. Anonymous native clients supply `x-morpheus-anonymous-token`.

Every subsequent owned request requires `x-morpheus-player-id` matching the server-resolved identity. This fences a cookie/account change after registration. It never grants access by itself. Native UUID spelling is normalized where used as wire identity. The shared living-save envelope remains schema/game-data version 1, with three fixed slots and a separate run UUID and cumulative discovered scene IDs.

Save writes retain their mutation UUID and exact contents until an acknowledgment. Server revisions represent gameplay changes; camera-only changes must not create a competing playthrough. Accepted retry receipts retain canonical checkpoint metadata without duplicating full save payloads. Retrying a rejected mutation returns the current competing version and does not apply that rejected write. A reused mutation ID with different contents is rejected.

Each player may retain at most 100,000 compact receipts, with at most 25,000 new IDs in a UTC day and 2 KiB per receipt. The existing per-minute request limit also applies. Existing matching retries are checked before the new-ID budget. Quota failures return HTTP 429, `code: save-quota-exceeded`, and `Retry-After`; clients retain the pending local write. Unexpired receipts are not silently evicted to make space.

Reports use two requests after the explicit Send action. `POST /api/cloud/reports/identity` accepts `{protocolVersion:1, platform}` and establishes the cookie/native credential without report contents. After that response is durable, send the immutable report to `POST /api/cloud/reports` with the expected player header. Keep both request ID and selected reporting player unchanged across upload retries. Public support preflight does not associate a guest's earlier game history with a signed-in account. Report contents and screenshots are private, bounded, and redacted; no Blob URLs are sent to public clients.

## Deletion and retention

Configure a Clerk endpoint subscribing only to `user.deleted` at `/api/webhooks/clerk`, with its signing secret in the matching deployment environment. The handler verifies the exact signed bytes before erasing the account and associated guest data. A 30-day hash fence prevents token retries from recreating a deleted account. It stores no profile or game progress.

`DELETE /api/cloud/erase` removes the verified player's online records and linked guests while preserving the device's local saves. The UI stops online services on that device first. This does not delete the Clerk account; another connected device can upload again. Account deletion must also revoke Apple authorization before the native Apple release; Clerk deletion alone does not establish Apple revocation.

Vercel invokes `/api/maintenance/morpheus` daily at 05:00 UTC with `CRON_SECRET`. It expires inactive guests after 90 days, session diagnostics after 30 days, reports after 90 days, receipts and deletion fences after 30 days, and expired rate buckets. Private unreferenced report attachments become eligible for orphan cleanup at 24 hours old. Database erasure removes application access immediately; physical attachment deletion is retried through scheduled orphan cleanup if an operation is interrupted.

## Deployment verification and monitoring

Before production, verify the schema, matched Clerk keys, admin ID, dedicated report token, rate key, cron secret, webhook subscription/secret, and public Privacy/Terms/contact routes. Verify ordinary users and anonymous clients receive 401/403 from every admin API, including attachment downloads. Public browsing must not start Morpheus sessions. Test actual sign-in and two independent browsers; mock tests do not establish those flows.

After release, inspect Vercel logs for `/api/cloud/`, `/api/webhooks/clerk`, `/api/maintenance/morpheus`, and the bounded `Morpheus Cloud request failed` marker. Healthy behavior is successful player registration/save acknowledgments, 409 only on stale ownership or competing progress, unauthorized admin denial, successful deletion deliveries, and a successful daily cleanup. Watch Neon storage/compute and private Blob object growth; receipts should remain small and report orphans should not accumulate past cleanup eligibility. Discovery aggregation currently reads played save records; measure query latency and database load before adding a materialized summary.

The release owner should check immediately after deployment, during the next active gameplay session, and after the first scheduled cleanup. Pause promotion or roll back the application deployment if ownership isolation fails, saved progress disappears, or API failures persist. Preserve local exports and both conflict versions during investigation. Do not drop the cloud database or reuse another environment's storage as a rollback shortcut. A rollback to the earlier application stops new cloud writes but does not erase stored player data.
