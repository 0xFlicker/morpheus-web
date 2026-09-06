# Expanded discovery: audit and review proposal

Status: **counting direction reviewed with the user; 518-unit manifest and section totals proposed for catalog approval. No runtime or catalog changes made**. September 6, 2026.

The proposal measures **distinct authored content the current journey has visibly presented**: panoramic viewpoints, standalone flat views, closeups, documents/exhibits viewed once, and distinct interactive screens. Puzzle failures and combinations are not required discoveries. It does not measure puzzle completion, playtime, every animation frame, or percentage of the story completed.

This is an inventory and conservative screening pass, not a completed visual audit of every asset. The manifest is a source-grounded review proposal, not a claim that every item has been reached in actual play. The proposed manifest now supplies inclusion/grouping dispositions; approval is still required before the runtime catalog is changed. **Do not ship the subtotal as if it were the complete expanded catalog.**

## Sources and reproducibility

- Authored map: `packages/morpheus/client/js/service/morpheus.map.json`, SHA-256 `8504cc0dc7f18afe3f77c1b13c553a3bd040993158aef92fe4f848dfb54cc094`.
- Original type definitions: `original_source_code/MorpheusWin/CommonSources/Headers/MorpheusSupport/CScene.h`: 1 panorama, 2 closeup, 3 special, 4 transition, 5 help/menu, 6 credits, 7 final credits.
- Current web catalog: `packages/www/src/lib/discovery/catalog.ts`; native mirror: `morpheus/MorpheusRuntime/Cloud/MorpheusDiscovery.swift`.
- Current generated scene inventory: `packages/www/src/generated/sceneCatalog.json`.
- `scene-inventory.csv`: every authored scene, its screening disposition, section derived from visual asset folders, complete referenced visual-cast fields and inline authored actions. Conditions, frame ranges, next-scene actions, positions, scales, and controlled-movie callbacks are retained for review.
- `review-families.md`: shared-base search buckets, explicitly **not aliases**.
- Reproduce from web root: `python3 docs/implementation/discovery-2d-audit/audit.py`. This only writes audit files in this directory; it does not generate the runtime catalog.

There are 1,844 authored scene records, including scene 0 (shared top/bottom chrome). The generated playable-ID inventory excludes 0 and therefore has 1,843 entries. Cast definitions have no duplicate IDs in the audited map.

| Authored type | Positive scene IDs | Interpretation |
| --- | ---: | --- |
| 1 panorama | 295 | Existing catalog groups these into 226 panoramic locations |
| 2 closeup | 0 | Not used by this map; absence does not mean there are no closeups |
| 3 special | 1,523 | Static views, puzzles, documents, movies, transitions, routers, and mixed compositions |
| 4 transition | 0 | Transition movies are authored as type 3 |
| 5 help/menu | 5 | Exclude from discovery |
| 6 credits | 18 | Separate title-menu credits from narrative ending credits |
| 7 final credits | 2 | Completion evidence, proposed outside the discovery denominator |

File suffixes alone are not counting rules. For example, still images are represented as `MovieSpecialCast`; `SPC` can hold a view, animate an object, or advance to another scene. A controlled movie can be an interactive screen or merely a lever animation inside one.

## Reviewed counting rules

