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

test('empty-field drops capture matching values and sums instead of deploying',()=>{
 const seed=Array(32).fill(0);seed[0]=91;
 const state=call({type:'battle_new',seed}).battle,before=call({type:'battle_save'});
 for(const [value,targets] of [[7,[3,4]],[11,[11]]]){
  const card=state.hand.find(c=>c.value===value);
  const options=dropChoices(card.index,[],{kind:'field',x:2,z:-1},query,state);
  assert.ok(options.length);assert.ok(options.every(o=>o.move.kind==='capture'));
  assert.deepEqual(options[0].move.floor.map(i=>state.floor.find(p=>p.index===i).value).sort((a,b)=>a-b),targets);
  assert.ok(query(options[0].move).some(c=>c.annotation===options[0].move.annotation));
 }
 assert.deepEqual(call({type:'battle_save'}),before,'automatic capture remains a preview');
 const card=state.hand.find(c=>c.value===7),option=dropChoices(card.index,[],{kind:'field',x:0,z:0},query,state)[0];
 const result=call({type:'battle_play',...option.move});assert.ok(!result.error,result.error);
 assert.equal(result.events[0].kind,'capture');assert.equal(result.events[0].captured,3);
});

test('automatic captures include multiple legal groups and prefer the most shapes',()=>{
 let found=false;
 for(let seed=0;seed<30&&!found;seed++){
  const state=call({type:'battle_new',seed:Array(32).fill(seed)}).battle;
  for(const card of state.hand){
   const options=dropChoices(card.index,[],{kind:'field',x:0,z:0},query,state);
   if(options[0]?.move.kind!=='capture')continue;
   assert.ok(options.every(o=>o.choice.captured<=options[0].choice.captured));
   const sum=options[0].move.floor.reduce((n,i)=>n+state.floor.find(p=>p.index===i).value,0);
   if(sum<=card.value)continue;
   found=true;
   assert.ok(query(options[0].move).some(c=>c.annotation===options[0].move.annotation));
   break;
  }
 }
 assert.ok(found,'must exercise several disjoint capture groups');
});

test('empty-field drop still deploys when no capture exists',()=>{
 const seed=Array(32).fill(0);seed[0]=91;
 const state=call({type:'battle_new',seed}).battle,card=state.hand.find(c=>c.value===6);
 const options=dropChoices(card.index,[],{kind:'field',x:0,z:0},query,state);
 assert.ok(options.length);assert.ok(options.every(o=>o.move.kind==='discard'));
});

test('a direct equal-value drop captures even if an unrelated formation was selected',()=>{
 const seed=Array(32).fill(0);seed[0]=91;
 const state=call({type:'battle_new',seed}).battle,before=call({type:'battle_save'});
 const card=state.hand.find(c=>c.value===11),target=state.floor.find(p=>p.value===11),unrelated=state.floor.find(p=>p.value===5);
 assert.equal(query({hand:card.index,floor:[unrelated.index,target.index],kind:'capture'}).length,0);
 const options=dropChoices(card.index,[unrelated.index],{kind:'formation',index:target.index},query,state);
 assert.equal(options[0]?.move.kind,'capture');assert.deepEqual(options[0].move.floor,[target.index]);
 assert.deepEqual(call({type:'battle_save'}),before);
 const result=call({type:'battle_play',...options[0].move});assert.ok(!result.error,result.error);
 assert.equal(result.events[0].kind,'capture');assert.equal(result.events[0].captured,2);
 assert.ok(result.events[0].state.floor.some(p=>p.value===5),'unrelated selection stays on the field');
});

test('equal-value drops keep a valid selected multi-group capture',()=>{
 let found=false;
 for(let seed=0;seed<80&&!found;seed++){
  const state=call({type:'battle_new',seed:Array(32).fill(seed)}).battle;
  for(const card of state.hand){
   const target=state.floor.find(p=>p.value===card.value);if(!target)continue;
   const selected=state.floor.filter(p=>p.index!==target.index).map(p=>p.index),floor=[...selected,target.index];
   if(!query({hand:card.index,floor,kind:'capture'}).length)continue;
   const options=dropChoices(card.index,selected,{kind:'formation',index:target.index},query,state);
   assert.equal(options[0].move.kind,'capture');assert.deepEqual(options[0].move.floor,floor);found=true;break;
  }
 }
 assert.ok(found);
});
