#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
export PATH="$HOME/.cargo/bin:$PATH"
# The dependency also emits its own cdylib before the adapter links in custom entropy.
# The final adapter resolves __getrandom_custom and imports only env.random_bytes.
RUSTFLAGS='-C link-arg=--allow-undefined' cargo build --manifest-path web/engine/Cargo.toml --target wasm32-unknown-unknown --release
mkdir -p dist
cp web/index.html web/styles.css web/app.js dist/
cp web/engine/target/wasm32-unknown-unknown/release/suipi_web.wasm dist/engine.wasm
cp LICENSE dist/LICENSE.txt