1. One discovery unit for each distinct authored view, document/exhibit, or interactive screen, subject to the user-reviewed families below. For 2D, focus on full-screen special-movie presentations; an individual overlay cast inside a composed screen is not a separate unit. Keep unrelated views and content separate even if they share a room or asset. Do not require losing branches, a missed flare, the closed/unopened cargo hold state, incorrect monkey placement, or every puzzle combination.
2. Count only after the selected journey's foreground scene has presented its required visible content and the transition cover is clear. A download, asset-ready event, scene-entry script, save checkpoint, or timeout is insufficient. Require the app/tab to be foreground and the game unobscured; re-evaluate when a menu closes or the app returns to foreground. Do not require a dwell timer or reading comprehension.
3. A persistent screen with an ambient loop can count once as a screen. Its looping frames do not count separately. Controlled-movie positions and puzzle-value changes do not automatically create discoveries.
4. Maps, diaries, and exhibits generally count once per authored item when viewed, not once per page or state. A scrapbook or journal is one unit; the player need not turn every page. Record the observed scene only, then resolve it to the item unit—never fabricate visits to the remaining pages. Separate unrelated maps or exhibits remain separate items. Flag cases where the authored data does not establish the item boundary, such as multiple independent documents inside one viewer.
5. Exclude travel, dissolve, opening/closing, and mechanical animation steps when they only connect or update discoverable views. Exclude menus, chrome, loading/failure displays, intros, audio-only scenes, and tooling/explorer sessions. Narrative vignettes remain a separate review decision below.
6. Alias scenes only with documented evidence of equivalent visible content: composition, crop/viewpoint, frame selection, overlays, state conditions, and navigation purpose. Asset reuse is a search aid, never sufficient evidence. The user has explicitly authorized consolidation of the families below, including container states and grave monkey overlays. Other new overlays do not automatically add units; review whether they are distinct content or a puzzle response.
7. Conditional scenes need special care: recording a scene ID cannot grant every conditional cast it contains. If review identifies multiple independent items within one scene ID, use an explicit content identity and actual presented-cast/frame evidence for each item. Do not split the states or pages of one already-viewed item. Do not expand the denominator into every frame or all possible cast combinations.
8. Deduplicate approved content identities within the same `runId`. Preserve the chosen journey's accumulated evidence through checkpoints, local saves, cloud sync and resume. Starting another journey resets discovery; resolving a conflict must not union the discarded branch's visits into the retained branch.
9. Derive sections from authored asset membership and destination/return relationships. Ship includes the sanitarium and Neurographicon. Dream travel movies do not earn discovery in the destination. Mixed-folder or ambiguous scenes require explicit attribution, never numeric scene-prefix guessing.
10. Keep story completion independent. Recommendation: retain recorded narrative-credit IDs as completion evidence but remove that milestone from the discovery denominator. The existing 227 becomes a base of **226 panoramic locations**, plus approved 2D units. This follows the reviewed direction to exclude titles and credits from the discovery denominator. Retain the independent story-completion flag.
11. Preserve the approved display: optional text in the existing left black bar, always available in the menu. No change to game dimensions, no added bottom space. Use “discovered,” with documentation explaining the expanded content unit.

## Recount proposed for catalog approval

The reviewed recount contains **518 discovery units**: **218 panorama/location families** and **300 additional 2D content units**. These are proposed final membership totals, not deployed behavior. The earlier 422 subtotal is superseded.

| Section | Panorama/location families | Additional 2D units | Proposed total |
| --- | ---: | ---: | ---: |
| Ship | 142 | 192 | 334 |
| Island dream | 7 | 15 | 22 |
| Palace dream | 23 | 9 | 32 |
| Waterfront dream | 33 | 56 | 89 |
| Carnival dream | 10 | 24 | 34 |
| Ending | 3 | 4 | 7 |
| **Total** | **218** | **300** | **518** |

Compared with the former 226 panorama units, the seven Island platform-network locations become one puzzle family (minus six), and the two matching closed/open cargo-deck pairs each become one viewpoint (minus two). The old credits milestone remains outside discovery. Different east/west cargo viewpoints remain separate. Flat platform-state views can satisfy the same platform-puzzle unit and do not add more units.

The full review manifest is `counting-proposal.json`, built by `python3 docs/implementation/discovery-2d-audit/build-proposal.py`. It lists every proposed unit, its actual scene membership, source assets, section and grouping evidence. Every one of the 1,844 authored scene records has a unit mapping or an explicit other-scene disposition. This file is an audit artifact and is not imported by the game.

The final table includes **one recommended exception requiring review**: Billy's portrait (`807071`) is a dedicated entered still view, 300×400 pixels at authored x=230, rather than a full-width image. Recommend one portrait item because it is standalone authored content, not merely a small overlay within another counted screen. Excluding it instead yields Carnival **33** and overall **517**. No other unit depends on this choice.

### Full-screen evidence

The recount probes the original QuickTime assets with `ffprobe` and applies the authored scale and position against the 640×400 stage. Results for 1,618 referenced media files are in `original-media-dimensions.json`. The older converter map's generated dimensions cannot be used as authority: it reports 352×288 for many casts, including the 176×196 cannon overlay; the actual launcher background is 640×400.

