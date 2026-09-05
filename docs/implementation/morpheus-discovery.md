# Morpheus discovery and achievement rules

Discovery catalog version **1** measures **227 locations** across the ship, four dream worlds, and the ending. It measures places reached, not hours played, puzzle correctness, dialogue watched, or progress toward winning. Player copy should say “locations discovered”; reaching the ending and reaching 100% discovery are separate results.

## Authored evidence and counting choices

The reviewed source is `packages/morpheus/client/js/service/morpheus.map.json`, SHA-256 `8504cc0dc7f18afe3f77c1b13c553a3bd040993158aef92fe4f848dfb54cc094`, also recorded by `packages/www/src/generated/sceneCatalog.json`. The original `MorpheusWin/CommonSources/Headers/MorpheusSupport/CScene.h` identifies scene type 1 as panorama, 5 as help/menu, 6 as credits, and 7 as final credits. Its `CScene.cpp` stores volatile visited flags; these are not proof of a legal playthrough and are not a substitute for durable per-run discovery records.

The new catalog covers all **295 authored panorama scenes**, grouping scenes that represent one place in different lighting, puzzle, or elevator states. The catalog stores explicit scene membership, with the authored panorama asset beside each group as an audit aid. It does not infer content from a numeric scene-ID range at runtime.

| Section ID | Player label | Locations | Authored membership |
| --- | --- | ---: | --- |
| `ship` | Ship | 144 | Deck1, Deck2, Deck2Bth, CargoH, Deck3Aft, Deck3For, Deck4, Deck5, Elevator, sanitory, neuro panorama casts |
| `voodoo` | Island dream | 13 | Voodoo panorama casts |
| `harem` | Palace dream | 23 | Harem panorama casts |
| `waterfront` | Waterfront dream | 33 | h2oFront panorama casts |
| `carnival` | Carnival dream | 10 | carnival panorama casts |
| `ending` | Ending | 4 | iceNchat's three panorama locations, plus one ending-completed milestone |

The four dream sections follow the authored neuro-pod destinations: scenes `532011`, `532012`, `532013`, and `532014` use `2carnivlSPC`, `2haremSPC`, `2h2ofrntSPC`, and `2voodooSPC`, respectively. The sanitarium and Neurographicon remain ship facilities. Cabin names do not create extra dream sections.

The grouping decisions are:

- Ship panoramas with different viewpoints remain separate places, even within one room. Known light/dark counterparts are one place: `2230/2231`, `2240/2241`, `2250/2251`, `2260/2261`, `2280/2281`, `2290/2291`, `2320/2321`, `2330/2331`, `2370/2371`, `3710/3711`, `3810/3811`, `4210/4215`, and `4212/4216`.
- The same sanitarium viewpoints before and after the authored state change are grouped as `4310/4311`, `4320/4321`, and `4340/4341/4345`.
- The elevator interior is one place across `6001/6002/6003/6004/6013/6014`. Visiting another floor does not rediscover the elevator.
- Voodoo C1 (`7130–7139`), C2 (`7030–7039`), A (`7040–7049`), B (`7050–7059`), and C (`7060–7069`, `7169`, `7269`) each count once. Their authored motion/lift states are not additional places. D and E, the beach, bridge, grotto, crossroads, obelisk, and ceremony remain distinct places. The exact lists are in `catalog.ts`; these ranges are documentation shorthand only.
- Transitions, closeups, controlled-movie puzzle frames, menu screens, ordinary credits, and intro scenes do not add locations. Changing rotation, animation frame, a control value, or repeatedly visiting a scene cannot increase discovery.
- Scene `895050` plays `GameDB/iceNchat/endseqSPC`, whose next scene is `895051`. Narrative-credit scenes `895051–895058` and final-credit scenes `895065/895066` therefore alias one “ending completed” location. Merely entering the finale movie does not mean it finished. Menu-accessible credits `100200–100207` never count as completing the story. A visit is still an unverified client observation, even at the ending.

These are content-accounting rules only. They do not modify authored transitions, hotspot eligibility, game state, or native runtime behavior. A full authored playthrough is still required to establish practical reachability of every catalog location; catalog coverage tests alone do not prove it.

## Pure functions and integration

Import from `packages/www/src/lib/discovery/index.ts`:

- `calculateDiscovery(discoveredSceneIds)` returns `catalogVersion`, `overall`, `sections`, `discoveredLocationIds`, and `completed`. Each count contains `discovered`, `total`, and `percent`. IDs are deduplicated by location; unknown IDs are ignored. Arrays return in catalog order. Percentages truncate to one decimal and cannot display 100 until every location is present.
- `findDiscoveryLocation(sceneId)` returns the immutable location, section, and scene aliases. `getDiscoverySection(sceneId)` returns its section or `undefined` for scenes that are not counted. During a transition/closeup, the UI may keep the last counted location's section; it must not guess the section from scene-number prefixes.
- `listDiscoveryLocations()` exposes the complete immutable catalog. Catalog IDs are scoped to the catalog version. The current content identity uses the first scene in the reviewed group, not a client-provided label or total.
- `evaluateAchievements(discoveredSceneIds, source)` returns matches for admin testing. `source` is `played` or `imported`; it is diagnostic metadata, not an authentication or integrity claim. Every result has `visibility: 'admin'` and `verified: false`.
- `compareDiscoveryAtEnding(player, cohort)` returns a descriptive aggregate or a reason to omit it. Records have server-owned `playerId`, `catalogVersion`, `discoveredSceneIds`, and the unverified `source` label. It accepts no percentages or totals.

