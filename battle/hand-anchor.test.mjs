import assert from 'node:assert/strict';
import test from 'node:test';
import {NullEngine} from '@babylonjs/core/Engines/nullEngine.js';
import {Scene} from '@babylonjs/core/scene.js';
import {ArcRotateCamera} from '@babylonjs/core/Cameras/arcRotateCamera.js';
import {Matrix,Vector3} from '@babylonjs/core/Maths/math.vector.js';
import {Viewport} from '@babylonjs/core/Maths/math.viewport.js';
import {handAnchor,handPresentation} from './src/hand-anchor.ts';
import {CreatePolyhedron} from '@babylonjs/core/Meshes/Builders/polyhedronBuilder.js';
import {CreateBox} from '@babylonjs/core/Meshes/Builders/boxBuilder.js';
import {CreateCylinder} from '@babylonjs/core/Meshes/Builders/cylinderBuilder.js';
import {CreateSphere} from '@babylonjs/core/Meshes/Builders/sphereBuilder.js';

for(const [width,height,dpr] of [[1200,850,1],[390,844,2],[345,800,2],[844,390,1]]){
 test(`hand centers and sizes stay fixed through orbit, tilt, zoom and inertia at ${width}×${height}, ${dpr}×`,()=>{
  const engine=new NullEngine({renderWidth:width*dpr,renderHeight:height*dpr,textureSize:256,deterministicLockstep:false,lockstepMaxSteps:4});
  const scene=new Scene(engine),camera=new ArcRotateCamera('camera',-Math.PI/2,1.03,20,new Vector3(0,.4,-.2),scene);
  scene.activeCamera=camera;
  const viewport=new Viewport(0,0,width,height);
  let checks=0;
  scene.onBeforeCameraRenderObservable.add(()=>{
   const view=camera.getViewMatrix(),projection=camera.getProjectionMatrix();
   const transform=view.multiply(projection),inverse=Matrix.Invert(view);
   for(const [x,y] of [[width*.15,height*.7],[width*.5,height*.82],[width*.85,height*.7]]){
    const {center,worldPerPixel}=handAnchor(view,projection,width,height,x,y);
    const actual=Vector3.Project(center,Matrix.IdentityReadOnly,transform,viewport);
    assert.ok(Math.abs(actual.x-x)<.002&&Math.abs(actual.y-y)<.002,`center drift: ${actual.x-x}, ${actual.y-y}`);
    const up=Vector3.TransformNormal(new Vector3(0,1,0),inverse).normalize();
    const edge=Vector3.Project(center.add(up.scale(worldPerPixel*22)),Matrix.IdentityReadOnly,transform,viewport);
    assert.ok(Math.abs((actual.y-edge.y)-22)<.002,'hand shape changed pixel size');
    checks++;
   }
  });
  for(const beta of [.65,1.03,1.35])for(const radius of [12,20,32]){
   camera.beta=beta;camera.radius=radius;camera.alpha=-Math.PI/2;
   camera.inertialAlphaOffset=.035;camera.inertialBetaOffset=.004;camera.inertialRadiusOffset=.1;
   for(let frame=0;frame<12;frame++)scene.render();
  }
  assert.equal(checks,324);
  scene.dispose();engine.dispose();
 });
}

test('actual silhouettes for all 13 hand shapes keep their size through camera orbit and spinning',()=>{
 const engine=new NullEngine({renderWidth:1200,renderHeight:850,textureSize:256,deterministicLockstep:false,lockstepMaxSteps:4});
 const scene=new Scene(engine),camera=new ArcRotateCamera('camera',-Math.PI/2,1.03,20,Vector3.Zero(),scene);
 scene.activeCamera=camera;
 const viewport=new Viewport(0,0,1200,850),types={3:0,6:1,8:3,9:5,10:8,11:12,12:2,13:4};
 for(let value=1;value<=13;value++){
  const mesh=value<=2?CreateSphere('test',{diameter:value===1?1.15:1.8,segments:value===1?6:24},scene):value===4?CreateBox('test',{size:1.24},scene):value===5||value===7?CreateCylinder('test',{diameter:value===5?1.25:1.95,height:value===5?1.9:.95,tessellation:value},scene):CreatePolyhedron('test',{type:types[value],size:1},scene);
  const vertices=mesh.getVerticesData('position'),sizes=[];
  for(const spin of [0,.8,1.6,2.4]){
   let baseline;
   for(const [alpha,beta,radius] of [[-1.57,.65,12],[-1.02,1.03,20],[-2.12,1.35,32]]){
    camera.alpha=alpha;camera.beta=beta;camera.radius=radius;scene.render();
    const view=camera.getViewMatrix(),projection=camera.getProjectionMatrix();
    const anchor=handAnchor(view,projection,1200,850,600,650);
    const pose=handPresentation(view,new Vector3(.14,spin,Math.sin(spin)*.12),vertices);
    const world=Matrix.Compose(Vector3.One().scale(anchor.worldPerPixel*22/pose.radius),pose.rotation,anchor.center);
    const points=[];
    for(let i=0;i<vertices.length;i+=3)points.push(Vector3.Project(new Vector3(vertices[i],vertices[i+1],vertices[i+2]),world,view.multiply(projection),viewport));
    const span=Math.max(Math.max(...points.map(p=>p.x))-Math.min(...points.map(p=>p.x)),Math.max(...points.map(p=>p.y))-Math.min(...points.map(p=>p.y)));
    if(baseline===undefined)baseline=span;
    assert.ok(Math.abs(span-baseline)<.01,`energy ${value} changed size with the camera: ${span} vs ${baseline}`);
    sizes.push(span);
   }
  }
  assert.ok(Math.max(...sizes)/Math.min(...sizes)<1.12,`energy ${value} shrank as it spun`);
  mesh.dispose();
 }
 scene.dispose();engine.dispose();
});
