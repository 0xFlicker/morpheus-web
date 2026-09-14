# Morpheus Apple authentication handoff

Updated: 2026-09-05 UTC. Status: development provider enabled; production and native setup incomplete.

## Intended architecture

Use one Clerk application for the web and Swift games, with separate development and production instances. Within each environment, key cloud saves and achievements to the authenticated Clerk user ID. Devices have independent sessions. The Vercel API must validate tokens and enforce ownership; never trust a client-supplied player ID. Proposed persistence is Neon Postgres for records/save JSON and private Vercel Blob for report attachments.

## Verified configuration

- Clerk application: `Morpheus`, `app_3I8yGrSH9S1ZmNyHd5qE11Hm1rD`.
- Development: `ins_3I8yGs1wVWFqRis2hW67KjVglJi`.
- Production: `ins_3It8Z5ElANGFrjGuztpJts7nhd5`.
- This session enabled development `connection_oauth_apple.enabled`; a separate read confirmed `enabled: true` and `authenticatable: true`. Development web OAuth uses Clerk's shared credentials.
- Production Apple connection was disabled with empty credentials. No production change was made.
- Apple Developer now authenticated. Existing App ID `xyz.soapbubble.morpheus` has portal resource ID `V29933BCCF`; its App ID Prefix is verified as `9X3DZHNHU6`, matching the Swift project's development team.
- Attempting to include bundle/team fields in the development provider PATCH did not retain them. Native registration is NOT complete.

## Remaining work

1. Apple capability change is prepared but NOT confirmed. The portal is at `https://developer.apple.com/account/resources/identifiers/bundleId/edit/V29933BCCF`, with Sign in with Apple selected as a primary App ID and a Modify App Capabilities confirmation dialog open. Apple warns this invalidates existing provisioning profiles for this App ID and requires regeneration for future builds. Automatic approval review rejected confirmation pending explicit user approval of that impact; an approval question was sent. Do not bypass that rejection.
2. After approval, confirm the capability change and verify it persisted. Register/verify the native application in Clerk using the verified App ID Prefix and bundle ID. Confirm Native API setup in each intended Clerk environment. Future native builds must regenerate affected provisioning profiles.
3. For production web/hosted authentication, configure an Apple Services ID associated with the native Primary App ID, Clerk's exact domain/return URL, and Apple signing key. Configure the private email relay source. Enter credentials securely; never put secrets in this document or git.
4. Enable the production Apple connection after credentials are configured. Add Clerk Swift integration and the app's Sign in with Apple capability in the native implementation task.
5. Verify real web and native sign-ins resolve to the same Clerk user, including Hide My Email. Development shared web credentials are not proof of production native/web identity parity. Verify cross-device save access separately.

## Operational learning

Run `nvm use` before the Clerk CLI from `packages/www`. Sandboxed `clerk whoami` incorrectly reported `auth_required`; the approved host invocation was authenticated and resolved this application. Do not reauthenticate or reinitialize based on the sandbox result alone.

Use `clerk config pull --app <app-id> --instance dev|prod --keys connection_oauth_apple` and redact secret fields before output. Prefer scoped PATCH over PUT. No sign-in, hardware, or cross-device test was performed. Existing `/admin` authorization must remain restricted when player sign-in is added.

References: [Native Apple setup](https://clerk.com/docs/ios/guides/configure/auth-strategies/sign-in-with-apple), [web Apple setup](https://clerk.com/docs/guides/configure/auth-strategies/social-connections/apple), [Swift quickstart](https://clerk.com/docs/ios/getting-started/quickstart).
