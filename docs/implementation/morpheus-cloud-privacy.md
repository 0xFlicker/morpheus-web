# Morpheus cloud: privacy and service disclosures

Researched 2026-09-05 UTC. Implementation guidance and proposed copy; not a statement that the controls below are already deployed or that a regulator or Apple has approved them. Scope: the Morpheus web game and iOS/macOS apps, their Clerk identity, Neon records, private Vercel Blob reports, and owner-only `/admin`.

## Product boundary

Automatic saves, resume, discovery, and a report the player chooses to send can stay quiet. Put a short explanation beside the existing Play/Continue, Sign in, and Send report actions; keep Privacy and Terms available from the game menu, website, and native settings. Do not interrupt each save or reconnect. A genuine divergent-save choice remains a gameplay decision, not a privacy consent dialog.

“Functional” describes a purpose; it does not create a legal exemption. An installation identifier is pseudonymous personal data when it lets the service recognize a returning player. Linking its saves to Clerk makes that relationship explicit. The admin view should show the service records needed to operate saves, diagnose failures, calculate the disclosed discovery feature, and answer reports. It should not create a second retained history of every click, browsing journey, or engagement metric.

The design does not use advertising IDs, third-party advertising, data brokerage, fingerprinting, or sale of player data. On that basis, Apple’s advertising/cross-company definition of tracking does not call for an ATT dialog. This does not remove other privacy obligations. Do not derive an identifier from hardware, browser properties, fonts, IP address, or their combination. [Apple: User Privacy and Data Use](https://developer.apple.com/app-store/user-privacy-and-data-use/).

## Collection and storage boundaries

| Feature | Minimum record | Collection boundary |
| --- | --- | --- |
| Local play | Three save slots, checkpoint/revision metadata, visited-location set, settings, and pending operations | Keep locally first. A local-only calculation does not need a telemetry upload. |
| Automatic continuity | Random installation credential; server-owned player ID; save envelope; revision/operation IDs; platform and app/save version; first/last successful service activity | Start only after the player sees the explanation and requests play. No cloud traffic from a landing-page impression merely to count a visitor. |
| Account continuity | Verified Clerk user ID; provider/account information needed for authentication | Sign in connects this device’s progress to the account. Avoid copying names/emails into the game database when the verified ID is sufficient. Support Apple’s relay email and optional name. |
| Session diagnostics | Session ID, platform/build, first/last checkpoint, result/error category, revision and scene needed to diagnose save/resume failure | Prefer records produced by actual save requests. Avoid periodic background heartbeats solely to measure engagement, exact navigation trails, raw request bodies, raw user agents, or IP retention in Morpheus tables. |
| Discovery and initial achievements | Versioned set of discoverable locations, section totals, completion state, evidence classification | Derive from necessary gameplay state. Compute percentages on the service. Initial achievement records are visible to the owner/admin; they are not public profiles. |
| Ending comparison | Coarse distribution of eligible completed playthroughs; catalog/evidence version and cohort size | Show aggregate results, never other players’ identities or saves. Avoid a new behavioral event stream. Suppress small cohorts (proposed minimum: 20) and identify the cohort accurately. |
| Requested bug report | Player’s note, current scene/state, app/OS version, selected diagnostics and optional game screenshot | Opening the panel captures locally. Upload happens only on Send report. Preview the contents, allow removal of the screenshot/note, and keep local export available. |
| Abuse prevention | Credential hash, bounded request counters, expiry and error category | Keep separate from discovery and gameplay achievements. Do not turn malformed/imported saves into behavioral profiles or claim they prove cheating. |

Existing source context: `livingSaveSchema.ts` validates complete state, scene references and bounds; it does not establish a legal playthrough. Native `BugSnapshot.swift` currently promises local export and includes `LastMediaFailure.underlyingURL` and `underlyingError`. Its upload implementation must change the displayed promise and sanitize URLs, query strings, authorization values, user-specific file paths, and error text before sending. A new server schema must allowlist report fields rather than accepting arbitrary device dumps. Screenshot capture must be limited to the game surface, not the desktop or another app.

Do not promise that the hosting/authentication providers never see an IP address. Network delivery necessarily exposes connection information; audit provider access/security logs and their retention separately from Morpheus’s own data tables. Credentials, tokens, report contents, and save JSON must be excluded from application logs and analytics.

## Basis and quiet interaction design

For EU/UK users, distinguish permission to store/read the device from the lawful basis for subsequent personal-data processing. Requested save/authentication storage may meet a necessary-service exception when genuinely necessary for the disclosed service. A cookie named `functional`, an IndexedDB key, or a native storage API does not determine its legal status. The current UK statistical exception requires aggregate service-improvement statistics and an easy objection; retained individual activity histories do not qualify. Do not rely on that exception for the proposed admin session browser. [ICO: storage and access exceptions](https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guidance-on-the-use-of-storage-and-access-technologies/what-are-the-exceptions/).

EU rules vary nationally. For example, the French audience-measurement exemption restricts joining analytics to other records. A signed-in journey history should not be presented as exempt audience measurement. [CNIL: analytics on websites and applications](https://www.cnil.fr/en/sheet-ndeg16-use-analytics-your-websites-and-applications).

Proposed basis record, to complete against the final fields before production collection:

- **Requested game/account service:** necessary save/resume, authentication, the player’s own discovery and requested report handling. Assess contractual necessity for the actual requested feature; do not manufacture necessity by putting unrelated analytics in the terms.
- **Security and reliable operation:** legitimate interests in preventing unauthorized access, maintaining save consistency, and resolving service failures. Record purpose, why fewer/coarser fields are insufficient, short retention, access restriction, and the player’s reasonable expectations. Provide a way to object. If the same result can reasonably be achieved with less personal data, use that method. [ICO: legitimate interests](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/lawful-basis/a-guide-to-lawful-basis/legitimate-interests/).
- **Aggregate ending comparison:** assess the limited secondary aggregation separately. Prefer coarse, unlinked counts from already necessary discovery records. Do not assume calling comparisons part of the game makes per-person profiling necessary. Offer an unobtrusive Privacy setting to exclude the player’s future results while preserving their saves and personal percentage; do not pop up a question. If this assessment cannot justify processing, use explicit voluntary participation or omit the shared comparison for that player.

Apple 5.1.1 requires an accessible policy, data minimization, and a way to withdraw consent. Its permission rule covers anonymous collection too, while explicitly recognizing lawful legitimate-interest processing subject to applicable law. The normal action can communicate a specific request for its associated service: Sign in for account linking, Send for the displayed report, and Play for the described automatic progress service. This is an implementation approach, not a blanket Apple guarantee. [Apple: App Review Guidelines, 5.1.1](https://developer.apple.com/app-store/review/guidelines/#privacy).

Do not treat opening a page, a preselected checkbox, or a generic “accept terms” as consent to extra usage analytics. Where consent is the chosen basis, the player must have a meaningful choice and withdrawal must stop the corresponding processing. A Privacy control may preserve play locally while ending server storage; it need not ask a question during normal gameplay. Optional analytics cannot be bundled into Play. [EDPB: Guidelines 05/2020 on consent](https://www.edpb.europa.eu/sites/default/files/files/file1/edpb_guidelines_202005_consent_en.pdf).

This resolves the no-pestering requirement for the narrow service design. An instruction to keep collecting optional personal activity after refusal, or to hide that activity behind a policy link alone, would be irreconcilable with that approach.

## Reusable copy

Use these blocks only when their named controls and behavior exist. Place the short text in the existing action area, with readable contrast and a real Privacy link, before the first associated request. Record the notice version and action once; do not repeatedly reconfirm it.

**Beside initial Play / the first Continue after introducing cloud features**

> Your progress saves automatically on this device and securely with Morpheus. We use your game state and basic session details to resume play, show discovery, and fix save problems. Sign in to continue on another device. Privacy · Terms

If relying on this action as collection permission, make the action relationship explicit immediately below it:

> Selecting Play allows Morpheus to store this progress and session information. You can change this in Privacy.

Replace “Play” with the actual existing action label. Keep basic local play available through the privacy control where cloud processing is declined; do not put a recurring local-versus-cloud decision into the save workflow. The legal basis record must match the actual choice instead of indiscriminately labeling all service processing “consent.”

**Beside Sign in**

> Sign in with Apple to continue your Morpheus progress on the web and your Apple devices. Your current progress will be connected to your account. Privacy

**Beside Send report**

> Send this report to the Morpheus developer. It includes your note, game state, app and system details, and any screenshot you include. It stays private and is used to investigate the problem. You can send without signing in. Privacy

Show whether the report will be linked to the signed-in account. “Without signing in” is accurate; “unidentifiable” is not. Do not require an email address or promise a reply when none is supplied. If a signed-in player expects an unlinked report, either implement that separate submission path or avoid presenting it as an option.

**Discovery detail**

> Discovery counts the places you’ve reached, across the whole game and within this section. It isn’t a score for solving every puzzle.

**Ending comparison**

> You discovered {percent}% of Morpheus. That is more than {percentile}% of {count} recorded completed playthroughs using this discovery version.

Use this sentence only if its exact calculation/cohort supports it. “All players” is inaccurate if anonymous identities, imports, unverified progress, deleted records, or offline-only games are absent. Do not show a percentile until the minimum cohort is met. Suggested small-cohort text: “Your discovery: {percent}%.”

**Compact privacy summary for web and native**

> Morpheus stores your progress and limited service information so you can save, resume, and see what you’ve discovered. Signing in connects your progress across devices. The Morpheus administrator can view service records, discovery and achievement records, and reports you choose to send to keep the game working. Other players see only grouped discovery comparisons. We do not sell your data, use advertising trackers, or fingerprint your device. You can manage your data and account from Privacy.

**Full policy body skeleton**

> Morpheus is operated by **[verified legal operator]**. Contact **[monitored privacy email]** about your information. This policy covers Morpheus at **[production game URL]** and its Apple apps. Effective **[publication date]**.
>
> We receive the progress you save, a random identifier for your installation, and basic information about save requests and failures. When you sign in, Clerk manages your account and connects its verified identifier to your progress. Apple may provide a name and email address, including a private relay address. Reports include the information shown in the report panel and are sent only when you choose Send.
>
> We use this information to provide saves, resume and discovery, maintain reliable and secure service, investigate requested reports, and produce grouped discovery comparisons. We do not use it for advertising, sell it, or make it available as a public player profile. Where data-protection law requires a lawful basis, **[insert the reviewed purpose-to-basis mapping above]**. You can object to processing based on legitimate interests and withdraw any permission you have given through **[implemented control/contact]**.
>
> Clerk processes authentication; Vercel hosts the service and private report files; Neon stores game records. They process information to deliver these services under their applicable contracts. Apple separately handles Sign in with Apple under its privacy terms. Service providers may process connection and security information. **[List actual hosting locations and applicable international-transfer safeguards after verifying the configured services and contracts.]**
>
> **[Insert the implemented retention periods below.]** Use Privacy to delete this installation’s server data or your account and associated game records, or to obtain a copy. Local exports you keep remain under your control. Contact us for access, correction, deletion or other applicable privacy rights; you may also complain to your data-protection authority. We verify requests using the account or installation credential without asking for unrelated identity documents.
>
> We use device storage for progress, sign-in and the service choices described here. We do not perform advertising or cross-company tracking, whether or not your browser sends a Do Not Track signal. **[Confirm SDK/provider behavior before publishing.]** If this policy changes, we will update its effective date and explain material changes in the game before new processing starts.

The full notice must identify the controller/contact, purposes and bases, recipients, relevant transfers, retention, and applicable access/deletion/objection/portability and complaint rights. An identifier hash is not automatically anonymous. These requirements depend on applicable law and processing, not the size of the database. [GDPR: Articles 4–7, 12–21, 28 and 44 onward](https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng). A conspicuous web privacy link also addresses California’s separate online privacy notice requirement; do not assume a small operator’s exemption from some consumer-privacy thresholds removes notice duties. [California DOJ: online privacy policies](https://oag.ca.gov/node/36676).

## Retention and deletion implementation

These are proposed product limits, not statutory deadlines. Configure and prove the deletion job before publishing them. Do not claim a backup limit until Neon, Blob, Clerk and deployment-log settings support it.

| Data | Proposed limit |
| --- | --- |
| Local saves | Until the player removes them or device/browser storage is cleared; explain that a browser may also evict data. |
| Signed-in current saves, unresolved conflicts, discovery and achievements | While the account is kept, until the player deletes the relevant data/account. Preserve long-term resume; do not silently expire active account saves under a short diagnostics policy. |
| Anonymous server saves and installation record | 180 days after the last successful game-service request, or until deletion. Local play must survive server expiry; distinguish expiration from authorized deletion. |
| Session/operational diagnostics | 30 days from the event; retain only the current revision/acknowledgment state actually required for future sync after that. |
| Superseded save payloads | Delete after successful reconciliation; retain a competing branch only until the legitimate conflict is resolved. Keep deletion/revision metadata only as long as its documented sync/credential lifetime requires. |
| Bug-report notes, structured data and attachments | 90 days from submission. If an issue needs longer investigation, remove player linkage and personal content before retaining a technical reproduction; do not silently retain the full report indefinitely. |
| Uncommitted/orphaned report uploads | 24 hours. |
| Rate-limit counters | Expire with their window, at most 24 hours for the initial implementation. |
| Coarse anonymous comparison distribution | May outlive personal records only after it has no player/installation link, small cells, exact timestamps, or practical reidentification route. Recomputable aggregates are simpler to remove when records are deleted. |
| Backups and provider logs | Establish an explicit configured maximum; proposed backup removal target is 30 days. Until verified, do not publish that number as a guarantee. |

Build one deletion workflow that revokes server access, removes saves/conflicts/session records/discovery/achievements/report metadata, deletes private attachments, and deletes the Clerk account when requested. It must survive partial provider failure and expose truthful completion status. Disable pending uploads before deletion so an offline client or retried request cannot recreate the deleted player’s data. A session sign-out, clearing local storage, or deleting only Clerk is insufficient.

Offer **Delete account and data** from native Account/Privacy and the equivalent web page. Offer **Delete this device’s server data** for guests, authenticated using the installation credential. Explain which local copies will remain; do not silently erase local play. Allow a save export before destructive deletion. If the guest credential is lost, do not ask for fingerprinting evidence to rediscover the player; explain the automatic expiry.

Apple requires deletion for automatically generated guest accounts too. Deletion must be easy to initiate in-app; a direct deletion web page can complete it, but an email-only support route is unsuitable here. Apple sign-in tokens must be revoked as part of account deletion. [Apple: Offering account deletion in your app](https://developer.apple.com/support/offering-account-deletion-in-your-app/).

Verify the Clerk/Apple revocation path explicitly. Clerk’s current Apple documentation says deleting a Clerk user does not reset Apple-side authorization; successful Clerk deletion alone is not evidence of complete Apple unlinking. Do not confuse Clerk OAuth-application token revocation with revocation of Apple’s external-provider authorization. [Clerk: Sign in with Apple](https://clerk.com/docs/ios/guides/configure/auth-strategies/sign-in-with-apple).

## Apple privacy metadata and Game Center

Audit the final app and SDK behavior, including both anonymous and signed-in paths, before answering App Store Connect. Expected categories are:

| Apple category | Morpheus data |
| --- | --- |
| Gameplay Content | Cloud saves and discovery/achievement state |
| User ID; Device ID where applicable | Clerk/player identifier; installation identifier if treated as a device identifier |
| Email Address; Name when received | Clerk/Apple account details, including relay email |
| Product Interaction | Session activity or saved-place information transmitted by the app |
| Other Diagnostic Data; Crash/Performance Data if actually sent | Save/media errors, crash markers or measured failure timings |
| Customer Support; Photos or Videos if included | Requested report note and screenshot |

For the defined design, App Functionality is the principal purpose. Do not choose “not linked to the user” merely because a person has not signed in: stable device/account linkage counts. Report every collected category unless it meets Apple’s complete optional-disclosure exception; do not assume requested bug reports are exempt. Reassess Analytics if product measurement is later added. [Apple: App Privacy Details](https://developer.apple.com/app-store/app-privacy-details/).

Bundle accurate `PrivacyInfo.xcprivacy` declarations and audit Clerk’s shipped manifest. For iOS, declare actual required-reason API use, including the app’s persistent settings/storage calls where covered, using Apple’s approved reasons. Do not copy arbitrary reason codes or claim an on-device-only reason for data later uploaded. App Store privacy answers, manifests, and the policy must agree. [Apple: privacy manifests](https://developer.apple.com/documentation/bundleresources/privacy-manifest-files), [required-reason APIs](https://developer.apple.com/documentation/bundleresources/describing-use-of-required-reason-api).

Keep initial achievements in Morpheus admin records. Game Center is a separate Apple account/service and does not replace Clerk’s cross-platform identity. A later integration should request only the game-scoped identifier and necessary achievement state, avoiding friends, avatars and wider team identifiers. Apple recommends `gamePlayerID` for this scope. [Apple: scoped Game Center identifiers](https://developer.apple.com/documentation/gamekit/protecting-the-player-s-privacy-using-scoped-identifiers).

Before enabling Game Center, disclose the added Apple reporting separately: Apple receives gameplay/achievement activity, and some profile/activity information can be visible through Game Center and Apple Games according to the player’s settings. Do not promise all achievements remain private after enabling that integration. [Apple: Game Center & Privacy](https://www.apple.com/legal/privacy/data/en/game-center/).

## License and service terms

Privacy permission belongs in the privacy flow, not a hidden EULA clause. The existing web root, `packages/www`, and engine licenses are MIT. Do not add a blanket prohibition on modifying, copying or reverse-engineering code that contradicts those grants. The rights status of the original game art, audio, footage and bundled native distribution needs confirmation before asserting a new exclusive license.

For App Store distribution, Apple’s standard EULA applies if no custom EULA is supplied; a custom EULA is not required merely because saves are hosted. Review the actual app/content license before choosing the standard or custom form. Keep open-source notices accessible and preserve their rights. [Apple: Provide a custom license agreement](https://developer.apple.com/help/app-store-connect/manage-app-information/provide-a-custom-license-agreement).

Proposed small **online service terms** block, separate from existing software licenses:

> Use Morpheus’s online services for your own gameplay and reports. Do not access another player’s records, disrupt the service, or submit fabricated results to shared comparisons. Imported or altered saves may remain playable while being excluded from verified results. You keep any rights you have in your report; sending it permits us to store and use it to investigate the issue. Saves and reports are handled as described in Privacy. These terms do not limit rights granted by applicable open-source licenses or rights that consumer law does not allow us to exclude.

Add the verified service operator/contact and policy/terms effective dates. Do not invent arbitration, jurisdiction, a sweeping feedback IP assignment, or an “all sales final” clause for this feature.

## Facts needed for publication and final audit

1. **Operator and scope:** verified legal entity, monitored privacy/support contact, actual production game/policy URLs, and intended countries/age audience. Do not publish placeholder contact details or claim a universal jurisdictional exemption.
2. **Audience:** confirm whether the service targets children or has actual knowledge of under-13 users. Do not add an age collection screen speculatively. Account emails, notes and screenshots mean “internal operations only” cannot automatically be claimed for every flow; child-directed/known-child use requires a separate assessment under the current rule. [FTC: COPPA compliance](https://www.ftc.gov/business-guidance/resources/childrens-online-privacy-protection-rule-six-step-compliance-plan-your-business).
3. **Providers:** actual Clerk SDK data, provider security/access logs, regions, processor agreements/transfer safeguards, backup retention, and deletion/revocation behavior. No secrets belong in policy copy or this document.
4. **Concrete controls:** initial notice placement before collection; functioning Privacy controls; guest/account deletion including Blob and Apple authorization; report redaction; retention job; admin authorization on every data and attachment endpoint; cohort suppression and accurate wording.
5. **Implementation-to-copy check:** verify anonymous and signed-in network payloads, notice/choice persistence, local play after withdrawal, no post-deletion resurrection, and actual server/attachment cleanup. Source research and unit tests cannot prove portal privacy metadata, live provider deletion, or an Apple review outcome.

This document intentionally supplies reusable copy with explicit publication dependencies. It does not authorize widening collection beyond the requested Morpheus service features.
