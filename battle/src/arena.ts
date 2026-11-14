import {Engine} from '@babylonjs/core/Engines/engine';
import {Scene} from '@babylonjs/core/scene';
import {ArcRotateCamera} from '@babylonjs/core/Cameras/arcRotateCamera';
import {Vector3,Matrix} from '@babylonjs/core/Maths/math.vector';
import {Color3,Color4} from '@babylonjs/core/Maths/math.color';
import {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial';
import {HemisphericLight} from '@babylonjs/core/Lights/hemisphericLight';
import {PointLight} from '@babylonjs/core/Lights/pointLight';
import {GlowLayer} from '@babylonjs/core/Layers/glowLayer';
import {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import {Mesh} from '@babylonjs/core/Meshes/mesh';
import {PointerEventTypes} from '@babylonjs/core/Events/pointerEvents';
import {CreateBox} from '@babylonjs/core/Meshes/Builders/boxBuilder';
import {CreateCylinder} from '@babylonjs/core/Meshes/Builders/cylinderBuilder';
import {CreateLines,CreateLineSystem} from '@babylonjs/core/Meshes/Builders/linesBuilder';
import {CreatePolyhedron} from '@babylonjs/core/Meshes/Builders/polyhedronBuilder';
import {CreateTorus} from '@babylonjs/core/Meshes/Builders/torusBuilder';
import {CreateSphere} from '@babylonjs/core/Meshes/Builders/sphereBuilder';
import '@babylonjs/core/Rendering/edgesRenderer';
import '@babylonjs/core/Culling/ray';
const MeshBuilder={CreateBox,CreateCylinder,CreateLines,CreateLineSystem,CreatePolyhedron,CreateTorus,CreateSphere};
import type {BattleState,BattleEvent} from './types';

type Unit={node:TransformNode;solid:Mesh;ring:Mesh;base:Vector3;index:number;area:'hand'|'floor';value:number;phase:number};
const cyan=Color3.FromHexString('#54f2da'), pink=Color3.FromHexString('#ff67b8'),neutral=Color3.FromHexString('#9eacf2');
export class Arena {
  readonly engine:Engine;
  readonly scene:Scene;
  private camera:ArcRotateCamera;
  private units:Unit[]=[];
  private cores:Mesh[]=[];
  private glow:GlowLayer;
  private clock=0;
  private reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  private observer:ResizeObserver;
  private muted=true;
  private audio?:AudioContext;
  private stopped=false;
  private suspended=false;
  private visibility=()=>{this.suspended=document.hidden;};

  constructor(private canvas:HTMLCanvasElement,private select:(area:'hand'|'floor',index:number)=>void) {
    this.engine=new Engine(canvas,true,{preserveDrawingBuffer:true,stencil:true,powerPreference:'high-performance'});
    this.engine.setHardwareScalingLevel(Math.max(1,devicePixelRatio/1.5));
    this.scene=new Scene(this.engine);this.scene.clearColor=Color4.FromHexString('#070b19ff');
    this.scene.fogMode=Scene.FOGMODE_EXP2;this.scene.fogDensity=.013;this.scene.fogColor=Color3.FromHexString('#070b19');
    this.camera=new ArcRotateCamera('camera',-Math.PI/2,1.03,19,new Vector3(0,.4,-.2),this.scene);
    this.camera.lowerRadiusLimit=11;this.camera.upperRadiusLimit=25;this.camera.lowerBetaLimit=.65;this.camera.upperBetaLimit=1.35;
    this.camera.lowerAlphaLimit=-Math.PI/2-.55;this.camera.upperAlphaLimit=-Math.PI/2+.55;
    this.camera.wheelPrecision=65;this.resetCamera();this.camera.panningSensibility=0;this.camera.attachControl(canvas,true);
    const light=new HemisphericLight('ambient',new Vector3(0,1,0),this.scene);light.intensity=.65;light.groundColor=Color3.FromHexString('#18213f');
    const point=new PointLight('rim',new Vector3(1,6,1),this.scene);point.diffuse=cyan;point.intensity=1.2;
    this.glow=new GlowLayer('neon',this.scene,{blurKernelSize:36});this.glow.intensity=.58;
    this.environment();
    this.scene.onPointerObservable.add(info=>{
      if(info.type!==PointerEventTypes.POINTERPICK)return;
      const data=info.pickInfo?.pickedMesh?.metadata;
      if(data?.area)this.select(data.area,data.index);
    });
    this.observer=new ResizeObserver(()=>{this.engine.resize();this.resetCamera();});this.observer.observe(canvas);
    this.visibility();document.addEventListener('visibilitychange',this.visibility);
    this.engine.runRenderLoop(()=>{
      if(this.stopped||this.suspended)return;
      const dt=Math.min(this.engine.getDeltaTime()/1000,.05);this.clock+=dt;
      if(!this.reduced){
        for(const unit of this.units){unit.solid.rotation.y+=dt*.24;unit.solid.rotation.z=Math.sin(this.clock*.45+unit.phase)*.12;unit.solid.position.y=.85+Math.sin(this.clock*1.1+unit.phase)*.11;}
        this.cores.forEach((m,i)=>{m.rotation.y+=dt*(i?-.1:.1);});
      }
      this.scene.render();
    });
  }

  private material(name:string,color:Color3,glowing=true) {
    const m=new StandardMaterial(name,this.scene);m.diffuseColor=color.scale(.22);m.specularColor=color.scale(.4);m.emissiveColor=color.scale(glowing?.42:.05);m.alpha=.88;return m;
  }
  private lines(name:string,points:Vector3[],color:Color3,alpha=.3) {
    const mesh=MeshBuilder.CreateLines(name,{points},this.scene);mesh.color=color.scale(alpha);mesh.alpha=1;this.glow.addExcludedMesh(mesh);mesh.isPickable=false;return mesh;
  }
  private circle(name:string,radius:number,y:number,z=0,color=cyan,alpha=.25) {
    return this.lines(name,Array.from({length:97},(_,i)=>new Vector3(Math.cos(i/96*Math.PI*2)*radius,y,Math.sin(i/96*Math.PI*2)*radius+z)),color,alpha);
  }
  private environment() {
    const platform=MeshBuilder.CreateCylinder('platform',{diameter:13,height:.16,tessellation:96},this.scene);
    platform.position.y=-.25;platform.material=this.material('platform',Color3.FromHexString('#152039'),false);platform.isPickable=false;
    this.circle('boundary',6.35,-.15,0,cyan,.6);this.circle('inner',5.9,-.14,0,cyan,.18);this.circle('center',2,-.13,0,neutral,.18);
    for(let x=-6;x<=6;x++){
      const h=Math.sqrt(36-x*x);this.lines('grid-x',[new Vector3(x,-.15,-h),new Vector3(x,-.15,h)],neutral,.16);
      this.lines('grid-z',[new Vector3(-h,-.15,x),new Vector3(h,-.15,x)],neutral,.16);
    }
    for(let i=0;i<24;i++){
      const a=i/24*Math.PI*2;this.lines('tick',[new Vector3(Math.cos(a)*6.52,-.15,Math.sin(a)*6.52),new Vector3(Math.cos(a)*6.74,-.15,Math.sin(a)*6.74)],cyan,i%3===0?.6:.2);
    }
    [0,1].forEach(i=>{
      const color=i?pink:cyan;const z=i?6.7:-7.1;
      const core=MeshBuilder.CreatePolyhedron('core-'+i,{type:3,size:.53},this.scene);core.position=new Vector3(0,.7,z);core.material=this.material('coremat-'+i,color);core.enableEdgesRendering();core.edgesWidth=2;core.edgesColor=new Color4(color.r,color.g,color.b,1);core.isPickable=false;this.cores.push(core);
      this.circle('core-ring',.95,-.12,z,color,.5);this.circle('core-ring2',1.18,-.12,z,color,.18);
      for(const x of [-3,-1.5,1.5,3])this.lines('rail',[new Vector3(x,-.2,z-.5),new Vector3(x,-.2,z+.5)],color,.22);
    });
    // One low-cost point mesh for the star field; no textures or remote assets.
    const stars:Vector3[]=[];let seed=4291;
    const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
    for(let i=0;i<200;i++){const p=new Vector3((random()-.5)*80,random()*32-4,(random()-.5)*70);stars.push(p,p.add(new Vector3(.025,0,0)));}
    MeshBuilder.CreateLineSystem('stars',{lines:Array.from({length:200},(_,i)=>[stars[i*2],stars[i*2+1]])},this.scene).color=Color3.FromHexString('#7488ac');
  }
  private solid(name:string,value:number,size:number) {
    if(value===4)return MeshBuilder.CreateBox(name,{size:size*1.24},this.scene);
    if(value===5||value===7)return MeshBuilder.CreateCylinder(name,{diameter:size*1.7,height:size*1.1,tessellation:value},this.scene);
    return MeshBuilder.CreatePolyhedron(name,{type:value===3?0:value===6?1:3,size},this.scene);
  }
  sync(state:BattleState,hand:number|null,floor:number[]) {
    for(const u of this.units)u.node.dispose(false,true);this.units=[];
    const rows=Math.ceil(state.floor.length/3);
    state.floor.forEach((p,i)=>{
      const count=Math.min(3,state.floor.length-Math.floor(i/3)*3);
      const x=(i%3-(count-1)/2)*2.8,z=(Math.floor(i/3)-(rows-1)/2)*2.65+.8;
      const color=p.owner===1?pink:p.owner===0?cyan:neutral;
      const u=this.unit('floor',p.index,p.value,new Vector3(x,0,z),color);
      if(p.parts.length>1){
        p.parts.slice(0,5).forEach((v,j)=>{
          const a=j/p.parts.length*Math.PI*2;
          const satellite=this.solid('satellite',v,.14);satellite.parent=u.node;satellite.position=new Vector3(Math.cos(a)*1.05,.75,Math.sin(a)*1.05);satellite.material=this.material('satellite-mat',color);satellite.isPickable=false;
        });
        if(p.locked){const lock=MeshBuilder.CreateTorus('locked',{diameter:1.95,thickness:.025,tessellation:48},this.scene);lock.parent=u.node;lock.position.y=.8;lock.rotation.x=Math.PI/2;lock.material=this.material('locked-mat',color);lock.isPickable=false;}
      }
    });
    state.hand.forEach((p,i)=>this.unit('hand',p.index,p.value,new Vector3((i-(state.hand.length-1)/2)*1.85,0,-4.35),cyan,.76));
    this.highlight(hand,floor);
  }
  private unit(area:'hand'|'floor',index:number,value:number,base:Vector3,color:Color3,scale=1) {
    const node=new TransformNode(area+index,this.scene);node.position=base.clone();
    const size=(.33+(value-3)*.075)*scale;
    const solid=this.solid('shape-'+area+index,value,size);solid.parent=node;solid.position.y=.85;solid.rotation.x=.14;solid.rotation.y=value*.4;
    solid.material=this.material('shape-material',color);solid.enableEdgesRendering();solid.edgesWidth=1.8;solid.edgesColor=new Color4(color.r,color.g,color.b,1);solid.metadata={area,index};
    const ring=MeshBuilder.CreateTorus('selection',{diameter:1.65*scale,thickness:.018,tessellation:48},this.scene);ring.parent=node;ring.position.y=.01;ring.material=this.material('selection-material',color);ring.isPickable=false;
    const pick=MeshBuilder.CreateSphere('pick-target',{diameter:1.65*scale,segments:8},this.scene);pick.parent=node;pick.position.y=.85;pick.visibility=0;pick.metadata={area,index};
    const unit={node,solid,ring,base,index,area,value,phase:index*1.4};this.units.push(unit);return unit;
  }
  highlight(hand:number|null,floor:number[]) {
    for(const unit of this.units){const active=unit.area==='hand'?unit.index===hand:floor.includes(unit.index);unit.ring.visibility=active?1:.2;unit.node.scaling.setAll(active?1.14:1);}
  }
  resetCamera(){this.camera.alpha=-Math.PI/2;this.camera.beta=1.03;this.camera.radius=Math.max(16,5.5/(Math.max(.6,this.canvas.clientWidth/this.canvas.clientHeight)*Math.tan(.4))+5);}
  setSound(enabled:boolean){this.muted=!enabled;if(enabled){this.audio??=new AudioContext();void this.audio.resume();}}
  private tone(frequency:number,length:number) {
    if(this.muted||!this.audio)return;
    const oscillator=this.audio.createOscillator(),gain=this.audio.createGain();oscillator.type='sine';oscillator.frequency.setValueAtTime(frequency,this.audio.currentTime);oscillator.frequency.exponentialRampToValueAtTime(frequency/2,this.audio.currentTime+length);gain.gain.setValueAtTime(.045,this.audio.currentTime);gain.gain.exponentialRampToValueAtTime(.001,this.audio.currentTime+length);oscillator.connect(gain).connect(this.audio.destination);oscillator.start();oscillator.stop(this.audio.currentTime+length);
  }
  private tween(duration:number,render:(t:number)=>void) {
    if(this.reduced||this.suspended){render(1);return Promise.resolve();}
    return new Promise<void>(resolve=>{const start=performance.now();const frame=(now:number)=>{const t=Math.min(1,(now-start)/duration);render(t);if(t<1&&!this.stopped)requestAnimationFrame(frame);else resolve();};requestAnimationFrame(frame);});
  }
  private burst(position:Vector3,color:Color3) {
    const shards=Array.from({length:22},(_,i)=>{
      const mesh=MeshBuilder.CreatePolyhedron('shard',{type:0,size:.045+(i%3)*.025},this.scene);mesh.position=position.clone();mesh.material=this.material('shard-material',color);mesh.isPickable=false;
      const a=i/22*Math.PI*2;return {mesh,delta:new Vector3(Math.cos(a)*(1+i%3),.2+(i%5)*.35,Math.sin(a)*(1+i%3))};
    });
    void this.tween(750,t=>shards.forEach(({mesh,delta})=>{mesh.position=position.add(delta.scale(t));mesh.scaling.setAll(1-t);mesh.rotation.x=t*6;})).then(()=>shards.forEach(s=>s.mesh.dispose(false,true)));
  }
  async animate(event:BattleEvent) {
    const color=event.actor===0?cyan:pink;
    const selected=this.units.filter(u=>(u.area==='floor'&&event.floor.includes(u.index))||(u.area==='hand'&&event.actor===0&&u.index===event.hand));
    if(event.kind==='capture'){
      for(const unit of selected){const material=unit.solid.material as StandardMaterial;material.diffuseColor=color.scale(.22);material.emissiveColor=color.scale(.42);unit.solid.edgesColor=new Color4(color.r,color.g,color.b,1);}
      const center=new Vector3(0,1,0);
      this.tone(310,.4);
      await this.tween(380,t=>selected.forEach(u=>{u.node.position=Vector3.Lerp(u.base,center,t*t);u.node.scaling.setAll(1-.65*t);}));
      const projectile=this.solid('projectile',event.value,.3+event.value*.05);projectile.position=center.clone();projectile.material=this.material('attack-material',color);projectile.isPickable=false;
      const target=this.cores[1-event.actor].position.clone();
      const path=MeshBuilder.CreateLines('beam',{points:[center,target]},this.scene);path.color=color;path.alpha=.35;path.isPickable=false;
      await this.tween(430,t=>{projectile.position=Vector3.Lerp(center,target,t*t);projectile.rotation.y=t*8;});
      projectile.dispose(false,true);path.dispose();this.burst(target,color);this.tone(event.sweep?70:140,.55);
      if(event.sweep){
        const wave=MeshBuilder.CreateTorus('suipi-wave',{diameter:1,thickness:.04,tessellation:96},this.scene);wave.position.y=.15;wave.material=this.material('wave-material',color);wave.isPickable=false;
        await this.tween(650,t=>{wave.scaling.setAll(.3+t*15);wave.visibility=1-t;});wave.dispose(false,true);
      }
    }else if(event.kind==='build'){
      const center=selected[0]?.base.clone()??new Vector3(0,0,0);this.tone(520,.45);
      await this.tween(650,t=>selected.forEach(u=>{u.node.position=Vector3.Lerp(u.base,center,t);u.node.rotation.y=t*2;u.node.scaling.setAll(1+Math.sin(t*Math.PI)*.3);}));
      this.burst(center.add(new Vector3(0,1,0)),color);
    }else{
      const shape=this.solid('deployment',event.value,.35);shape.material=this.material('deploy-material',color);shape.isPickable=false;
      await this.tween(500,t=>{shape.position=new Vector3((t-.5)*1.4,1+Math.sin(t*Math.PI)*1.4,(event.actor===0?-4:4)*(1-t));shape.rotation.y=t*4;});shape.dispose(false,true);
    }
  }
  projectFloor(index:number) {
    const unit=this.units.find(u=>u.area==='floor'&&u.index===index);if(!unit)return null;
    const p=Vector3.Project(unit.base.add(new Vector3(0,-.02,0)),Matrix.Identity(),this.scene.getTransformMatrix(),this.camera.viewport.toGlobal(this.engine.getRenderWidth(),this.engine.getRenderHeight()));
    return {x:p.x/this.engine.getRenderWidth()*100,y:p.y/this.engine.getRenderHeight()*100};
  }
  dispose(){this.stopped=true;this.observer.disconnect();document.removeEventListener('visibilitychange',this.visibility);this.scene.dispose();this.engine.dispose();void this.audio?.close();}
}
