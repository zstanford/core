# Suipi fork assessment

Reviewed: October 13, 2026.

## Source and workspace

- Upstream: https://github.com/playsuipi/core
- Fork: https://github.com/zstanford/core
- Baseline commit: `d8e8c7c` (`main`).
- Local `origin` points to the fork; `upstream` points to Play Suipi.
- Apache 2.0 license: retain the license and applicable attribution notices; mark modified upstream files when distributing changes.

## What the fork provides

The Rust library implements two-player Suipi: dealing, captures, builds, groups, ownership restrictions, sweeps, remaining-card pickup, and scoring. It includes a terminal game, a C-compatible API, C and Go examples, and unit and integration tests. It does not contain a graphical app, a computer opponent, or an online room service.

The public Play Suipi organization also provides a Flutter wrapper. Its full app and online service were not listed among the public organization repositories during this review.

## Computer opponent

There is no bot or legal-move generator in this repository. Add candidate move generation and validate candidates against a cloned state before choosing a move. Strategy should use only the bot's hand and public information, even though the internal state contains both hands and the deck.

## Rule changes

Rules are implemented directly in code, rather than through a rule configuration object:

- `src/state.rs`: eight-card hands, four initial floor cards, unique initial values, exclusion of point cards from the initial floor, build ownership and discard restrictions.
- `src/pile.rs`: build, group, and capture semantics.
- `src/score.rs`: point categories and sweep scoring.
- `src/game.rs`: turn progression, dealing, and game completion.
- `src/api.rs`: fixed arrays for two eight-card hands and scorecards for two games.
- `src/main.rs`: terminal match ends after two games.

Small rule changes are practical. Configurable hand sizes, four-player teams, or alternate match lengths require broader changes because the API also assumes the existing format.

Sweep scores use the difference between players' sweep counts, awarded to the player with more sweeps. That preserves the score margin but differs from displaying each player's own sweep points. Confirm the desired display and scoring before changing it.

## Browser and online integration

The fork includes `poc/wasm`, an experimental branch adding WebAssembly-related dependencies and annotations. Treat it as a starting experiment; browser support has not been verified.

For online play, retain the full state on the server and send each player only their own hand and public state. The current `read_hands` function returns both hands. A server adapter must authenticate the acting player, validate and apply the move, and advance the turn as one operation; the current API separates move application from turn advancement.

## Proposed implementation order

1. Install Rust and run the existing tests to establish a baseline.
2. Verify a browser bridge using the upstream WebAssembly experiment, or run Rust behind a server API.
3. Build a table interface and same-device play with hidden hands between turns.
4. Add legal-move generation and a computer opponent.
5. Add private online rooms, invite links, and reconnect support.
6. Add the user's specific gameplay changes, with targeted regression tests and rule presets where appropriate.

The intended product supports computer play, same-device play, and online friends. Play Suipi's current rules are the initial baseline. Specific gameplay changes remain to be defined.

## Verification status

Fork creation, repository checkout, remote configuration, and source inspection completed. Rust 1.99.0 and the WebAssembly target are installed. The original 47 tests, native build, and formatting checks pass. Clippy reports one existing upstream style warning. Source gameplay remains unchanged.

A browser adapter and same-device table now live in `web/`. Four adapter tests pass. Compiled WebAssembly verification completed 12 matches (1,152 turns), including captures, builds, discards, sweeps, card conservation, saved replay, and score totals. Browser capture and handoff were checked interactively. Computer opponents and online rooms remain future work.
