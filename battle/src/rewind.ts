export interface BattleSave {version:number;seed:number[];moves:Record<string,unknown>[]}

export function rewindCount(saved:BattleSave){
 return saved.moves.filter(move=>move.advance!==true).length;
}

/** Return to the previous human decision, including across a new-round deal. */
export function rewindSave(saved:BattleSave):BattleSave|null{
 let end=saved.moves.length;
 while(end>0&&saved.moves[end-1].advance===true)end--;
 if(!end)return null;
 return {...saved,moves:saved.moves.slice(0,end-1)};
}
