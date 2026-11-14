import './styles.css';
import {Arena} from './arena';
import {Rules} from './bridge';
import {shapes,type BattleState,type Choice,type Move,type MoveKind,type BattleEvent} from './types';

const el=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
const rules=new Rules();
const storage='orbit-suipi-battle-v1';
let arena:Arena|undefined,state:BattleState,hand:number|null=null,floor:number[]=[],kind:MoveKind='capture',busy=false,sound=false,loaded=false;
let bannerTimer:ReturnType<typeof setTimeout>;

function save(){
  try{localStorage.setItem(storage,JSON.stringify(rules.call({type:'battle_save'})));el('save-status').textContent='SAVED ON DEVICE';}
  catch{el('save-status').textContent='SAVE UNAVAILABLE';}
}
function select(area:'hand'|'floor',index:number){
  if(!loaded||busy||state.finished)return;
  if(area==='hand')hand=hand===index?null:index;
  else floor=floor.includes(index)?floor.filter(i=>i!==index):[...floor,index];
  renderSelection();
}
function label(v:number){return shapes[v]?.name??`Energy ${v}`;}
function render(){
  for(const [id,index] of [['your',0],['rival',1]] as const){
    el(`${id}-hull`).innerHTML=`${state.hull[index]}<small>/ ${state.maxHull}</small>`;
    const health=el(`${id}-health`);health.setAttribute('aria-valuenow',String(state.hull[index]));(health.firstElementChild as HTMLElement).style.width=`${state.hull[index]/state.maxHull*100}%`;
  }
  el('deck-count').textContent=state.finished?`${state.turns} turns · ${state.deck} reserves left`:`${state.deck} reserve shapes · Turn ${state.turns+1}`;
  el('turn-label').textContent=state.finished?'Skirmish complete':busy?'Resolving combat…':'Your turn · Astra';
  el('arsenal-note').textContent=`${state.otherCount} in rival arsenal`;
  el('formation-count').textContent=`${state.floor.length} ${state.floor.length===1?'FORMATION':'FORMATIONS'} · CONTESTED SPACE`;
  const field=el('field-choices');field.replaceChildren();
  for(const p of state.floor){
    const button=document.createElement('button');button.className=`field-choice ${p.owner===1?'enemy-owned':p.owner===0?'you-owned':''}`;button.dataset.index=String(p.index);button.textContent=`${label(p.value)}${p.locked?' ⊙':''}${p.owner===0?' · yours':p.owner===1?' · rival':''}`;
    button.setAttribute('aria-label',`${label(p.value)} on field, energy ${p.value}${p.parts.length>1?`, formed from ${p.parts.map(label).join(' and ')}`:''}${p.owner!==null?`, ${p.owner===0?'your':'rival'} formation`:''}${p.locked?', locked':''}`);button.disabled=busy||state.finished;button.onclick=()=>select('floor',p.index);field.append(button);
  }
  if(!state.floor.length){const empty=document.createElement('span');empty.className='field-note';empty.textContent=state.finished?'Battlefield empty.':'Clear field. Deploy a shape to begin again.';field.append(empty);}
  const arsenal=el('hand');arsenal.replaceChildren();
  for(const shape of state.hand){
    const button=document.createElement('button');button.className='hand-choice';button.dataset.index=String(shape.index);
    button.setAttribute('aria-label',`${label(shape.value)} in arsenal, energy ${shape.value}, ${shape.value*2} damage`);
    button.innerHTML=`<span class="glyph" aria-hidden="true">${shapes[shape.value].glyph}</span><span class="name">${label(shape.value)}</span><span class="energy">${shape.value} ENERGY · ${shape.value*2} DMG</span>`;
    button.disabled=busy||state.finished;button.onclick=()=>select('hand',shape.index);arsenal.append(button);
  }
  document.querySelectorAll<HTMLButtonElement>('[data-kind], #hint-button, #clear-button').forEach(button=>button.disabled=busy||state.finished);
  el<HTMLButtonElement>('new-button').disabled=busy;
  arena?.sync(state,hand,floor);renderSelection();
  if(state.finished){
    const banner=el('battle-banner');clearTimeout(bannerTimer);banner.className='battle-banner finished';banner.innerHTML=`${state.winner===0?'CORE SHATTERED':state.winner===1?'CORE LOST':'STALEMATE'}<small>${state.winner===0?'You win':state.winner===1?'Sentinel wins':'Equal hull'} · ${state.hull[0]} / ${state.hull[1]} hull</small>`;
  }
}
function renderSelection(){
  for(const button of document.querySelectorAll<HTMLButtonElement>('#hand button'))button.setAttribute('aria-pressed',String(Number(button.dataset.index)===hand));
  for(const button of document.querySelectorAll<HTMLButtonElement>('#field-choices button'))button.setAttribute('aria-pressed',String(floor.includes(Number(button.dataset.index))));
  for(const button of document.querySelectorAll<HTMLButtonElement>('[data-kind]'))button.setAttribute('aria-pressed',String(button.dataset.kind===kind));
  arena?.highlight(hand,floor);
  const options=el('move-options');options.replaceChildren();
  if(state.finished){el('move-title').textContent=state.hull.includes(0)?'A core has fallen.':'Both arsenals exhausted.';el('move-detail').textContent='Start a new skirmish to try a different opening.';return;}
  if(busy){el('move-title').textContent='Energy in motion';el('move-detail').textContent='Hold position. Your move and the rival response are resolving.';return;}
  if(hand===null){el('move-title').textContent='Choose a shape from your arsenal';el('move-detail').textContent=kind==='discard'?'Deploy a shape into contested space.':kind==='build'?'Forge a stronger formation while keeping its matching finisher.':(state.turns===0?'Opening combo: Crown captures Tetra + Cube. Clear the field for a Suipi blast.':'Match equal energy, or combine smaller field formations. A full clear adds +8 damage.');return;}
  const shape=state.hand.find(s=>s.index===hand);if(!shape){hand=null;renderSelection();return;}
  const request={hand,floor,kind};
  const choices=rules.call<{choices:Choice[]}>({type:'battle_choices',...request}).choices;
  el('move-title').textContent=`${label(shape.value)}${floor.length?` + ${floor.length} field ${floor.length===1?'formation':'formations'}`:' selected'}`;
  if(!choices.length){
    el('move-detail').textContent=kind==='discard'?(floor.length?'Deselect field formations to deploy.':'Cannot deploy a matching field energy, or deploy while owning a formation.'):
      !floor.length?'Select the battlefield formations to use.':kind==='capture'?'Selected energies must match your shape, individually or in sums.':'Keep a matching finisher. Locked formations cannot grow; you cannot abandon an owned build.';return;
  }
  for(const choice of choices){
    el('move-title').textContent=kind==='capture'?`${label(shape.value)} strike · ${choice.damage} damage`:kind==='build'?`Forge ${label(choice.target??shape.value)}`:`Deploy ${label(shape.value)}`;
    el('move-detail').textContent=kind==='capture'?(choice.sweep?'Battlefield clear. Includes +8 Suipi blast damage.':'Capture the selected formations and release their energy into the rival core.'):
      kind==='build'?'Your finisher stays in reserve. Sentinel can hijack this formation before your next turn.':'The shape stays on the field. Either player can use it.';
    const button=document.createElement('button');button.className='primary';button.textContent=kind==='capture'?`${choice.sweep?'Suipi strike':'Launch strike'} →`:kind==='build'?`Forge ${label(choice.target??shape.value)} →`:'Deploy shape →';
    button.onclick=()=>void play({...request,annotation:choice.annotation});options.append(button);
  }
}
function announce(event:BattleEvent){
  const banner=el('battle-banner');clearTimeout(bannerTimer);banner.className=`battle-banner ${event.actor===1?'enemy-hit':''}`;
  banner.innerHTML=event.kind==='capture'?`${event.sweep?'SUIPI':event.actor===0?'DIRECT HIT':'RIVAL STRIKE'}<small>−${event.damage} ${event.actor===0?'rival':'your'} hull</small>`:
    `${event.kind==='build'?'FORGED':'DEPLOYED'}<small>${label(event.target??event.value)} ${event.kind==='build'?'formation':'enters the field'}</small>`;
  void banner.offsetWidth;banner.classList.add('show');bannerTimer=setTimeout(()=>{banner.classList.remove('show');banner.replaceChildren();},1300);
}
async function play(move:Move){
  if(busy||state.finished)return;
  try{
    const response=rules.call<{battle:BattleState;events:BattleEvent[]}>({type:'battle_play',...move});
    // Rules finish the complete exchange synchronously. Persist before presentation.
    save();busy=true;hand=null;floor=[];render();
    for(const event of response.events){
      el('turn-label').textContent=event.actor===0?'Astra resolving…':'Sentinel responding…';
      announce(event);await arena?.animate(event);
      state=event.state;el('combat-log').textContent=state.last;render();
    }
    state=response.battle;busy=false;render();
  }catch(error){busy=false;el('combat-log').textContent=error instanceof Error?error.message:'Move could not resolve.';if(loaded){state=rules.call<{battle:BattleState}>({type:'battle_state'}).battle;render();}}
}
el('help-button').onclick=()=>el<HTMLDialogElement>('guide').showModal();
el('new-button').onclick=()=>loaded&&el<HTMLDialogElement>('new-dialog').showModal();
for(const dialog of document.querySelectorAll<HTMLDialogElement>('dialog')){
  dialog.querySelectorAll<HTMLButtonElement>('.close,.close-guide').forEach(button=>button.onclick=()=>dialog.close());
  dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();});
}
el('confirm-new').onclick=()=>{
  if(busy)return;state=rules.call<{battle:BattleState}>({type:'battle_new'}).battle;hand=null;floor=[];kind='capture';clearTimeout(bannerTimer);el('battle-banner').className='battle-banner';el('battle-banner').replaceChildren();el('combat-log').textContent=state.last;render();save();arena?.resetCamera();el<HTMLDialogElement>('new-dialog').close();
};
el('sound-button').onclick=()=>{if(!loaded)return;sound=!sound;arena?.setSound(sound);el('sound-button').textContent=`Sound ${sound?'on':'off'}`;el('sound-button').setAttribute('aria-pressed',String(sound));};
el('camera-button').onclick=()=>arena?.resetCamera();
el('clear-button').onclick=()=>{if(!loaded)return;hand=null;floor=[];renderSelection();};
el('hint-button').onclick=()=>{
  if(!loaded||busy||state.finished)return;const hint=rules.call<{hint:Move|null}>({type:'battle_hint'}).hint;
  if(hint){hand=hint.hand;floor=hint.floor;kind=hint.kind;renderSelection();el('combat-log').textContent='Legal move highlighted. Confirm it when ready.';}
};
for(const button of document.querySelectorAll<HTMLButtonElement>('[data-kind]'))button.onclick=()=>{if(!loaded)return;kind=button.dataset.kind as MoveKind;renderSelection();};
for(const [value,s] of Object.entries(shapes)){const cell=document.createElement('div');cell.innerHTML=`<span class="glyph" aria-hidden="true">${s.glyph}</span><span>${s.name}<small>${value} energy · ${Number(value)*2} damage</small></span>`;el('shape-guide').append(cell);}

try{
  await rules.init();
  let restored=false;
  try{const saved=JSON.parse(localStorage.getItem(storage)??'null');if(saved){state=rules.call<{battle:BattleState}>({type:'battle_restore',...saved}).battle;restored=true;}}catch{/* Invalid saves start a fresh skirmish. */}
  if(!restored)state=rules.call<{battle:BattleState}>({type:'battle_new'}).battle;
  try{arena=new Arena(el<HTMLCanvasElement>('arena'),select);}catch(error){
    console.warn('3D arena unavailable',error);el('loading').innerHTML='<h2>3D unavailable on this browser</h2><p>Combat still works using the labeled field and arsenal controls below. Enable hardware graphics or try another browser for the full arena.</p>';el('loading').classList.add('fallback');
  }
  loaded=true;el('combat-log').textContent=state!.last;render();save();
  if(arena)el('loading').hidden=true;
}catch(error){
  el('loading').innerHTML='<h2>Arena could not load</h2><p>Reload to retry. The battle needs WebAssembly and a browser with hardware graphics support.</p><button class="primary" id="reload">Reload arena</button>';
  el('reload').onclick=()=>location.reload();console.error(error);
}
window.addEventListener('pagehide',event=>{if(!event.persisted)arena?.dispose();});
