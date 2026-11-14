export type MoveKind = 'capture' | 'build' | 'discard';
export interface Formation { index:number; value:number; parts:number[]; owner:0|1|null; locked:boolean }
export interface BattleState {
  hull:[number,number]; maxHull:number; deck:number; turn:0|1; turns:number;
  finished:boolean; winner:0|1|null; hand:{index:number;value:number}[];
  floor:Formation[]; otherCount:number; captures:[number,number]; sweeps:[number,number]; last:string;
}
export interface Move { hand:number; floor:number[]; kind:MoveKind; annotation:string }
export interface Choice {annotation:string; target?:number; label:string; damage:number; sweep:boolean}
export interface BattleEvent { actor:0|1; hand:number; kind:MoveKind; value:number; target?:number; damage:number; sweep:boolean; floor:number[]; parts:number[]; state:BattleState }
export const shapes:Record<number,{name:string;glyph:string;description:string}> = {
  3:{name:'Tetra',glyph:'△',description:'Tetrahedron'},
  4:{name:'Cube',glyph:'◇',description:'Cube'},
  5:{name:'Prism',glyph:'⬟',description:'Pentagonal prism'},
  6:{name:'Octa',glyph:'◈',description:'Octahedron'},
  7:{name:'Crown',glyph:'⬡',description:'Heptagonal prism'},
  8:{name:'Nova',glyph:'✧',description:'Icosahedron'},
};