Two canonical still names (`scrbLGSTL`, `scrbclseSTL`) are recovered from same-named SPC originals under the converter's explicit `canonical-map-migrations.cjs` / `recover-missing-stills.cjs` mapping. Their source dimensions are recorded with that provenance. Original `807067ANI` is absent; it is not a selected full-screen unit and does not affect these totals. Source size/placement proves a full-screen candidate, not playback or user visibility; runtime presentation checks remain required.

A repeated full-screen base is counted once as an item under the reviewed functional-state rule. Required observations must identify the **actually visible qualifying content**; an eligible scene ID alone cannot award a hidden primary cast. Three shack interiors illustrate this: shared scene `710050` may credit only the interior asset it presents, never all three.

### Consolidated families

- **Graves:** nine bases, zero extra monkey-placement units.
- **Island platform network:** one puzzle/location unit, including C1/C2/A/B/C/D/E and their flat/lighting/mechanical variants; visiting each platform is not required.
- **Gondola:** five route-content units—gondola interior, engine area, vent area, injector area, atrium area. Outbound/return injector states share one area; no lever combination is its own unit. The intended normal traversal to the far end and back exposes the route areas. Gameplay must verify this; no inferred visit is granted for an unshown area, and a separate ordered round-trip achievement is not being added.
- **Bird cage:** one unit across feather/mechanical/live states and the third-bird completion presentation. No requirement to click every stage.
- **Books:** Malherbe journal, Swan scrapbook, Moon diary, expedition journal each count once, regardless of page count. The frozen/unfrozen explorer is a separate once-viewed subject; merely seeing him does not credit his journal. The two explorer states were checked visually.
- **Containers:** each serum container, cigar box, trunk or suitcase counts once across its states.
- **Kinetoscope:** one viewed apparatus/exhibit across its four film selections and two control orientations, not a mandatory four-film checklist.
- **Carnival exhibits:** mermaid, brain and electric man are three independent exhibit units; each includes its plaque, display, closeup and revealed construction. Their boundaries were checked against actual still images as well as authored navigation.
- **Waterfront maps:** each separately authored country map is one item. Different maps are not merged merely because they use the same map desk. This follows the user's once-per-item rule.

## Concrete content examples

| Content | Authored evidence | Proposed treatment |
| --- | --- | --- |
| Scrapbook pages | `331031`–`331040`, `BSpage1STL`–`BSpage10STL`; next-page hotspot and book-close transitions | One scrapbook, viewed once; no requirement to turn ten pages |
| Expedition journal | `890071`–`890079`, `exjour1STL`–`exjour9STL`; explicit page navigation | One expedition journal, viewed once; no requirement to turn nine pages |
| Cards and matches | `123615`, `123617`, `123621`–`123635` selected odd IDs, separate still assets reached through dissolves | Each distinct card/object closeup; dissolve is not another unit |
| Ship instruments | `132010` radar, `132020` telegraph, `132040` radio | Separate screens, despite sharing the bridge area |
| Signs and clues | `112060` placard, `701055` plaque, `851055` cell clue | Separate readable views |
| Different views of related objects | Waterfront cell items `851510` etc. versus corresponding room items `863150` etc. | Remain separate; different authored viewpoints/assets are not merged by object or room |
| Palace instruction view | `781050`, `GameDB/Harem/instrSTL` | Count the displayed content screen |
| Cinematic/looping standalone views | `101050` masked ball, `112050` dance, and auto-playing `VID` records | Count independent full-screen narrative content once when presented; exclude failure and intermediate animation variants |

## User-reviewed family decisions

### A. Exploration without mandatory failures or combinations

These decisions come from the user’s review and supersede the initial case-by-case questions. `review-families.md` remains a raw asset index, not the product rules.

