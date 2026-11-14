import type {Choice,Move,MoveKind} from './types.ts';

export type DropTarget={kind:'formation';index:number}|{kind:'field';x:number;z:number}|{kind:'outside'};
export interface DraftOption {move:Move;choice:Choice}
export type ChoiceQuery=(request:{hand:number;floor:number[];kind:MoveKind})=>Choice[];

/** Query legal moves only; a draft never mutates the rules state. */
export function dropChoices(hand:number,selected:number[],target:DropTarget,query:ChoiceQuery):DraftOption[]{
 if(target.kind==='outside')return [];
 const floor=target.kind==='field'?[]:[...new Set([...selected,target.index])];
 const kinds:MoveKind[]=target.kind==='field'?['discard']:['capture','build'];
 return kinds.flatMap(kind=>{
  const request={hand,floor,kind};
  return query(request).map(choice=>({move:{...request,annotation:choice.annotation},choice}));
 });
}
