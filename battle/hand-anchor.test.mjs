import assert from 'node:assert/strict';
import test from 'node:test';
import {NullEngine} from '@babylonjs/core/Engines/nullEngine.js';
import {Scene} from '@babylonjs/core/scene.js';
import {ArcRotateCamera} from '@babylonjs/core/Cameras/arcRotateCamera.js';
import {Matrix,Vector3} from '@babylonjs/core/Maths/math.vector.js';
import {Viewport} from '@babylonjs/core/Maths/math.viewport.js';
import {handAnchor} from './src/hand-anchor.ts';

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
