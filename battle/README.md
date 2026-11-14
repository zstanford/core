# Orbit: Suipi tug-of-war

A solo 3D match against Sentinel, using Babylon.js + TypeScript and a Rust/WebAssembly rules engine. The classic card table remains at /classic/.

## Run

From the repository root:

    npm ci
    rustup target add wasm32-unknown-unknown
    npm run build
    npm run dev

Open the printed local URL. The build compiles Rust, checks TypeScript, bundles the game, and copies the classic table. Rebuild after Rust changes; frontend edits update through the dev server.

## Rules implemented

- 52 distinct shapes: energies 1–13 in four suits.
- Gold represents spades; Crystal represents diamonds. Tide and Bloom represent clubs and hearts.
- Four non-point starting shapes of distinct energies are dealt once.
- Each player gets eight shapes in each of three rounds. No replacement draws within rounds.
- Matching, additive captures, build ownership, retained finishers, stealing, and locked groups follow Suipi.
- Numeric builds reach 13. Energies 11–13 have no face-card exceptions.
- A fusion morphs into the same geometry as a dealt shape of its capture energy. Original identities remain inside it.
- Two grouped 7-builds retain a locked capture value of 7; source cards and their points are preserved.
- Capturing a build with two original shapes captures three shapes including the played finisher.
- The shared battle line tracks current Suipi point difference. Original-shape and gold majorities remain contested.
- At each hand boundary, the point leader wins that round. Position, captured holdings, and field formations carry forward.
- All three deals are played. Most round wins takes the match; tied round wins use final point lead. Fully tied matches draw.
- After round three, remaining field shapes go to the last capturer before final scoring. Pickup alone earns no sweep.

## Scoring

| Category | Points |
| --- | ---: |
| Most original shapes captured | 3 |
| Most gold/spade shapes | 1 |
| Gold 2 | 1 |
| Each energy-1 shape | 1, four available |
| Crystal 10 | 2 |
| Crystal 11 | 3 |
| Crystal 12 | 4 |
| Crystal 13 | 5 |
| Each Suipi sweep | 1 additional |

There are 23 base points available, plus sweeps. Tied majority counts award neither side those points. The line uses the exact score difference and a display range of 23 plus total sweeps; it never truncates the underlying lead or ends a round early.

## Visual language

Energy 1 is a spark treatment; energy 2 is a sphere. Nicknames identify the other silhouettes; formal geometry names are in the field guide. These are initial art choices for playtesting.

Small energy digits face the camera and brighten on selection. Crystal 10–13 carry 2–5 central diamond marks; Gold 2 has a spade mark. Point marks are independent of energy digits.

Body color identifies suits. Ownership uses separate rings and A/S indicators. Mixed-suit fusion uses a neutral body with source-family arcs; selecting a formation reveals every source shape and its point marks. A Gold 2 + Crystal 10 fusion has energy 12 and three stored special points, not four newly created diamond points.

The arena supports direct picking, an orbit camera, capture collection trails, literal mesh morphs, and Suipi shockwaves. Sound starts muted; reduced-motion preferences shorten movement. If hardware 3D fails, labeled controls still support the same game.

## Architecture

- web/engine/src/battle.rs: 52-shape setup, cumulative scoring, rounds, rival, events, persistence.
- src/pile.rs and src/state.rs: opt-in build ceilings; classic callers still default to ten.
- web/engine/src/lib.rs: shared move generation parameterized by numeric ceiling.
- battle/src/bridge.ts: typed transport to WebAssembly.
- battle/src/arena.ts: procedural solids, suit colors, point marks, ownership, picking, morphs.
- battle/src/main.ts: controls, point line, round transitions, formation inspection, Scorebook.
- battle/src/types.ts: state contracts, suit identities, nicknames, formal geometry names.

Rust resolves the human/rival exchange before visual playback. The resolved state is saved before animations, so reload cannot apply an action twice. Round advancement is an explicit saved event. Version-2 saves are separate from old hull-combat saves.

Sentinel ranks captures using point-lead gain and original-shape counts; builds and deployments account for special-card exposure. It searches only its own hand and public field. It is a baseline opponent, not a deep-search AI.

## Verify

    cargo test
    cargo test --manifest-path web/engine/Cargo.toml
    cargo clippy --manifest-path web/engine/Cargo.toml
    cargo fmt --check
    cargo fmt --manifest-path web/engine/Cargo.toml --check
    npm run build
    npm run verify
    node web/verify.mjs

Rust fixtures cover 23-point totals, numeric 11–13, mixed-suit fusion, preserved point identities, locked-group stealing, majority flips, atomic invalid moves, final pickup without a sweep, full-deck conservation, and deterministic replay.

