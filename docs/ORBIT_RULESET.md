# Orbit: agreed rules and design

Updated November 14, 2026. Implemented as ruleset version 2. This records the agreed rules and explicit prototype defaults.

## Shape set and dealing

- 52 original shapes: four suit identities for each energy from 1 through 13.
- All energies are numeric. Energies 11, 12, and 13 have no face-card matching or addition exceptions.
- Two players receive eight shapes each in each of three rounds.
- Four shared starting shapes are dealt only once, at the beginning.
- No replacement draw after individual turns. The next eight-shape hands are dealt between rounds.
- Every original shape retains its identity for capture counts, suit counts, and point scoring.

## Fusion and Suipi mechanics

- Keep Suipi matching, additive capture, building, stealing, ownership, and locked-group rules.
- A build requires a matching finisher retained in the builder's hand.
- An opponent can raise an unlocked build, subject to the same finisher requirement, or capture a build.
- Grouping equal builds preserves capture energy: two 7-builds form a locked 7, not a 14.
- Locked groups cannot change capture energy, but either player can capture them.
- Builds may reach 13. Numeric 11–13 participate in sums like other energies.
- Legal moves consume one shape from the player's hand. Keep Suipi discard restrictions.
- Additive fusion morphs the source solids into the same geometry as a naturally dealt shape of the resulting energy. Mark ownership separately.
- Formal geometry names belong in the field guide. In-play nicknames and geometry mappings remain subject to exploration.
- Explore spark and sphere treatments for energies 1 and 2; exact mapping is not yet chosen.

## Scoring

| Category | Points |
| --- | ---: |
| Most original shapes captured | 3 |
| Most spade-family shapes captured | 1 |
| Spade-family 2 | 1 |
| Each energy-1 shape, in any suit | 1; four available |
| Diamond-family 10 | 2 |
| Diamond-family 11 | 3 |
| Diamond-family 12 | 4 |
| Diamond-family 13 | 5 |
| Each Suipi sweep | 1 additional |

There are 23 base points, plus sweeps: the original 11 points plus 3 + 4 + 5 for diamond-family 11–13.

Fusion changes representation, not the identities used for scoring. A 3 + 4 build contains two original shapes. Capturing it with a 7 captures three original shapes, including the finisher. A build containing diamond 10 and spade 2 has capture energy 12 and holds three special-card points; it does not become a newly dealt diamond 12 worth four points.

## Suit and point presentation

- Spade-family shapes are gold, supporting the most-spades point and special gold 2.
- Diamond-family shapes use a special, distinguishable treatment; iridescent crystal is a proposed direction, not a final color choice.
- Diamond 10–13 show two, three, four, or five central diamond marks respectively, indicating their point values.
- Gold 2 needs a recognizable special marker for its one point.
- Energy is distinct from point value. Preserve small, camera-facing energy digits with faint resting opacity and brighter selected opacity.
- Suit identity must remain distinct from build ownership. Changing control must not recolor a shape into a different scoring suit.
- Mixed-suit fusion must preserve inspectable source identities and stored special points. Its final surface treatment is still to be designed.
- The other two suit palettes remain undecided.

## Tug-of-war and round results

- Replace separate hull-health combat with one shared battle line driven by the current Suipi point lead, not raw energy or raw captured-card quantity.
- Special captures and sweep points affect the lead. The three-point total-capture majority and one-point gold majority are contested and can change sides as capture counts change.
- A round ends only after both players use all eight shapes. Reaching a visual endpoint does not end it early.
- The battle-line position at the round boundary determines the round winner.
- Battle-line position, captured holdings, shared field shapes, build ownership, and locked groups carry between rounds. No center reset.
- Best of three rounds wins. Because position carries, round outcomes reflect cumulative control; a player may lose ground in a round but still win it if the line remains on their side.

## Prototype defaults for unresolved details

- Play all three deals, even when a side has secured two round wins.
- A centered line at a round boundary draws that round. Most round wins decides the match; equal round wins use the final point lead. An exact tie draws the match.
- The line displays the exact point lead with a visual range of 23 plus total sweeps; reaching an endpoint does not end play.
- Starting field shapes have distinct energies and exclude all special-point shapes, including Crystal 11–13.
- Sweep points apply whenever a move clears the field, including a final capture. Final leftover pickup alone is not a sweep.
- Final leftovers go to the last capturer after round three, before the final round result is recorded.
- Prototype suit palettes: Tide/Clubs teal, Bloom/Hearts pink-violet, Crystal/Diamonds icy blue, Gold/Spades gold.
- Energy 1 uses a spark; energy 2 uses a sphere. Remaining silhouettes and nicknames are initial art choices listed in the field guide.
- Mixed-suit formations use neutral geometry, source-suit arcs, separate ownership rings, and inspectable original identities.

These defaults are open to revision after playtesting.

## Implementation and compatibility

Battle logic lives in web/engine/src/battle.rs. The shared move generator and two upstream source files gained opt-in numeric build ceilings. Classic callers still default to ten and retain their prior behavior. Battle builds opt in to thirteen.

Round advancement is explicit; captures, field formations, and point lead carry forward unchanged. New version-2 saves are stored separately from the earlier hull-combat prototype. Rules resolve before animations, preserving deterministic replay if the page reloads mid-morph.

### Drag-first move confirmation

Drop a hand shape onto formations to preview legal capture/fusion results, or empty table space to preview deployment. Confirm commits one move and begins Sentinel’s reply. Undo cancels only the uncommitted preview, preserving the hand, field, score, and saved match. Ambiguous drops offer their legal outcomes in a contextual result picker. Off-table and illegal drops return to the hand. No persistent action-mode toolbar is shown.

If a proposed build matches a value already on the field, include that equal formation in the stack automatically. A field 5 plus hand 6 stacks with an existing field 11 as a locked 11, while retaining a hand 11 as the finisher. Confirm still precedes any rules-state change.
