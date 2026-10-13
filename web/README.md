# Suipi browser table

Same-device, two-player Suipi using the forked Rust rules engine. Supports captures (including sums and multiple sets), builds, locked groups, discards, sweeps, alternating dealers, two-game match scores, and local save/replay. Hands are removed from the rendered page during device handoff.

## Run locally

From the repository root:

```sh
rustup target add wasm32-unknown-unknown
sh web/build.sh
python3 -m http.server 4173 --bind 127.0.0.1 --directory dist
```

Open http://127.0.0.1:4173/. Tap **Show my hand**, select a hand card, select table cards, and choose **Capture**, **Build / group**, or **Drop**. The adapter previews legal moves. Confirm a move to end the turn and hide the next hand.

**Scores** shows provisional category points and completed match totals. **New match** replaces the current saved match after confirmation. Saves use browser local storage and replay the shuffle seed and validated moves.

## Verify

```sh
cargo test
cargo build
cargo clippy
cargo fmt --check
cargo test --manifest-path web/engine/Cargo.toml
cargo clippy --manifest-path web/engine/Cargo.toml
cargo fmt --manifest-path web/engine/Cargo.toml --check
sh web/build.sh
node --check web/app.js
node web/verify.mjs
```

The WebAssembly verification plays 12 deterministic matches (1,152 turns), checking card conservation, captures/builds/discards, saved-game replay, and completed score totals. The only WASM import is `env.random_bytes`, backed by browser cryptographic randomness.

## Layout and implementation

- `index.html`, `styles.css`, `app.js`: responsive table and controls, without a frontend framework.
- `engine/`: Rust adapter depending on the upstream engine via a path dependency. Original engine source remains unchanged.
- `build.sh`: compiles WebAssembly and packages static assets into the root `dist/` directory.
- `verify.mjs`: exercises the compiled adapter using Node.js.

The upstream library also emits a standalone C-compatible dynamic library during compilation. The browser build allows unresolved imports while that intermediate library is linked; the final adapter supplies the custom randomness hook. Verification checks the final WASM import list.

This first table provides same-device play. Computer opponents and remote multiplayer remain planned. Same-device hand hiding is for ordinary pass-and-play; game state and the replay seed remain accessible to someone inspecting browser storage.

## Attribution

Game rules are provided by [Play Suipi Core](https://github.com/playsuipi/core), Copyright 2024 Play Suipi LLC, under Apache 2.0. Its license is preserved at the repository root and copied into the browser distribution. The table includes a visible attribution link. No original engine source files were modified.
