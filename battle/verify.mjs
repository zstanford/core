import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomFillSync} from 'node:crypto';

let wasm;
const {instance}=await WebAssembly.instantiate(await readFile(new URL('../dist/engine.wasm',import.meta.url)),{env:{random_bytes:(ptr,len)=>randomFillSync(new Uint8Array(wasm.memory.buffer,ptr,len))}});
wasm=instance.exports;
const encoder=new TextEncoder(),decoder=new TextDecoder();
function call(args){
  const bytes=encoder.encode(JSON.stringify(args)),ptr=wasm.allocate(bytes.length);
  new Uint8Array(wasm.memory.buffer,ptr,bytes.length).set(bytes);
  try{const out=wasm.request(ptr,bytes.length);return JSON.parse(decoder.decode(new Uint8Array(wasm.memory.buffer,out,wasm.output_len())));}finally{wasm.release(ptr,bytes.length);}
}
let totalTurns=0,strikes=0,forges=0,deploys=0,sweeps=0;
for(let seed=0;seed<32;seed++){
  let state=call({type:'battle_new',seed:Array(32).fill(seed)}).battle;
  const invalid=call({type:'battle_play',hand:0,floor:[1],kind:'capture',annotation:'*B&1'});
  assert.ok(invalid.error);assert.deepEqual(call({type:'battle_state'}).battle,state);
  let turns=0;
  while(!state.finished){
    const {hint}=call({type:'battle_hint'});assert.ok(hint,'A legal move must exist');
    const before=state;
    const result=call({type:'battle_play',...hint});assert.ok(!result.error,result.error);
    state=result.battle;
    for(const event of result.events){
      if(event.kind==='capture')strikes++;
      if(event.kind==='build')forges++;
      if(event.kind==='discard')deploys++;
      if(event.sweep)sweeps++;
      assert.equal(event.damage,event.kind==='capture'?event.value*2+(event.sweep?8:0):0);
      assert.ok(event.state.hull.every(h=>h>=0&&h<=60));
    }
    assert.ok(state.turns>before.turns);
    if(!state.finished) assert.equal(state.turn,0,'Rival must finish its response before human input');
    const save=call({type:'battle_save'});
    assert.deepEqual(call({type:'battle_restore',...save}).battle,state,'Every exchange replays exactly');
    assert.ok(++turns<=24,'Finite deck must terminate battle');
  }
  const save=call({type:'battle_save'});
  const again=call({type:'battle_play',...call({type:'battle_hint'}).hint});assert.ok(again.error);
  assert.deepEqual(call({type:'battle_restore',...save}).battle,state);
  totalTurns+=state.turns;
}
// Force an opening forge and prove the rival can steal it using the same rules.
call({type:'battle_new',seed:Array(32).fill(1)});
const args={hand:0,floor:[1],kind:'build'};
const option=call({type:'battle_choices',...args}).choices[0];
const forge=call({type:'battle_play',...args,annotation:option.annotation});
assert.equal(forge.events[0].kind,'build');assert.equal(forge.events[1].kind,'capture');assert.equal(forge.battle.hull[0],46);
forges++;
console.log(JSON.stringify({battles:32,turns:totalTurns,strikes,forges,deploys,sweeps,checks:'damage, turn ownership, illegal moves, build hijack, battle completion, exact save/replay'},null,2));
