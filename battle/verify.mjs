import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomFillSync} from 'node:crypto';
let wasm;
const {instance}=await WebAssembly.instantiate(await readFile(new URL('../dist/engine.wasm',import.meta.url)),{env:{random_bytes:(p,n)=>randomFillSync(new Uint8Array(wasm.memory.buffer,p,n))}});
wasm=instance.exports;
const encoder=new TextEncoder(),decoder=new TextDecoder();
function call(args){const b=encoder.encode(JSON.stringify(args)),p=wasm.allocate(b.length);new Uint8Array(wasm.memory.buffer,p,b.length).set(b);try{const out=wasm.request(p,b.length);return JSON.parse(decoder.decode(new Uint8Array(wasm.memory.buffer,out,wasm.output_len())));}finally{wasm.release(p,b.length);}}
function cardPoints(c){return c.value===1?1:c.suit===1?({10:2,11:3,12:4,13:5}[c.value]??0):c.suit===3&&c.value===2?1:0;}
function verifyScore(s){
 for(const actor of [0,1]){
  const cards=s.capturedCards[actor],other=s.capturedCards[1-actor],gold=cards.filter(c=>c.suit===3).length,otherGold=other.filter(c=>c.suit===3).length;
  const expected=cards.reduce((n,c)=>n+cardPoints(c),0)+s.sweeps[actor]+(cards.length>other.length?3:0)+(gold>otherGold?1:0);
  assert.equal(s.points[actor],expected);assert.equal(s.scores[actor].gold,gold);assert.equal(s.captures[actor],cards.length);
 }
 assert.equal(s.lead,s.points[0]-s.points[1]);
 for(const p of s.floor){assert.equal(p.points,p.parts.reduce((n,c)=>n+cardPoints(c),0));const sum=p.parts.reduce((n,c)=>n+c.value,0);assert.equal(p.locked?sum%p.value:sum,p.locked?0:p.value);for(const c of p.parts)assert.equal(c.points,cardPoints(c));}
}
let turns=0,captures=0,forges=0,sweeps=0,highTierCaptures=0,maxExchange=0;
const start=performance.now();
for(let seed=0;seed<32;seed++){
 let s=call({type:'battle_new',seed:Array(32).fill(seed)}).battle;
 assert.equal(s.hand.length,8);assert.equal(s.otherCount,8);assert.equal(s.deck,32);assert.equal(s.floor.length,4);
 assert.ok(s.floor.every(p=>p.points===0));assert.equal(new Set(s.floor.map(p=>p.value)).size,4);
 const invalid=call({type:'battle_play',hand:99,floor:[],kind:'capture',annotation:'invalid'});assert.ok(invalid.error);assert.deepEqual(call({type:'battle_state'}).battle,s);
 assert.ok(call({type:'battle_next'}).error);
 while(!s.finished){
  verifyScore(s);
  if(s.roundOver){
   const before=s,next=call({type:'battle_next'});assert.ok(!next.error,next.error);s=next.battle;
   assert.deepEqual(s.floor,before.floor);assert.deepEqual(s.points,before.points);assert.deepEqual(s.capturedCards,before.capturedCards);assert.equal(s.hand.length,8);assert.equal(s.otherCount,8);assert.equal(s.round,before.round+1);
  }else{
   const time=performance.now(),hint=call({type:'battle_hint'}).hint;assert.ok(hint,'A legal move must exist');
   const result=call({type:'battle_play',...hint});assert.ok(!result.error,result.error);maxExchange=Math.max(maxExchange,performance.now()-time);
   const before=s;s=result.battle;
   assert.equal(s.hand.length,before.hand.length-1);assert.equal(s.deck,before.deck,'No replacement draws');assert.equal(s.turns,before.turns+2);
   for(const e of result.events){if(e.kind==='capture'){captures++;if(e.value>=11)highTierCaptures++;}if(e.kind==='build')forges++;if(e.sweep)sweeps++;assert.equal(e.shift,(e.state.lead-(e===result.events[0]?before.lead:result.events[0].state.lead))*(e.actor===0?1:-1)||0);}
  }
  const save=call({type:'battle_save'});assert.equal(save.version,2);assert.deepEqual(call({type:'battle_restore',...save}).battle,s);
 }
 verifyScore(s);assert.equal(s.turns,48);assert.equal(s.rounds.length,3);assert.equal(s.deck,0);assert.equal(s.hand.length,0);assert.equal(s.otherCount,0);assert.equal(s.floor.length,0);
 const ids=s.capturedCards.flat().map(c=>c.id).sort((a,b)=>a-b);assert.deepEqual(ids,Array.from({length:52},(_,i)=>i));
 assert.ok(s.points[0]+s.points[1]-s.sweeps[0]-s.sweeps[1]<=23);
 assert.ok(call({type:'battle_play'}).error);assert.ok(call({type:'battle_restore',version:1,seed:Array(32).fill(0),moves:[]}).error);assert.deepEqual(call({type:'battle_state'}).battle,s);
 turns+=s.turns;
}
console.log(JSON.stringify({matches:32,turns,captures,forges,sweeps,highTierCaptures,maxExchangeMs:Math.round(maxExchange),elapsedMs:Math.round(performance.now()-start),checks:'52 identities, 8-shape deals, 48 turns, no draws, 23-point scoring, round carryover, exact replay, numeric 11–13'},null,2));