| Family | Reviewed requirement | Authored mapping / remaining technical work |
| --- | --- | --- |
| Flare launcher and other losing branches | View the screen/content once. No missed shot or incorrect puzzle attempt required. | Consolidate launcher configurations; exclude miss/failure clips as independent units. Do not require the unopened cargo hold variant. |
| Graves | Each of the nine grave bases is a discovery. Inserting the monkey into every grave is not required. | Base IDs `700011`–`700019` establish nine units. Their matching `700031`–`700039` records reuse the corresponding grave still; extra grave-6 records `700046/700056` also show `grave6STL`. These may credit the same grave when visibly presented, but never add a monkey-placement unit. |
| Island platforms | Discover the platform puzzle once, without requiring every platform or lightning configuration. | Consolidate the authored C1/C2/A/B/C/D/E network, `7020`–`7029`, `7070`–`7079`, `7090`–`7099` and related panorama states into one puzzle family. This applies the user’s explicit instruction that visiting every platform is not required. |
| Gondola/engine | The intended coverage is going to the far end and back, not enumerating control combinations. | Use the five route-content units enumerated above. Lever settings, panel combinations and repeated ride states add no units. Verify the normal trip exposes the required areas; do not infer return traversal or unseen areas from a control value. |
| Bird cage | One bird-cage content unit; completing the dream naturally shows its animation. | `790010/790020/790030` share `birdcageSTL`; mechanical/live views `790019/790029` and intermediate feather animations are not separate requirements. Trace the completion presentation as a qualifying observation; do not credit it merely because a completion flag is set. |
| Containers | View each container once. | Closed/open, empty/filled and other states of the same container are one unit. A separate authored document inside can qualify as its own once-viewed item, without creating container-state requirements. |
| Maps, diaries, exhibits | Generally view each item once. | Scrapbook `331030` and its pages `331031`–`331040` are one item; expedition journal pages `890071`–`890079` are one item. Do not count every page. Flag only boundaries between genuinely independent items if unclear. |

Consolidation changes the unit definition; it does not invent scene visits. A recorded view of an allowed variant can satisfy its family unit, but does not populate unvisited variant/page IDs. Excluded losing clips remain in preserved raw history without contributing separate discovery units.

Concrete count corrections established by this review:

- Nine grave bases require **nine units**, with **zero additional units** for monkey placement or failure/reveal states.
- The scrapbook’s ten page candidates become **one item**, not ten pages plus a cover.
- The expedition journal’s nine page candidates become **one item**.
- The bird cage is **one unit**, not a separate unit per feather or mechanical/live state.
- Every container is **one item**, regardless of how many open/closed records the map contains.

These reviewed families are now applied in the 518-unit manifest above. The original screening buckets remain available for provenance, but are not the operational grouping rules.

### B. Full-screen 2D content and narrative clips

Reviewed direction: identify full-screen special-movie content, exclude titles and credits, and include independently entered narrative content once; exclude ordinary traversal and mechanism animations. Classify the 171 automatic-content records against these reviewed rules before assigning units. They include obvious page dissolves as well as narrative clips, so neither “include all movies” nor “exclude everything that auto-advances” is valid. The six looping Waterfront memory views (`863160`, `863255`, `863355`, `863455`, `863555`, `863655`) are proposed persistent views in the subtotal; reconcile them as once-viewed content under the reviewed rules.

Use first unobscured presentation for discovery, consistent with other views; watched-to-end achievements remain separate. A failure clip or intermediate puzzle animation does not earn a separate unit simply because it fills the screen. Confirm full-screen coverage from the effective rendered composition/geometry, not filename suffix or origin `(0, 0)` alone.

### C. Completion denominator

Remove the existing one-unit ending milestone from discovery totals while retaining its separate completion flag and all recorded evidence. The table assumes this. Ordinary credits remain excluded.

## Existing visits, percentages, and sync

Keep all existing `discoveredSceneIds`; do not reset, filter away, or fabricate history. Both clients already store raw scene IDs beyond the old panorama catalog, so some previously ignored 2D visits can contribute after review. A newly approved unconditional view may be credited from its actual recorded ID. A conditional content unit cannot be inferred solely from a legacy scene ID that fails to identify which content was shown.

Existing percentages will be recalculated against the expanded catalog. They can decrease even though no recorded visit is lost. For illustration only, 100 credited units out of 227 is 44.0%; 100 out of a hypothetical expanded total of 400 would be 25.0%. Existing raw 2D evidence may also increase the numerator. The proposed denominator is 518 (517 if the portrait exception is rejected), pending catalog approval. Never infer unrecorded scene/page visits from a book-open state, puzzle completion, current room, or a cloud snapshot. A genuinely observed book view can satisfy the book’s single reviewed item unit without requiring or claiming every page.

