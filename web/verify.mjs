import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomFillSync } from 'node:crypto';

let wasm;
const { instance } = await WebAssembly.instantiate(await readFile(new URL('../dist/engine.wasm', import.meta.url)), {
  env: { random_bytes: (ptr, len) => randomFillSync(new Uint8Array(wasm.memory.buffer, ptr, len)) },
});
wasm = instance.exports;
const encoder = new TextEncoder(), decoder = new TextDecoder();
function request(input) {
  const bytes = encoder.encode(JSON.stringify(input));
  const ptr = wasm.allocate(bytes.length);
  new Uint8Array(wasm.memory.buffer, ptr, bytes.length).set(bytes);
  try {
    const result = wasm.request(ptr, bytes.length);
    return JSON.parse(decoder.decode(new Uint8Array(wasm.memory.buffer, result, wasm.output_len())));
  } finally { wasm.release(ptr, bytes.length); }
}

const imports = WebAssembly.Module.imports(await WebAssembly.compile(await readFile(new URL('../dist/engine.wasm', import.meta.url))));
assert.deepEqual(imports.map(i => `${i.module}.${i.name}`), ['env.random_bytes']);

let matches = 0, captures = 0, builds = 0, drops = 0, sweeps = 0;
for (let seed = 0; seed < 12; seed++) {
  let state = request({ type:'restore', seed:Array(32).fill(seed), moves:[] }).state;
  let turns = 0;
  while (!state.finished) {
    assert.equal(state.deck + state.hand.length + state.otherCount + state.captured + state.otherCaptured + state.floor.reduce((n,p) => n+p.cards.length,0),52,'Card conservation');
    let selected;
    // Exercise captures and builds through exactly the browser adapter API.
    for (const kind of turns % 4 === 0 ? ['build','capture','discard'] : ['capture','discard','build']) {
      const masks = kind === 'discard' ? [0] : Array.from({length:(1<<state.floor.length)-1},(_,i)=>i+1);
      for (const hand of state.hand) {
        for (const mask of masks) {
          const floor = state.floor.filter((_,i) => mask & (1<<i)).map(p => p.index);
          const sum = state.floor.filter((_,i) => mask & (1<<i)).reduce((n,p)=>n+p.value,0);
          if (kind === 'capture' && sum % (hand.card % 13 + 1) !== 0) continue;
          if (kind === 'build' && sum + hand.card % 13 + 1 > 10 && floor.length > 3) continue;
          const args = {type:'choices',hand:hand.index,floor,kind};
          const options = request(args).choices;
          if (options.length) { selected = {...args,type:'play',annotation:options[0].annotation}; break; }
        }
        if (selected) break;
      }
      if (selected) break;
    }
    assert.ok(selected, `No selectable move at seed ${seed}, turn ${turns}`);
    const before = state;
    const result = request(selected);
    assert.ok(!result.error,result.error);
    state = result.state;
    if(selected.kind === 'capture') captures++;
    if(selected.kind === 'build') builds++;
    if(selected.kind === 'discard') drops++;
    if(result.sweep) sweeps++;
    assert.equal(state.moves.length,before.moves.length+1);
    if (turns % 11 === 0) {
      const saved = request({type:'save'});
      assert.deepEqual(request({type:'restore',...saved}).state,state,'Save and replay equality');
    }
    assert.ok(++turns <= 96,'Two games require 96 hand-card plays');
  }
  assert.equal(turns,96);
  assert.equal(state.games.length,2);
  assert.ok(state.games.every(g=>g.complete));
  assert.equal(state.hand.length,0);
  assert.equal(state.totals[0], state.games.reduce((n,g)=>n+g.points[0],0));
  assert.equal(state.totals[1], state.games.reduce((n,g)=>n+g.points[1],0));
  const saved = request({type:'save'});
  assert.deepEqual(request({type:'restore',...saved}).state,state,'Completed match replay');
  matches++;
}
console.log(JSON.stringify({matches,turns:matches*96,captures,builds,drops,sweeps,checks:'WASM imports, card conservation, move legality, saved replay, completed scores'},null,2));
