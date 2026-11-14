import {Matrix,Vector3} from '@babylonjs/core/Maths/math.vector.js';

/** Place a hand solid on a plane facing the camera at a constant view depth. */
export function handAnchor(view:Matrix,projection:Matrix,width:number,height:number,x:number,y:number,depth=10){
 const point=Vector3.Unproject(new Vector3(x,y,.5),width,height,Matrix.IdentityReadOnly,Matrix.IdentityReadOnly,projection);
 point.scaleInPlace(depth/point.z);
 return {
  center:Vector3.TransformCoordinates(point,Matrix.Invert(view)),
  worldPerPixel:2*depth/(height*projection.m[5]),
 };
}
