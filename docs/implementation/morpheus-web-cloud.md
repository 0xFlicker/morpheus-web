# Web journey continuity

The persistent `/morpheus` runtime owns `CloudProvider`. Explorer and capture runtimes do not start player sessions or save synchronization. Clerk loads within the Morpheus route with optional telemetry disabled; online Morpheus processing starts after the first existing Begin/Continue or voluntary Sign In action acknowledges the visible functional-processing notice. IndexedDB stores that acknowledgment. The Privacy disclosure in the game interface can stop or resume online services; later Play actions preserve a withdrawal.

## Local transactions and account boundaries

`cloud-metadata` lives in the existing `morpheus_living_saves` IndexedDB catalog store. Local save mutations write their envelopes and corresponding run identity, discovered scenes, and source in one transaction. A local checkpoint succeeds before background networking. New journeys receive a UUID run identity; checkpoints retain it. Imports remain labeled imported. Deleted envelopes and discovery metadata remain available through the existing Undo window, and Undo advances the slot revision.

The `cloud-identity:<Clerk user ID or anonymous>` records archive each identity's local catalog. Switching identity stops the prior runtime and its requests, drains its captured checkpoint before opening another catalog, and increments the catalog revision fence. A failed drain keeps the old runtime available for retry and withholds reopening, including a return to the original account. First association may move guest slots into an account only when the server returns the associated anonymous player ID, or when the guest has never acquired a server identity. Competing progressed guest and account-local versions remain an explicit choice in metadata.

Every upload has a UUID mutation ID and expected server revision written durably before fetch. Retrying uses the same exact request, including after a lost response. Acknowledging that request never acknowledges a later checkpoint. Downloads compare both the current identity and local slot revision inside the shared IndexedDB transaction. Timestamps never decide which progress wins.

A competing same-slot checkpoint from another tab is retained transactionally as a local candidate before a conflict is reported. Each slot retains up to eight writer candidates, and resolution checks both candidate identity and slot revision. Storage failure or exhausted capacity fails visibly without claiming the checkpoint was saved. Different-slot changes rebase safely. Camera changes have a separate acknowledged view: local changes upload quietly and remote-only changes download at the same safe boundary without advancing the gameplay revision or prompting.

## Background processing and interaction

The browser serializes sync across tabs through Web Locks. Its transport also checks the current persisted identity/online-services setting, sends the server-resolved `x-morpheus-player-id` consistency assertion, and ignores obsolete Clerk-identity responses. The server independently resolves ownership and rejects an identity assertion mismatch.

Local changes are coalesced for 1.2 seconds. Reconnect, foreground, and opening the game menu retry; failed networking retries after 30 seconds without a modal. Player registration is cached for the current runtime identity, and functional session updates occur on run change or after 15 seconds of further sync activity. Local progress remains available while Clerk or the network is loading.

Remote replacement is deferred until title or an open game menu, with no save-management operation or checkpoint in flight. Replacing the active slot restores through the existing validated living-save coordinator. Real competing progress opens the normal game menu and shows the two choices. Choosing a displayed remote version checks its revision again, so a newer remote update requires a fresh decision.

Discovery is calculated with the authored catalog from locally recorded checkpoint scenes and shown quietly in the game and menu. Ending comparisons come from the server and are labeled as other players' best currently saved completed journeys. These are recorded statistics, not verified legal playthroughs.

The game menu's Send a report panel sends a note, scene, and game state only on an explicit Send action, including when online saves are stopped. It first establishes the reporting identity without report contents, then preserves that owner, the exact serialized request, and idempotency ID across upload retries. A lost identity response therefore cannot create a duplicate report under a new anonymous identity. The shared 4 MiB wire limit is checked before sending. Public support reports do not associate prior guest gameplay with a signed-in account. Browser/user-agent fingerprinting and screenshots are not collected by this initial web panel.

## Verification boundaries

`cloudStorage.test.ts` exercises durable acknowledgment, revision CAS, account archives and association, deletion/Undo, and local guest conflicts. `cloudClient.test.ts` exercises the notice/withdrawal gate, identity headers and transport rejection, stale-response fencing, and checkpoint-boundary download deferral. Run these with the existing package Vitest setup and the living-save storage/coordinator/checkpoint regressions; the root workflow also runs typecheck.

Real Clerk sign-in, two browsers against the deployed API, network loss/resume, and cross-platform Apple identity parity require separate browser/device verification. Web Locks and IndexedDB transaction tests establish retained candidate behavior, not a completed two-browser gameplay test. Report drafts persist in the mounted game menu, not across a full page reload.
