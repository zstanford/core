import type {Choice,Move,MoveKind} from './types.ts';

export type DropTarget={kind:'formation';index:number}|{kind:'field';x:number;z:number}|{kind:'outside'};
export interface DraftOption {move:Move;choice:Choice;autoIncluded?:number[]}
export type ChoiceQuery=(request:{hand:number;floor:number[];kind:MoveKind})=>Choice[];
export interface DraftContext {hand:{index:number;value:number}[];floor:{index:number;value:number}[]}
const captureCache=new WeakMap<DraftContext,Map<number,DraftOption[]>>();

/** Find complete legal captures, including several disjoint sums of the played value. */
function fieldCaptures(hand:number,query:ChoiceQuery,context:DraftContext):DraftOption[]{
 let cached=captureCache.get(context);
 if(cached?.has(hand))return cached.get(hand)!;
 const value=context.hand.find(c=>c.index===hand)?.value??0;
 if(!value)return [];
 const candidates=context.floor.filter(p=>p.value<=value),options:DraftOption[]=[];
 function visit(at:number,floor:number[],sum:number){
  if(at===candidates.length){
   if(!floor.length||sum%value||floor.length>13)return;
   const request={hand,floor,kind:'capture' as const};
   for(const choice of query(request))options.push({move:{...request,annotation:choice.annotation},choice});
   return;
  }
  visit(at+1,floor,sum);
  visit(at+1,[...floor,candidates[at].index],sum+candidates[at].value);
 }
 visit(0,[],0);
 options.sort((a,b)=>b.choice.captured-a.choice.captured||b.choice.shift-a.choice.shift||a.move.annotation.localeCompare(b.move.annotation));
 if(!cached){cached=new Map();captureCache.set(context,cached);}cached.set(hand,options);
 return options;
}

/** Query legal moves only; a draft never mutates the rules state. */
export function dropChoices(hand:number,selected:number[],target:DropTarget,query:ChoiceQuery,context?:DraftContext):DraftOption[]{
 if(target.kind==='outside')return [];
 if(target.kind==='field'&&context){
  const captures=fieldCaptures(hand,query,context);
  if(captures.length)return captures;
 }
 const floor=target.kind==='field'?[]:[...new Set([...selected,target.index])];
 const kinds:MoveKind[]=target.kind==='field'?['discard']:['capture','build'];
 const options:DraftOption[]=kinds.flatMap(kind=>{
  const request={hand,floor,kind};
  return query(request).map(choice=>({move:{...request,annotation:choice.annotation},choice}));
 });
 if(target.kind==='formation'&&context){
  // A newly built value must stack with an existing equal field value.
  // Ask the unchanged rules engine to validate the full grouped move.
  const finishers=new Set(context.hand.filter(c=>c.index!==hand).map(c=>c.value));
  for(const value of finishers){
   const autoIncluded=context.floor.filter(p=>p.value===value&&!floor.includes(p.index)).map(p=>p.index);
   if(!autoIncluded.length)continue;
   const request={hand,floor:[...floor,...autoIncluded],kind:'build' as const};
   for(const choice of query(request))if(choice.target===value&&!options.some(o=>o.move.annotation===choice.annotation)){
    options.push({move:{...request,annotation:choice.annotation},choice,autoIncluded});
   }
  }
 }
 return options;
}