Compiled-WASM verification plays 32 full matches (1,536 turns), checks every source identity, no-draw dealing, score calculations, round carryover, and exact replay. The classic 12-match verification remains unchanged.

## Current scope and defaults

Local single-player and browser saves. Remote multiplayer and account synchronization remain future work. Tie handling, playing all three deals, expanded initial point-card exclusions, nicknames, and the two non-special suit palettes are documented defaults for playtesting; the agreed core rules are in docs/ORBIT_RULESET.md.

## Attribution

Play Suipi Core retains its Apache 2.0 license and attribution. The two modified upstream source files mark the Orbit extensions. Classic behavior is protected by its existing tests. Babylon.js is Apache 2.0.

## Quiet arena interface

The battle fills the viewport. Scores and round markers sit at the edges; the arsenal and contextual move confirmation float above the field. Select formations directly in 3D, or open **Field** for labeled keyboard/touch controls and original-identity details. **Scorebook** opens the live points breakdown. The game menu contains the guide, camera reset, sound, new match, and browser full-screen toggle when supported.

Round and match results appear as overlays. The next-deal action preserves the existing points and field. Saved matches use the same v2 format. Retina rendering continues to track display scale, capped at 2×.

### Dragging the 3D hand

Developer mode is available from the game menu → Settings. Enabling it reveals Rewind in the arena and settings. Each rewind restores the previous human decision, including Sentinel’s response, and can cross round boundaries. It replays the saved seed and shortened move history through the rules engine, restoring exact hands, builds, captures, scores, and round results. History remains available after reload, even if Developer mode was previously off. Rewinding is disabled during playback; new moves after a rewind replace the discarded future. The toggle is remembered on this device. Run `npm run verify:rewind` for engine-backed rewind and branching checks.

Hand solids float above their labeled arsenal controls. Drag a solid (or its label) onto a battlefield formation. The hover ring and text preview a legal capture or forge. Every legal drop stages a preview with Confirm / Undo. If capture and forge are both legal, a contextual result picker offers both. No rules state changes and Sentinel does not respond until Confirm. Undo returns the draft to the hand without using a turn. Select several field formations before dragging to use them together.

Dropping on empty table space stages a legal deployment; off-table and illegal drops return the solid without using a turn. The main arena has no persistent Capture / Forge / Deploy / Hint / Clear toolbar. Escape, pointer cancellation, window blur, and resizing cancel an in-progress drag. Camera orbit is disabled while holding a hand solid and resumes afterward. Tap selection and the Field overlay remain available for keyboard and touch access.

Hand anchors are computed at a constant depth in camera space, after the camera applies its current frame of input/inertia. Hand centers and pixel sizes stay fixed through orbit and zoom, including during capture, forge, and deployment animations. Only the played shapes leave their anchors. Hand solids face the viewer in camera space, and their rotating silhouettes are normalized to a consistent pixel footprint for each energy, so orbiting or spinning does not shrink them. Run `npm run verify:hand` (Node 22.18+ or current Node) for the camera-projection regression checks across four desktop/phone viewport and pixel-density combinations.

Dropping on empty table space automatically previews a legal capture if field shapes match the played value or form sums of it. The largest legal capture is selected first; alternative captures remain in the result picker. Only when no capture exists does the drop preview a deployment. Confirm / Undo still applies, and the rules engine validates every option.

Capture presentation is deliberately paced: Astra holds/flashes at the capture site for 250 ms, then travels for 800 ms; Sentinel holds for 450 ms, then travels for 1350 ms. Each captured shape travels directly from its position to the capturing player, without gathering at the center of the table. Sentinel pauses 750 ms, highlights its targets for 550 ms, then resolves and holds the result for 450 ms before input returns. The active pilot's beacon, torus, HUD score, and turn label show whose move is being presented. Round/match completion extinguishes both turn indicators. Reduced-motion mode keeps a steady glow and skips movement while retaining readable turn pauses. Saves still record the completed rules exchange before presentation, so reloads do not repeat a move.

Run `npm run verify:drafts` to check previews and confirmation against the compiled Rust/WASM rules, including deployment restrictions, sum selections, ambiguous captures/builds, and unchanged saves before confirmation.

Closing the scorebook at a completed round or match returns to its result dialog (Escape, backdrop, X, or Back). Closing that result leaves a visible next-deal button on the arena; final matches offer Match result instead. Mid-round scorebook dismissal returns to the arena without changing the deal.

When a new build matches an existing field energy, the drag preview automatically includes that formation in the stack, subject to the core rules and a retained finisher. For example, dropping a 6 onto a 5 with an 11 already on the field previews `(5 + 6) & 11`: one locked 11, with the hand 11 retained. The preview highlights every included formation and explains the stack before Confirm.
