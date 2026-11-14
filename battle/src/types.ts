export type MoveKind='capture'|'build'|'discard';
export interface ShapeCard {id:number;value:number;suit:number;points:number}
export interface HandShape extends ShapeCard {index:number}
export interface Formation {index:number;value:number;parts:ShapeCard[];suit:number|null;points:number;owner:0|1|null;locked:boolean}
export interface Score {points:number;captured:number;gold:number;ones:number;diamonds:number;goldTwo:number;sweeps:number;mostShapes:number;mostGold:number}
export interface RoundResult {round:number;winner:0|1|null;points:[number,number];lead:number}
export interface BattleState {
 version:number;round:number;roundOver:boolean;rounds:RoundResult[];roundWins:[number,number];
 deck:number;turn:0|1;turns:number;finished:boolean;winner:0|1|null;
 hand:HandShape[];floor:Formation[];otherCount:number;
 points:[number,number];lead:number;scores:[Score,Score];captures:[number,number];sweeps:[number,number];capturedCards:[ShapeCard[],ShapeCard[]];last:string;
}
export interface Move {hand:number;floor:number[];kind:MoveKind;annotation:string}
export interface Choice {annotation:string;target?:number;label:string;points:number;shift:number;captured:number;sweep:boolean}
export interface BattleEvent {actor:0|1;hand:number;kind:MoveKind;value:number;suit:number;card:ShapeCard;target?:number;shift:number;captured:number;sweep:boolean;floor:number[];parts:ShapeCard[];roundEnd:RoundResult|null;state:BattleState}
export const suits=[
 {name:'Tide',color:'#59e1ca'},
 {name:'Crystal',color:'#b1cdff'},
 {name:'Bloom',color:'#e99ae5'},
 {name:'Gold',color:'#f2c55e'},
];
export const shapes:Record<number,{name:string;glyph:string;description:string}>={
 1:{name:'Spark',glyph:'✦',description:'Luminous point / small sphere'},
 2:{name:'Sphere',glyph:'●',description:'Sphere'},
 3:{name:'Shard',glyph:'△',description:'Tetrahedron'},
 4:{name:'Block',glyph:'◇',description:'Cube'},
 5:{name:'Cell',glyph:'⬟',description:'Pentagonal prism'},
 6:{name:'Diamond',glyph:'◈',description:'Octahedron'},
 7:{name:'Drum',glyph:'⬡',description:'Heptagonal prism'},
 8:{name:'Orb',glyph:'✧',description:'Icosahedron'},
 9:{name:'Arrow',glyph:'▷',description:'Triangular prism'},
 10:{name:'Spire',glyph:'△',description:'Square pyramid'},
 11:{name:'Lantern',glyph:'◊',description:'Elongated square dipyramid'},
 12:{name:'Relic',glyph:'⬠',description:'Dodecahedron'},
 13:{name:'Nexus',glyph:'✥',description:'Rhombicuboctahedron'},
};
export const shapeLabel=(card:ShapeCard)=>suits[card.suit].name+' '+shapes[card.value].name;
export function pointMarks(cards:ShapeCard[]):string {
 const diamonds=cards.filter(c=>c.suit===1&&c.value>=10).reduce((n,c)=>n+c.points,0);
 const gold=cards.filter(c=>c.suit===3&&c.value===2).length;
 const ones=cards.filter(c=>c.value===1).length;
 return [diamonds>5?'◆×'+diamonds:'◆'.repeat(diamonds),'•'.repeat(gold),'✦'.repeat(ones)].filter(Boolean).join(' ');
}
