# Morpheus Apple provider setup

Verified September 6, 2026 UTC. This supersedes the earlier portal/configuration status in `docs/clerk-apple-handoff.md`.

## Saved provider configuration

- Apple team/App ID prefix: `9X3DZHNHU6`.
- Native App ID: `xyz.soapbubble.morpheus`, portal resource `V29933BCCF`. A fresh authenticated portal read confirmed Sign in with Apple is already enabled as a primary App ID; Save was disabled because there were no pending changes. No capability toggle or profile regeneration was performed during this setup.
- Services ID: `xyz.soapbubble.morpheus.web`, description Morpheus Web, portal resource `7ZRXKK8FK2`, grouped under the native primary App ID.
- Registered domains: `clerk.soapbubble.xyz` and `humane-alien-3577.clerk.accounts.dev`.
- Registered return URLs: `https://clerk.soapbubble.xyz/v1/oauth_callback` and `https://humane-alien-3577.clerk.accounts.dev/v1/oauth_callback`.
- Dedicated signing key: Morpheus Sign In, key ID `85P8ZMXNSG`, scoped only to Sign in with Apple for the Morpheus primary App ID.
- Private relay senders: `bounces+114323155@clkmail.soapbubble.xyz` and `bounces+8126543@em3005.accounts.dev`; both registrations completed with SPF success indicators.

The user explicitly approved storing the private key in Morpheus's production and development Clerk instances. Independent scoped configuration pulls confirmed the Services ID, team, key ID, credential presence, and enabled/authenticatable state in both. Clerk's Native API and native application registrations are configured alongside `connection_oauth_apple.bundle_id = xyz.soapbubble.morpheus`. The live configuration schema describes that field as the iOS bundle ID for native Sign in with Apple. It was initially left empty based on the native setup guide; after the physical Release build returned `authorization_invalid` (403) on native sign-in, it was populated and independently verified in both environments. A real phone retry returned the same 403 (trace `8031732e5f618b3b295bb7a0ef94f6a5`); this field change did not resolve the rejection. Production native API and the App ID registration were rechecked, and public environment settings showed device attestation disabled. A fresh anonymous native client with a deliberately invalid Apple token also received the same generic error, so that error alone does not establish the cause. Native diagnostic instrumentation now checks unverified issuer, audience and time claims locally, without logging credential or identity values; physical-device output remains pending.

## Credential storage and deployments

The five Apple signing settings are protected Vercel Secrets in production and preview. Existing per-environment encryption keys, databases and report stores were preserved. Local development reads the existing ignored `.env.cloud-preview.local` with owner-only permissions; an owner-only ignored `.env.apple-signin.local` retains the signing configuration backup. The downloaded `.p8` file is also owner-only. Never commit or print these files.

Automatic approval review rejected storing the private key as a less-protected Vercel development Config value. That request did not execute. No Vercel development signing variable was installed; local development uses its private local file. Restart the dedicated local API after changing its environment before testing native grant storage.

Production `dpl_DdNL3SRvafnu6ye68MDx7i4HyXeS` and preview `dpl_GkWkqo6cYdgbzf3Xvnppd755e14P` build the existing verified commit `3401eff0d4b9be50e669603d8f70f5ffffaf6a7f` with the signing settings. Production was checked before promotion and its `www.soapbubble.xyz` alias was independently verified. The stable development branch alias points to the new preview; deployment protection remains enabled.

## Evidence and remaining gates

The production candidate served the game and privacy pages with HTTP 200. All three cloud admin routes and maintenance denied anonymous requests with HTTP 401 and private/no-store headers. The preview's admin report route also denied anonymous access. The local environment parses the downloaded key as an EC prime256v1 private key.

The production Account Portal rendered Continue with Apple. Following it reached Apple's real authorization page naming Morpheus Web with the configured Services ID and production callback. No real Apple user authenticated during this check. This proves the initial authorization redirect, not successful code exchange, Clerk account mapping, grant storage, revocation or cross-device save access.

Still required: a real Apple sign-in, native/web account parity including Hide My Email, authenticated cross-device save/resume, signed physical-device verification and App Store privacy answers. The separate development Clerk webhook bypass approval is still pending; no bypass secret was installed.
