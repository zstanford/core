import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {randomFillSync} from 'node:crypto';
import {dropChoices} from './src/move-draft.ts';
let wasm;
const {instance}=await WebAssembly.instantiate(await readFile(new URL('../dist/engine.wasm',import.meta.url)),{env:{random_bytes:(p,n)=>randomFillSync(new Uint8Array(wasm.memory.buffer,p,n))}});
wasm=instance.exports;
const encoder=new TextEncoder(),decoder=new TextDecoder();
function call(args){const b=encoder.encode(JSON.stringify(args)),p=wasm.allocate(b.length);new Uint8Array(wasm.memory.buffer,p,b.length).set(b);try{const out=wasm.request(p,b.length);return JSON.parse(decoder.decode(new Uint8Array(wasm.memory.buffer,out,wasm.output_len())));}finally{wasm.release(p,b.length);}}
const query=request=>call({type:'battle_choices',...request}).choices;

test('off-table drops never query the rules engine',()=>{
 assert.deepEqual(dropChoices(0,[1],{kind:'outside'},()=>{throw Error('Unexpected query');}),[]);
});
test('empty-table drops ignore selected formations and only offer legal deployment',()=>{
 let legal=0,blocked=0;
 for(let seed=0;seed<8;seed++){
  const state=call({type:'battle_new',seed:Array(32).fill(seed)}).battle,before=call({type:'battle_save'});
  for(const card of state.hand){
   const options=dropChoices(card.index,[0,1],{kind:'field',x:2,z:-1},query);
   assert.deepEqual(options.map(o=>o.choice),query({hand:card.index,floor:[],kind:'discard'}));
   for(const option of options){assert.equal(option.move.kind,'discard');assert.deepEqual(option.move.floor,[]);legal++;}
   if(!options.length)blocked++;
  }
  assert.deepEqual(call({type:'battle_state'}).battle,state);assert.deepEqual(call({type:'battle_save'}),before);
 }
 assert.ok(legal>0&&blocked>0);
});
test('formation previews include capture and fusion alternatives without committing a turn',()=>{
 const found=new Set();
 for(let seed=0;seed<12;seed++){
  const state=call({type:'battle_new',seed:Array(32).fill(seed)}).battle,before=call({type:'battle_save'});
  for(const card of state.hand)for(const target of state.floor){
   const options=dropChoices(card.index,[target.index,target.index],{kind:'formation',index:target.index},query);
   for(const option of options){found.add(option.move.kind);assert.deepEqual(option.move.floor,[target.index]);assert.ok(query(option.move).some(c=>c.annotation===option.move.annotation));}
  }
  assert.deepEqual(call({type:'battle_state'}).battle,state);assert.deepEqual(call({type:'battle_save'}),before);
 }
 assert.ok(found.has('capture')&&found.has('build'));
});
test('preselected sums are retained and confirmation executes exactly one exchange',()=>{
 let committed=false;
 for(let seed=0;seed<16&&!committed;seed++){
  const state=call({type:'battle_new',seed:Array(32).fill(seed)}).battle;
  for(const card of state.hand){
   const options=dropChoices(card.index,[0],{kind:'formation',index:1},query);
   for(const option of options)assert.deepEqual(option.move.floor,[0,1]);
   if(!options.length)continue;
   assert.deepEqual(call({type:'battle_state'}).battle,state);
   const result=call({type:'battle_play',...options[0].move});assert.ok(!result.error,result.error);
   assert.equal(result.battle.turns,state.turns+2);assert.equal(result.battle.hand.length,state.hand.length-1);committed=true;break;
  }
 }
 assert.ok(committed);
});

test('an ambiguous drop preserves both legal outcomes for the confirmation picker',()=>{
 const options=dropChoices(2,[1],{kind:'formation',index:1},request=>[{annotation:request.kind+' fixture',captured:2,target:6,shift:0,sweep:false}]);
 assert.deepEqual(options.map(o=>o.move.kind),['capture','build']);
 assert.deepEqual(options.map(o=>o.move.floor),[[1],[1]]);
});

test('6 on 5 automatically stacks with the field 11 while retaining the hand 11',()=>{
 const seed=Array(32).fill(0);seed[0]=91;
 const state=call({type:'battle_new',seed}).battle,before=call({type:'battle_save'});
 const six=state.hand.find(c=>c.value===6).index;
 const five=state.floor.find(p=>p.value===5).index,eleven=state.floor.find(p=>p.value===11).index;
 assert.equal(query({hand:six,floor:[five],kind:'build'}).length,0,'a separate 11 would duplicate a field value');
 const options=dropChoices(six,[],{kind:'formation',index:five},query,state);
 const option=options.find(o=>o.move.kind==='build'&&o.choice.target===11);
 assert.ok(option,'the full 5 + 6, stacked with 11, must be offered');
 assert.deepEqual(option.autoIncluded,[eleven]);assert.deepEqual(option.move.floor,[five,eleven]);
 assert.deepEqual(call({type:'battle_save'}),before,'preview must not play the move');
 const selected=dropChoices(six,[eleven],{kind:'formation',index:five},query,state).find(o=>o.move.kind==='build'&&o.choice.target===11);
 assert.ok(selected);assert.equal(new Set(selected.move.floor).size,selected.move.floor.length,'manual selection must not include the 11 twice');
 const result=call({type:'battle_play',...option.move});assert.ok(!result.error,result.error);
 const own=result.events[0].state,stack=own.floor.find(p=>p.value===11);
 assert.ok(stack.locked);assert.equal(stack.owner,0);assert.deepEqual(stack.parts.map(c=>c.value).sort((a,b)=>a-b),[5,6,11]);
 assert.ok(own.hand.some(c=>c.value===11),'hand 11 remains as finisher');assert.ok(!own.hand.some(c=>c.index===six));
 assert.equal(own.floor.filter(p=>p.value===11).length,1);assert.ok(!own.floor.some(p=>p.value===5));
});
