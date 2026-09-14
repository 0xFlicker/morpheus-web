# Apple grants and recoverable account deletion

Updated 2026-09-05. This backend layer requires provider configuration and the native deletion-intent implementation before an end-to-end release is verified. It does not change Apple portal capabilities or provisioning profiles. See [the Apple handoff](../clerk-apple-handoff.md) for the outstanding approval and configuration boundary.

## Identity and authorization

`POST /api/cloud/apple` accepts `{protocolVersion:1,identityToken,authorizationCode,appleUserId}` with a Clerk session and `x-morpheus-identity` equal to the verified Clerk subject. It requires that subject's verified Apple external account, checks the Apple token's RS256 signature, issuer, configured audience, lifetime and subject, and exchanges the one-use authorization code. The returned Apple identity must match again. No email matching or client-supplied account ownership is accepted.

The native authorization callback must preserve its code until this request succeeds. Before contacting Apple, the backend reserves the exchange under the account's existing transaction lock. It stores an AES-256-GCM encrypted refresh grant after success, never the submitted identity token or authorization code. The code's SHA-256 digest supports a completed exchange retry. A concurrent retry of an unresolved reservation does not exchange the code again or return a false success.

Code exchange and database commit cannot be atomic across Apple and Neon: a consumed code whose successful response or database commit is lost requires fresh Apple authorization. Live reservations have a 24-hour deadline; an expired unresolved reservation returns a request to sign in again instead of indefinitely reporting that it is still confirming. An active account retains a credential-free uncertainty marker until the grant eventually completes or the account is deleted, so a later deletion cannot forget an ambiguous exchange. Account deletion remains available in every case.

Deletion atomically moves each admitted exchange's exact UUID into its receipt-owned revocation queue before removing account linkage. An exchange finishing after confirmed Clerk deletion fills that same UUID; the receipt cannot become `revoked` while any reservation remains unresolved. Abandoned deletion reservations expire to sticky `manual_required`, then their rows are removed. A result arriving even later becomes an unlinked revocation job and can never recreate an active grant or overwrite that manual status. The grant route's explicit 60-second execution limit supplements these database invariants; correctness does not depend on cancelling an already submitted database query.

