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

Hand solids float above their labeled arsenal controls. Drag a solid (or its label) onto a battlefield formation. The hover ring and text preview a legal capture or forge. The active Capture/Forge action takes priority; if that action is unavailable, the other legal action is offered. A unique legal drop commits the move; multiple legal formations leave the choices visible for confirmation. Select several field formations before dragging to use them together.

Empty-space and illegal drops return the solid without using a turn. Escape, pointer cancellation, window blur, and resizing cancel an in-progress drag. Camera orbit is disabled while holding a hand solid and resumes afterward. Tap selection and the Field overlay remain available for keyboard and touch access.