Legacy records were collected at checkpoints, not under the stricter visibility contract. Preserve them as legacy observations; do not retroactively claim they were verified as visibly presented. New observations must satisfy the new contract. Interrupted/unsaved history absent from the recorded set cannot be recovered.

Catalog IDs and version must be shared between web, Swift and server. Compute percentages from evidence rather than persisting client totals. Generate the native representation from the reviewed catalog and test the full representation, not just example counts. During rollout an old installed native app will still calculate the old percentage until updated; no catalog version can make old shipped code display the new denominator. Do not describe that temporary display difference as lost saves.

## Recording-path audit findings

- Web `GameStageShell.tsx`: `commitPendingTransition` requests a checkpoint before `handleScenePresented` clears/fades the cover. The five-second readiness fallback also calls that commit function. `cloud/localMetadata.ts` adds `parsed.data.activeSceneId` during save reconciliation. A checkpoint therefore does not satisfy the new “actually seen” requirement.
- Native `PlayerViewModel.captureCheckpoint()` calls `recordDiscoveredScene()`, guarded by an active slot and `.panorama`/`.movie` phase. `PlayerSession.activatePreparedScene` advances `checkpointGeneration` after starting flat media. These guards do not themselves establish unobscured frame presentation or foreground visibility.
- After approval, separate discovery observation from checkpoint creation. Use current scene/presentation generation plus active run identity, and reject stale callbacks from a prior scene, slot, account transition, or reset. Presentation timeout can unblock playback but cannot award discovery. Resume earns a new observation only once the scene is actually visible; previously recorded observations remain intact.
- Keep the observation in the existing local/cloud journey evidence pipeline. Do not introduce a second independently synchronized progress counter. Do not add discovery-writing behavior to explorer, render, capture, scene-prefetch, or asset-cache tooling.

## Verification plan after approval

Automated tests:

- Every authored scene has exactly one explicit disposition; every included unit has evidence and a section; every alias belongs to exactly one unit; no unknown IDs or unexplained map-digest changes.
- Pin reviewed groups and non-groups: scrapbook pages share one item, unrelated books remain distinct, each grave has one unit, monkey insertions and missed shots add none, container states share one unit, and platform/lightning/feather/control variations cannot inflate counts. Verify the gondola route coverage without requiring combinations.
- Duplicate visits, independent runs, section attribution, newly expanded denominators, unknown IDs, and story completion independent of 100%.
- Real visibility event versus prefetch/assets-ready/timeout, hidden app/tab, menu-cover, failed media, stale presentation generation, wrong run, and direct tooling sessions.
- Local persistence, save/resume, offline/reconnect, cloud revision retry, account claim, import with limited evidence, and keeping one conflict branch without borrowing the discarded branch's discoveries.
- Full web/Swift catalog identity and calculation parity, including every alias and the same serialized visit fixtures.

Gameplay verification, reported separately from tests/builds:

- In a disposable real journey, enter a panorama, click an authored hotspot into a 2D view, wait for actual presentation, verify the increment, back out and revisit, verify no second increment. Turning another page of the same book must also leave the count unchanged. Repeat after local resume and cloud resume.
- Representative authored routes: `3310 → 331030 → 331029 → 331031 → 331032` scrapbook; `7000 → 700010 → 700011` cemetery/grave. The map establishes candidate edges, not that every route is currently eligible; use actual UI behavior and record the observed sequence rather than forcing it via load-scene tooling.
- A reviewed control-panel interaction must prove control-value/frame changes do not award extra units.
- Repeat representative flows on web and native, including the optional side-bar text and always-available menu percentage. Use a separate test journey; do not overwrite the user's valued phone save.

**Performed so far:** source inspection, all-scene/cast inventory, digest verification, unique-ID/coverage checks, reproducible audit generation. **Not performed:** expanded-runtime tests, new gameplay capture, sync verification under expanded rules, or deployment. No runtime, save schema, catalog, percentage display, or deployed behavior has been changed by this audit.