Clerk continues to own authentication, session refresh, Keychain credentials and hosted OAuth. At deletion, the server attempts to retrieve Clerk's available Apple OAuth access tokens before deleting the Clerk user. It revokes all known stored native refresh grants and available hosted grants. An absent token, unavailable provider, or failed revocation does not prevent deleting the account. This follows [Apple TN3194](https://developer.apple.com/documentation/technotes/tn3194-handling-account-deletions-and-revoking-tokens-for-sign-in-with-apple), [Apple token validation](https://developer.apple.com/documentation/signinwithapplerestapi/generate-and-validate-tokens), [Apple revocation](https://developer.apple.com/documentation/signinwithapplerestapi/revoke-tokens), and Clerk's [provider token](https://clerk.com/docs/reference/backend/user/get-user-oauth-access-token) and [user deletion](https://clerk.com/docs/reference/backend/user/delete-user) APIs.

## Durable client contract

Before the first send, the client durably stores a fresh UUID `deletionId`, 32 cryptographically random bytes encoded as 43 base64url characters, and the captured local account/player binding. Keep the recovery token in the Keychain; never put it in a URL, analytics, logs or a bug report. Persisting intent alone is not proof that deletion was accepted.

First acceptance is `DELETE /api/cloud/account`, JSON `{protocolVersion:1,deletionId}`, with `x-morpheus-deletion-token`, the captured Clerk bearer and `x-morpheus-identity`. The server commits the immutable authorized target and token hash before any external deletion. The same transaction fences further account writes, erases games/session/report database records and queues known Apple grants. Private report attachments become inaccessible immediately and are removed by existing orphan cleanup after 24 hours.

A retry can use the same DELETE or `GET /api/cloud/account?deletionId=…` with only the recovery header. This capability can only resume or read the previously accepted target. Current Clerk authentication is not required because that user may already be gone. Unknown unauthenticated receipts return 404; they cannot start a deletion. If the client must retry first acceptance after 404, it must resolve the same original Clerk account and supply its current bearer. A new account may not inherit that intent.

Responses are exactly:

```json
{
  "protocolVersion": 1,
  "deletionId": "client-generated UUID",
  "status": "pending",
  "deleted": false,
  "appleRevocation": "queued"
}
```

`202 pending` with `Retry-After:60` means deletion is accepted but Clerk deletion is not yet confirmed. `200 deleted` means Morpheus erasure and Clerk deletion are confirmed; an idempotent Clerk 404 also confirms a previously deleted user. Transport failure and receipt 404 never mean deleted. The Apple status is independently `not_required`, `queued`, `revoked`, or `manual_required`.

After confirmed deletion, native recovery may preserve the user's standalone game progress as local guest saves, without transferring pending writes, account data or credentials. Local recovery and SDK sign-out failures must not be presented as failed remote deletion. Keep recovery intent until those local steps are durable. Clear credentials only for the deleted account; never sign out or overwrite a different active account. Show [Apple's manual revocation instructions](https://support.apple.com/en-us/102571) for `manual_required`, and as an available option while `queued`.

## Retention and disclosure

- Active account grants remain encrypted until account deletion so Apple access can be revoked. Credential-free records of unresolved exchanges remain until resolution or account deletion, including after the 24-hour live reservation deadline. They are not used for Morpheus authentication or analytics. Only the Clerk ownership hash and authorization-code digest index a grant or uncertainty marker.
- Pending deletion work retains an encrypted Clerk target and its hash only until Clerk deletion is confirmed. Its lease prevents duplicate workers. Failed or ambiguous Clerk calls retry; the daily job refreshes the deletion fence before ordinary retention cleanup.
- After confirmation, the receipt clears all target, lease, work-counter and credential fields. Only the random deletion ID, recovery-token hash, status and timestamps remain indefinitely. There is one accepted deletion per account, enforced by a unique active target hash, the deletion fence, and authenticated first acceptance with a daily request limit. An unauthenticated caller cannot allocate receipts.
- Separate revocation jobs retain encrypted token material for at most 30 days and at most 30 attempts. They temporarily reference the random receipt ID to update its Apple status; no Clerk subject, Apple subject, email, game or report identifier remains on these jobs. Successful revocation deletes the job and token. Expiry deletes the material and marks the receipt `manual_required`. The bounded operational link ends when the job is erased.
- Foundation retention is unchanged: a 30-day account-hash deletion fence, 30-day functional session records, 90-day guest inactivity and requested reports, and private orphan attachment cleanup after 24 hours. No data is sold, used for advertising, or used for cross-service fingerprinting.

Reusable privacy copy: “When you delete your account, we remove its online game and support data and ask our sign-in provider to delete the account. We keep a minimal deletion receipt indefinitely so a device that was offline can finish cleanup later. The completed receipt contains a random reference, a protected recovery-token hash, status and dates, with no account identifier. Encrypted information needed to finish an accepted deletion is retained until it completes. Apple revocation credentials may remain for up to 30 days while we retry revocation; during that time the revocation job is linked only to the random receipt. You can also revoke Apple access in your Apple Account settings.”

Pending work is account-linked; avoid calling it anonymous. Hosted infrastructure backups and logs have their own disclosed retention; application deletion does not promise immediate physical removal from provider backups. The existing legal route should incorporate the retention paragraph before this layer ships.

## Configuration and deployment

Server-only values, configured separately for each environment:

| Variable                        | Required value                                                                                                                          |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `MORPHEUS_APPLE_ENCRYPTION_KEY` | A dedicated random 32-byte key in canonical standard base64. Used only for encrypted Apple grants and temporary Clerk deletion targets. |
| `MORPHEUS_APPLE_CLIENT_IDS`     | Comma-separated allowlist of Apple audiences: native bundle ID and the project's hosted Services ID.                                    |
| `MORPHEUS_APPLE_WEB_CLIENT_ID`  | Exact Apple Services ID configured for Clerk's hosted Apple connection; it must also be allowlisted.                                    |
| `MORPHEUS_APPLE_TEAM_ID`        | Apple Developer Team ID owning those identifiers.                                                                                       |
| `MORPHEUS_APPLE_KEY_ID`         | The Sign in with Apple signing key's public key ID.                                                                                     |
| `MORPHEUS_APPLE_PRIVATE_KEY`    | Private `.p8` PKCS#8 key, PEM with actual or escaped newlines. Never a `NEXT_PUBLIC_` value.                                            |

Existing `CLERK_SECRET_KEY`, `CLERK_WEBHOOK_SIGNING_SECRET`, `DATABASE_URL`, `CRON_SECRET`, and private report Blob credentials remain necessary. Client secrets are signed for five minutes per Apple request. Do not rotate/remove the encryption key without re-encrypting existing active grants and pending deletion/revocation records in a coordinated deployment; losing it prevents automated cleanup of those encrypted targets. Keep this key available in secure operator recovery storage.

Clerk's shared development Apple credentials are not the project's production Apple credentials and do not prove native/web identity or revocation parity. Production must use a Services ID associated with the verified primary App ID, exact Clerk return URLs, and a signing key allowed for that group. Do not enable/change Apple capabilities or regenerate profiles without the existing required approval.

`scripts/cloud/apply-schema.mjs` applies foundation schema followed by `apple-schema.sql`. The signed Clerk `user.deleted` webhook calls `handleAppleClerkDeletion`, which atomically fences/erases data, queues retained grants, and completes an existing deletion receipt. It also works when deletion originates in Clerk rather than Morpheus. A user already deleted externally may have no retrievable hosted token; known native grants still enter the revocation queue. The daily maintenance route calls `maintainAppleAccounts` before foundation retention.

Development verification, from the web root after `nvm use`:

```sh
node --env-file=.env.cloud-preview.local packages/www/scripts/cloud/apply-schema.mjs
node --env-file=.env.cloud-preview.local packages/www/scripts/cloud/verify-apple-database.mjs
```

The verification script inserts only random synthetic fixtures and removes them in `finally`. It never calls Apple or Clerk. It includes late grant completion after confirmed deletion and target clearing, all pre-existing revocations completing while only unresolved reservations remain, concurrent token completion, exhausted late revocation, abandoned active-account uncertainty, and a result arriving after reservation expiry. Unit tests verify cryptography locally and mock provider calls; they do not prove portal configuration, a real Sign in with Apple exchange, Apple revocation, or native/web identity parity. Those remain release verification work.
