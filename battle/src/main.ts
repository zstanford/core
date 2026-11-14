import './styles.css';
import {Arena} from './arena';
import {Rules} from './bridge';
import {shapes,suits,shapeLabel,pointMarks,type BattleState,type Choice,type Move,type MoveKind,type BattleEvent,type ShapeCard} from './types';

const el=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
const rules=new Rules();
const storage='orbit-suipi-battle-v2';
let arena:Arena|undefined,state:BattleState,hand:number|null=null,floor:number[]=[],kind:MoveKind='capture',busy=false,sound=false,loaded=false;
let bannerTimer:ReturnType<typeof setTimeout>;
const label=(v:number)=>shapes[v]?.name??'Energy '+v;
const signed=(n:number)=>(n>0?'+':'')+n;
function save(){try{localStorage.setItem(storage,JSON.stringify(rules.call({type:'battle_save'})));el('save-status').textContent='SAVED ON DEVICE';}catch{el('save-status').textContent='SAVE UNAVAILABLE';}}
function select(area:'hand'|'floor',index:number){
 if(!loaded||busy||state.finished||state.roundOver)return;
 if(area==='hand')hand=hand===index?null:index;else floor=floor.includes(index)?floor.filter(i=>i!==index):[...floor,index];
 renderSelection();
}
function cardDescription(c:ShapeCard){return shapeLabel(c)+' · '+c.value+' energy'+(c.points?' · '+c.points+' special '+(c.points===1?'point':'points'):'');}
function render(){
 for(const [id,i] of [['your',0],['rival',1]] as const){
  el(id+'-points').innerHTML=state.points[i]+'<small>pts</small>';
  el(id+'-counts').textContent=state.captures[i]+' captured · '+state.scores[i].gold+' gold';
 }
 el('deck-count').textContent='Round '+state.round+' of 3 · '+state.deck+' in reserve';
 el('turn-label').textContent=state.finished?'Match complete':busy?'Resolving…':state.roundOver?'Round '+state.round+' complete':'Your turn · Astra';
 el('arsenal-note').textContent=state.hand.length+' yours · '+state.otherCount+' rival · no draws';
 el('formation-count').textContent=state.floor.length+' FORMATIONS · '+state.floor.reduce((n,p)=>n+p.parts.length,0)+' ORIGINAL SHAPES';
 const limit=23+state.sweeps[0]+state.sweeps[1],position=50+state.lead/limit*43;
 el('lead-label').textContent=state.lead===0?'Even ground':(state.lead>0?'Astra':'Sentinel')+' leads by '+Math.abs(state.lead);
 el('line-marker').style.left=position+'%';
 const pull=el('line-pull');pull.style.left=Math.min(50,position)+'%';pull.style.width=Math.abs(position-50)+'%';pull.style.background=state.lead>=0?'#54f2da':'#ff67b8';
 const meter=el('battle-line');meter.setAttribute('aria-valuemin',String(-limit));meter.setAttribute('aria-valuemax',String(limit));meter.setAttribute('aria-valuenow',String(state.lead));meter.setAttribute('aria-valuetext',el('lead-label').textContent??'');
 const results=el('round-results');results.replaceChildren();
 for(let r=1;r<=3;r++){
  const result=state.rounds.find(x=>x.round===r),pill=document.createElement('span');
  pill.className='round-pill '+(result?result.winner===0?'won':result.winner===1?'lost':'draw':r===state.round?'current':'');
  pill.textContent='R'+r+' '+(result?(result.winner===null?'Draw':result.winner===0?'Astra':'Sentinel')+' '+result.points.join('–'):r===state.round?'In play':'Waiting');results.append(pill);
 }
 const field=el('field-choices');field.replaceChildren();
 for(const p of state.floor){
  const button=document.createElement('button');button.className='field-choice';button.dataset.index=String(p.index);button.style.setProperty('--suit',p.suit===null?'#aab5d6':suits[p.suit].color);
  button.textContent=(p.suit===null?'◈':suits[p.suit].glyph)+' '+label(p.value)+' '+p.value+(p.locked?' ⊙':'')+(p.owner===0?' · A':p.owner===1?' · S':'');
  button.setAttribute('aria-label',label(p.value)+' on field, energy '+p.value+', '+(p.suit===null?'mixed suits':suits[p.suit].name)+(p.owner!==null?', '+(p.owner===0?'your':'rival')+' build':'')+(p.locked?', locked':''));
  button.title=p.parts.map(cardDescription).join('\n');button.disabled=busy||state.finished||state.roundOver;button.onclick=()=>select('floor',p.index);field.append(button);
 }
 if(!state.floor.length){const empty=document.createElement('span');empty.className='field-note';empty.textContent=state.finished?'Battlefield cleared.':'Clear field. Next player deploys.';field.append(empty);}
 const arsenal=el('hand');arsenal.replaceChildren();
 for(const shape of state.hand){
  const button=document.createElement('button');button.className='hand-choice';button.dataset.index=String(shape.index);button.style.setProperty('--suit',suits[shape.suit].color);
  button.setAttribute('aria-label',cardDescription(shape)+' in arsenal');
  button.innerHTML='<span class="glyph" aria-hidden="true">'+shapes[shape.value].glyph+'</span><span class="name">'+label(shape.value)+' <span class="suit-glyph">'+suits[shape.suit].glyph+'</span></span><span class="energy">'+shape.value+' ENERGY'+(shape.points?' · '+shape.points+' PT'+(shape.points===1?'':'S'):'')+'</span><span class="point-marks">'+pointMarks([shape])+'</span>';
  button.disabled=busy||state.finished||state.roundOver;button.onclick=()=>select('hand',shape.index);arsenal.append(button);
 }
 document.querySelectorAll<HTMLButtonElement>('[data-kind],#hint-button,#clear-button').forEach(b=>b.disabled=busy||state.finished||state.roundOver);
 el<HTMLButtonElement>('new-button').disabled=busy;arena?.sync(state,hand,floor);renderSelection();
 if(!busy&&(state.roundOver||state.finished)){
  clearTimeout(bannerTimer);const b=el('battle-banner');b.className='battle-banner finished';
  const result=state.rounds.at(-1);const win=state.finished?state.winner:result?.winner;
  b.innerHTML=(state.finished?(win===null?'MATCH DRAW':win===0?'MATCH WON':'SENTINEL WINS'):(win===null?'ROUND DRAW':win===0?'ROUND WON':'ROUND LOST'))+'<small>'+state.points.join(' / ')+' points · '+state.roundWins.join('–')+' round wins</small>';
 }
}
function renderSelection(){
 document.querySelectorAll<HTMLButtonElement>('#hand button').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.index)===hand)));
 document.querySelectorAll<HTMLButtonElement>('#field-choices button').forEach(b=>b.setAttribute('aria-pressed',String(floor.includes(Number(b.dataset.index)))));
 document.querySelectorAll<HTMLButtonElement>('[data-kind]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.kind===kind)));
 arena?.highlight(hand,floor);const options=el('move-options');options.replaceChildren();const detail=el('formation-detail');detail.replaceChildren();detail.hidden=true;
 const selected=state.floor.filter(p=>floor.includes(p.index));
 if(selected.length){detail.hidden=false;for(const p of selected){const row=document.createElement('p');row.textContent=label(p.value)+' '+p.value+(p.locked?' · locked':'')+' = '+p.parts.map(c=>suits[c.suit].glyph+' '+label(c.value)+' '+c.value+(c.points?' ['+pointMarks([c])+']':'')).join(' + ')+(p.points?' · '+p.points+' stored special points':'');detail.append(row);}}
 if(busy){el('move-title').textContent='Energy in motion';el('move-detail').textContent='Your move and the rival response are resolving.';return;}
 if(state.finished){el('move-title').textContent='Three rounds complete';el('move-detail').textContent='Round wins '+state.roundWins.join('–')+'. Open Scorebook for the full point breakdown.';return;}
 if(state.roundOver){
  el('move-title').textContent='Round '+state.round+' scored';el('move-detail').textContent='Line, captures, and field formations carry forward. Deal eight new shapes each.';
  const button=document.createElement('button');button.className='primary';button.textContent='Deal round '+(state.round+1)+' →';button.onclick=()=>nextRound();options.append(button);return;
 }
 if(hand===null){el('move-title').textContent='Choose a shape from your arsenal';el('move-detail').textContent=kind==='build'?'Fuse into a new solid, keeping its matching finisher.':kind==='discard'?'Deploy into shared space. No replacement draws.':'Capture special shapes and contest the total-shape and gold majorities.';return;}
 const card=state.hand.find(s=>s.index===hand);if(!card){hand=null;renderSelection();return;}
 const request={hand,floor,kind},choices=rules.call<{choices:Choice[]}>({type:'battle_choices',...request}).choices;
 el('move-title').textContent=shapeLabel(card)+' '+card.value+' selected';
 if(!choices.length){el('move-detail').textContent=kind==='discard'?(floor.length?'Deselect field formations to deploy.':'Cannot duplicate a field energy or deploy while owning a build.'):!floor.length?'Select battlefield formations to use.':kind==='capture'?'Field energies must match your shape, individually or in sums.':'Keep a matching finisher. Builds reach at most 13. Locked values cannot change.';return;}
 for(const choice of choices){
  el('move-title').textContent=kind==='capture'?'Capture '+choice.captured+' shapes · lead shift '+signed(choice.shift):kind==='build'?'Morph into '+label(choice.target??card.value)+' '+choice.target:'Deploy '+shapeLabel(card);
  el('move-detail').textContent=kind==='capture'?(choice.sweep?'Suipi! +1 sweep point. Preview includes changes to contested majorities.':'Point lead includes special shapes and changes to capture/gold majorities.'):kind==='build'?'Original suits and point marks stay inside. Ownership is marked separately.':'This original shape stays on the field. Either player can use it.';
  const b=document.createElement('button');b.className='primary';b.textContent=kind==='capture'?(choice.sweep?'Suipi capture':'Capture shapes')+' →':kind==='build'?'Forge '+choice.target+' →':'Deploy shape →';b.onclick=()=>void play({...request,annotation:choice.annotation});options.append(b);
 }
}
function announce(event:BattleEvent){
 clearTimeout(bannerTimer);const b=el('battle-banner');b.className='battle-banner '+(event.actor===1?'enemy-hit':'');
 b.innerHTML=event.kind==='capture'?(event.sweep?'SUIPI':'CAPTURED')+'<small>'+event.captured+' original shapes · '+signed(event.shift)+' point-lead shift</small>':(event.kind==='build'?'FUSION':'DEPLOYED')+'<small>'+label(event.target??event.value)+' '+(event.target??event.value)+'</small>';
 void b.offsetWidth;b.classList.add('show');bannerTimer=setTimeout(()=>{b.classList.remove('show');b.replaceChildren();},1250);
}
async function play(move:Move){
 if(busy||state.finished||state.roundOver)return;
 try{const response=rules.call<{battle:BattleState;events:BattleEvent[]}>({type:'battle_play',...move});save();busy=true;hand=null;floor=[];render();
 for(const event of response.events){el('turn-label').textContent=event.actor===0?'Astra resolving…':'Sentinel responding…';announce(event);await arena?.animate(event);state=event.state;el('combat-log').textContent=state.last;render();}
 state=response.battle;busy=false;render();
 }catch(e){busy=false;el('combat-log').textContent=e instanceof Error?e.message:'Move failed.';if(loaded){state=rules.call<{battle:BattleState}>({type:'battle_state'}).battle;render();}}
}
function nextRound(){
 if(busy)return;try{state=rules.call<{battle:BattleState}>({type:'battle_next'}).battle;hand=null;floor=[];clearTimeout(bannerTimer);el('battle-banner').className='battle-banner';el('battle-banner').replaceChildren();el('combat-log').textContent=state.last;save();render();}catch(e){el('combat-log').textContent=String(e);}
}
function showScores(){
 const host=el('score-content');host.replaceChildren();const table=document.createElement('table');table.className='score-table';table.innerHTML='<thead><tr><th>Points</th><th>Astra</th><th>Sentinel</th></tr></thead>';
 const body=document.createElement('tbody');
 for(const [name,key] of [['Energy-1 shapes','ones'],['Crystal 10–13','diamonds'],['Gold 2','goldTwo'],['Most shapes','mostShapes'],['Most gold','mostGold'],['Suipi sweeps','sweeps'],['Total points','points']] as const){
 const row=document.createElement('tr');for(const text of [name,String(state.scores[0][key]),String(state.scores[1][key])]){const cell=document.createElement('td');cell.textContent=text;row.append(cell);}body.append(row);}
 table.append(body);host.append(table);
 const note=document.createElement('p');note.textContent='Majority points are live: tied counts award none. There are 23 base points available, plus sweeps. Final leftover pickup occurs after round three.';host.append(note);
 for(const actor of [0,1] as const){const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent=(actor===0?'Astra':'Sentinel')+' · '+state.captures[actor]+' captured · '+state.scores[actor].gold+' gold';details.append(summary);const list=document.createElement('div');list.className='captured-list';for(const c of state.capturedCards[actor]){const chip=document.createElement('span');chip.style.color=suits[c.suit].color;chip.textContent=suits[c.suit].glyph+' '+c.value+(c.points?' '+pointMarks([c]):'');chip.title=cardDescription(c);list.append(chip);}details.append(list);host.append(details);}
 el<HTMLDialogElement>('score-dialog').showModal();
}
el('help-button').onclick=()=>el<HTMLDialogElement>('guide').showModal();el('score-button').onclick=()=>loaded&&showScores();el('new-button').onclick=()=>loaded&&el<HTMLDialogElement>('new-dialog').showModal();
for(const dialog of document.querySelectorAll<HTMLDialogElement>('dialog')){dialog.querySelectorAll<HTMLButtonElement>('.close,.close-guide').forEach(b=>b.onclick=()=>dialog.close());dialog.addEventListener('click',e=>{if(e.target!==dialog)return;const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();});}
el('confirm-new').onclick=()=>{if(busy)return;state=rules.call<{battle:BattleState}>({type:'battle_new'}).battle;hand=null;floor=[];kind='capture';clearTimeout(bannerTimer);el('battle-banner').className='battle-banner';el('battle-banner').replaceChildren();el('combat-log').textContent=state.last;render();save();arena?.resetCamera();el<HTMLDialogElement>('new-dialog').close();};
el('sound-button').onclick=()=>{if(!loaded)return;sound=!sound;arena?.setSound(sound);el('sound-button').textContent='Sound '+(sound?'on':'off');el('sound-button').setAttribute('aria-pressed',String(sound));};
el('camera-button').onclick=()=>arena?.resetCamera();el('clear-button').onclick=()=>{if(!loaded)return;hand=null;floor=[];renderSelection();};
el('hint-button').onclick=()=>{if(!loaded||busy||state.finished||state.roundOver)return;const hint=rules.call<{hint:Move|null}>({type:'battle_hint'}).hint;if(hint){hand=hint.hand;floor=hint.floor;kind=hint.kind;renderSelection();el('combat-log').textContent='Legal move highlighted. Confirm when ready.';}};
document.querySelectorAll<HTMLButtonElement>('[data-kind]').forEach(b=>b.onclick=()=>{if(!loaded)return;kind=b.dataset.kind as MoveKind;renderSelection();});
for(const [value,s] of Object.entries(shapes)){const cell=document.createElement('div');cell.innerHTML='<span class="glyph" aria-hidden="true">'+s.glyph+'</span><span>'+value+' · '+s.name+'<small>'+s.description+'</small></span>';el('shape-guide').append(cell);}
for(const s of suits){const chip=document.createElement('span');chip.style.color=s.color;chip.textContent=s.glyph+' '+s.name+' / '+s.classic;el('suit-guide').append(chip);}
try{
 await rules.init();let restored=false;
 try{const saved=JSON.parse(localStorage.getItem(storage)??'null');if(saved){state=rules.call<{battle:BattleState}>({type:'battle_restore',...saved}).battle;restored=true;}}catch{}
 if(!restored)state=rules.call<{battle:BattleState}>({type:'battle_new'}).battle;
 try{arena=new Arena(el<HTMLCanvasElement>('arena'),select);}catch(e){console.warn('3D unavailable',e);el('loading').innerHTML='<h2>3D unavailable</h2><p>The same game works using the field and arsenal controls below. Try hardware graphics for the full arena.</p>';}
 loaded=true;el('combat-log').textContent=state!.last;render();save();if(arena)el('loading').hidden=true;
}catch(e){console.error(e);el('loading').innerHTML='<h2>Could not load match</h2><p>Reload to retry the arena and rules engine.</p><button id="reload" class="primary">Reload</button>';el('reload').onclick=()=>location.reload();}
window.addEventListener('pagehide',e=>{if(!e.persisted)arena?.dispose();});
