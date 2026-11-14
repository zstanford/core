# Orbit: geometric Suipi combat

A solo 3D skirmish against Sentinel, built with Babylon.js, TypeScript, and the existing Rust/WebAssembly rules bridge. The original table is packaged at `/classic/`.

## Run

From the repository root:

```sh
npm ci
rustup target add wasm32-unknown-unknown
npm run build
npm run dev
```

Open the printed local URL. `npm run build` compiles Rust, runs TypeScript checks, then bundles the client and preserves the classic table in the distribution. After the first build, `npm run dev` serves live frontend edits; rebuild after Rust changes.

## Play

Select a solid from your arsenal, then select field formations in 3D or with the labeled buttons. Choose a legal action and confirm it. The rival responds automatically. Drag to orbit, scroll to zoom, or reset the view. `Find a move` highlights a valid action without playing it.

- **Strike:** Suipi capture. Selected field energies must match the arsenal shape, individually or in groups that sum to its energy. Damage is twice the played shape's energy.
- **Forge / lock:** Suipi building and grouping. Keep a matching finisher in your arsenal. A locked formation retains its energy but can still be captured by either side.
- **Deploy:** Suipi discard restrictions apply. A shape cannot duplicate a field energy or abandon a build you own.
- **Suipi:** A full field clear adds eight damage.

Each core starts with 60 hull. There are 24 shapes: four copies of each energy from three through eight. The opening is fixed to teach a Crown capturing Tetra + Cube; the reserve deck is shuffled. A consumed arsenal slot draws one replacement while supplies remain. First core destroyed loses; if both arsenals run out, highest remaining hull wins. Equal remaining hull is a tie.

| Shape | Solid | Energy | Base damage |
| --- | --- | --- | --- |
| Tetra | Tetrahedron | 3 | 6 |
| Cube | Cube | 4 | 8 |
| Prism | Pentagonal prism | 5 | 10 |
| Octa | Octahedron | 6 | 12 |
| Crown | Heptagonal prism | 7 | 14 |
| Nova | Icosahedron | 8 | 16 |

Energy is a fixed gameplay tier, not the number of a solid's faces. Larger displayed solids indicate stronger attacks.

## Architecture

- `web/engine/src/battle.rs`: combat state, health, damage, reserve deck, rival, saves, and battle events. Uses the upstream Suipi `State` and shared adapter's legal move generator; original upstream rules are unchanged.
- `src/bridge.ts`: typed browser-to-WASM transport.
- `src/arena.ts`: procedural geometry, scene picking, orbital camera, neon glow, attack projectiles, forge convergence, shattering particles, and Suipi shockwaves.
- `src/main.ts`: accessible controls, interaction state, ordered event playback, dialogs, local persistence.
- `src/types.ts`: frontend state/event contracts and shape identities.

Rust resolves the complete human/rival exchange before animation begins. The browser saves that resolved exchange, then displays each event in order. Reloading during animation restores the resolved state without applying damage twice. Rendering does not decide move legality or damage.

Sentinel greedily ranks legal captures, builds, and deployments using its own arsenal and the public battlefield. It does not inspect the human arsenal. This is a baseline opponent, not advanced strategy.

## Verification

```sh
cargo test
cargo test --manifest-path web/engine/Cargo.toml
cargo clippy --manifest-path web/engine/Cargo.toml
cargo fmt --manifest-path web/engine/Cargo.toml --check
npm run build
npm run verify
node web/verify.mjs
```

The Rust tests include card conservation and deterministic replay across sixteen combat seeds. Compiled-WASM verification runs 32 battles and checks illegal moves, damage, turn ownership, completion, exact replay after every exchange, and hijacking an exposed build. The original 12-match table verification remains available.

## Prototype limits

The battle is local and single-player. Saved state lives in browser storage; no account synchronization or remote multiplayer exists. Balance, energy tiers, and damage are initial design choices. Sound starts muted and can be enabled. Reduced-motion preferences skip scene movement and shorten event playback. Background rendering pauses. If hardware 3D fails, the same combat rules remain playable through labeled controls.

## License

Play Suipi Core retains its Apache 2.0 license and attribution. Babylon.js is Apache 2.0. The original upstream gameplay source remains unchanged; the battle is an adapter extension.
