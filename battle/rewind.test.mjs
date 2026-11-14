import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {randomFillSync} from 'node:crypto';
import {rewindCount,rewindSave} from './src/rewind.ts';
let wasm;
const {instance}=await WebAssembly.instantiate(await readFile(new URL('../dist/engine.wasm',import.meta.url)),{env:{random_bytes:(p,n)=>randomFillSync(new Uint8Array(wasm.memory.buffer,p,n))}});
wasm=instance.exports;
const encoder=new TextEncoder(),decoder=new TextDecoder();
function call(args){
 const b=encoder.encode(JSON.stringify(args)),p=wasm.allocate(b.length);new Uint8Array(wasm.memory.buffer,p,b.length).set(b);
 try{const out=wasm.request(p,b.length),result=JSON.parse(decoder.decode(new Uint8Array(wasm.memory.buffer,out,wasm.output_len())));assert.ok(!result.error,result.error);return result;}
 finally{wasm.release(p,b.length);}
}

test('new matches cannot rewind; preparing rewind does not modify the saved history',()=>{
 call({type:'battle_new',seed:Array(32).fill(0)});
 const saved=call({type:'battle_save'});
 assert.equal(rewindCount(saved),0);assert.equal(rewindSave(saved),null);
 call({type:'battle_play',...call({type:'battle_hint'}).hint});
 const played=call({type:'battle_save'}),copy=structuredClone(played),rewound=rewindSave(played);
 assert.deepEqual(played,copy);assert.deepEqual(rewound,saved);
});

test('rewind restores exact previous decisions through all rounds and survives reload',()=>{
 let state=call({type:'battle_new',seed:Array(32).fill(1)}).battle;
 const checkpoints=[];
 while(!state.finished){
  if(state.roundOver){
   state=call({type:'battle_next'}).battle;
   const saved=call({type:'battle_save'});
   const previous=call({type:'battle_restore',...rewindSave(saved)}).battle;
   assert.deepEqual(previous,checkpoints.at(-1),'rewinding after a deal restores the last playable decision');
   state=call({type:'battle_restore',...saved}).battle;
  }
  checkpoints.push(structuredClone(state));
  const result=call({type:'battle_play',...call({type:'battle_hint'}).hint});
  assert.ok(result.events.some(e=>e.actor===1));state=result.battle;
 }
 let saved=JSON.parse(JSON.stringify(call({type:'battle_save'})));
 assert.equal(rewindCount(saved),24);
 for(let i=checkpoints.length-1;i>=0;i--){
  saved=rewindSave(saved);assert.ok(saved);
  const restored=call({type:'battle_restore',...saved}).battle;
  assert.deepEqual(restored,checkpoints[i],'hand, field, scoring, rounds and last move must all match');
  assert.equal(rewindCount(saved),i);
  assert.deepEqual(call({type:'battle_save'}),saved);
 }
 assert.equal(rewindSave(saved),null);
});

test('a rewound match accepts a different move and persists the new branch',()=>{
 const initial=call({type:'battle_new',seed:Array(32).fill(0)}).battle;
 const first=call({type:'battle_hint'}).hint;
 call({type:'battle_play',...first});
 const previous=rewindSave(call({type:'battle_save'}));call({type:'battle_restore',...previous});
 let alternative;
 for(const card of initial.hand){
  for(const floor of [[],...initial.floor.map(p=>[p.index])]){
   for(const kind of floor.length?['capture','build']:['discard']){
    const request={hand:card.index,floor,kind};
    const choice=call({type:'battle_choices',...request}).choices.find(c=>c.annotation!==first.annotation);
    if(choice){alternative={...request,annotation:choice.annotation};break;}
   }
   if(alternative)break;
  }
  if(alternative)break;
 }
 assert.ok(alternative);
 const state=call({type:'battle_play',...alternative}).battle,saved=call({type:'battle_save'});
 assert.equal(saved.moves.length,1);assert.equal(saved.moves[0].annotation,alternative.annotation);
 assert.deepEqual(call({type:'battle_restore',...saved}).battle,state);
});
