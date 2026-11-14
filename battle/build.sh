#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
export PATH="$HOME/.cargo/bin:$PATH"
RUSTFLAGS='-C link-arg=--allow-undefined' cargo build --manifest-path web/engine/Cargo.toml --target wasm32-unknown-unknown --release
mkdir -p battle/public/classic
cp web/engine/target/wasm32-unknown-unknown/release/suipi_web.wasm battle/public/engine.wasm
cp LICENSE battle/public/LICENSE.txt
cp web/index.html web/styles.css web/app.js battle/public/classic/
cp battle/public/engine.wasm battle/public/LICENSE.txt battle/public/classic/
npm run check
npm run build:client