The cloud service calculates results from its saved visit records and the server's catalog. `CloudSave.runId` scopes a playthrough; retain the same run's cumulative observed visits alongside its living-save snapshot across local persistence, retries, and sync. A new game starts an empty visit set. Do not aggregate discovery across unrelated slots/runs, recover historical visits from numeric game-state values, or union discarded conflict branches into the chosen run. Those choices would claim places the retained playthrough may never have reached. Imports retain only visits actually supplied or subsequently observed and remain marked as imported; an old snapshot cannot reconstruct its missing visit history.

When the scene becomes the committed active scene, record its ID against the active run. Background/prefetched scenes and direct explorer/tooling sessions must not create game discovery. The UI can calculate immediate local display using the same rules, but local display is not server evidence. Both clients should show the last server-confirmed comparison only when it still belongs to the same run and catalog version.

## Initial admin achievements

The rule set observes first discovery, entering each of the four dreams, entering all four dreams, discovering every location in each section, reaching the ending, and discovering every location overall. It intentionally excludes guessed puzzle-solved flags: a bounded state value is not proof that the puzzle was solved. Achievement observations are recomputed from visits and have stable IDs within the catalog version. Store a server timestamp on first observation if admin history needs timing; the pure calculator does not take client-earned timestamps.

Imported saves can show admin matches labeled `source: 'imported'`. They cannot acquire verified achievements through this module. A claimed `source: 'played'` also returns `verified: false`, including a fabricated complete visit list. No code path here awards a public badge, Game Center achievement, or verified ranking.

## Endgame comparison

The descriptive comparison uses each **other player's best recorded completed playthrough** from the same catalog version, with at least **20 distinct other server-owned player identities**. It excludes the current player's records, imported records, incomplete runs, and different catalog versions. Multiple slots or repeated games belonging to one player cannot multiply that player's weight. Anonymous identities can still represent multiple installations of the same human; account association should deduplicate server ownership where known.

The result contains only the other-player count, the player's discovery percentage, the cohort mean, a cohort label, and `verified: false`. It returns no percentile, rank, individual identity, or leaderboard. Suggested text: “You discovered 72.2% of locations. Other players’ best recorded completed games average 64.8%.” This describes recorded data; it does not assert cheating was ruled out. Omit the comparison when unavailable. Never call this “all players” when only completed recorded games are included. The 20-player minimum is a product noise/privacy threshold, not a statistical or legal guarantee.

The `played` label is client-reported. Excluding known imports reduces obvious noise but does not make this cohort resistant to manufactured players or fabricated visits. Do not use the aggregate for rewards, scarce benefits, or competitive placement.

## Save integrity and a legal move from blank state

The current save envelope plus visit list is a snapshot. Authentication establishes who submitted it; validation establishes that it is structurally compatible with the authored data. Neither establishes that the player reached it through legal actions. A checksum, client signature with an embedded secret, compressed/encrypted save file, or monotonic-looking percentage cannot provide that guarantee.

Useful immediate checks belong in the cloud service: bound payloads and list lengths, validate complete state keys and authored allowed values, reject unknown active/return scenes, serialize revision checks, and rate-limit writes. Preserve authored initial values that deliberately sit outside min/max; rejecting the game's own blank state is not anti-cheat. Derive discovery from the catalog; never persist a client-provided total, percentage, earned badge, or verification boolean as authority. Keep imports and observations explicitly unverified.

Actual legal-history verification would require replaying an ordered action log from the versioned authored initial state with the same shared eligibility, comparator, script, controlled-movie callback, and transition rules used by the runtime. The server would need to validate the exact action against its prior state and compare the resulting state, rather than merely checking adjacent scene IDs. For offline play, retain the sequence and verify it on reconnect; reject invalid competitive evidence without deleting the player's local save. State bounds and a scene adjacency graph cannot prove this: puzzle scripts, return destinations, and state-gated callbacks matter. This implementation does not claim that replay verifier exists.

## Game Center suitability

Game Center is a reasonable later destination for proven achievement definitions, but its player identity is separate from Clerk/Sign in with Apple. Apple requires enabling and configuring Game Center and initializing the local GameKit player before using GameKit services. That is additional product/account/capability work, not automatic save synchronization. See [Initializing and configuring Game Center](https://developer.apple.com/documentation/gamekit/initializing-and-configuring-game-center) and [Authenticating a player](https://developer.apple.com/documentation/gamekit/authenticating-a-player), checked September 4, 2026.

GameKit reports achievement progress against configured achievement IDs; completing an achievement makes it visible as earned. These unverified admin observations should not be forwarded to GameKit. See [Rewarding players with achievements](https://developer.apple.com/documentation/gamekit/rewarding-players-with-achievements). Keep Game Center authentication optional and independent of anonymous play and cloud save continuity if integrated later.

## Verification and catalog updates

From the web repository root, after selecting Node with `nvm use`:

```sh
yarn workspace morpheus-next test run src/lib/discovery/discovery.test.ts
```

Tests cover complete generated-catalog membership, alias uniqueness, section boundaries, duplicate and unknown visits, transitions/menu exclusion, narrative completion, partial/full percentages, imported/unverified achievement observations, and empty/small/deduplicated comparison cohorts. The catalog test pins the map digest so authored changes require reviewing membership and explicitly revising the discovery catalog/version where counting semantics change. It must not be fixed by blindly updating only the digest.

These tests prove deterministic accounting over authored data. They do not prove browser/native visit capture, real cloud persistence, hardware playback, end-to-end game reachability, or a legal playthrough. Those are separate integration/release checks owned by the cloud and client implementation units.
