import {Matrix,Quaternion,Vector3} from '@babylonjs/core/Maths/math.vector.js';

/** Place a hand solid on a plane facing the camera at a constant view depth. */
export function handAnchor(view:Matrix,projection:Matrix,width:number,height:number,x:number,y:number,depth=10){
 const point=Vector3.Unproject(new Vector3(x,y,.5),width,height,Matrix.IdentityReadOnly,Matrix.IdentityReadOnly,projection);
 point.scaleInPlace(depth/point.z);
 return {
  center:Vector3.TransformCoordinates(point,Matrix.Invert(view)),
  worldPerPixel:2*depth/(height*projection.m[5]),
 };
}

/** Keep the hand's presentation relative to the viewer and normalize its visible silhouette. */
export function handPresentation(view:Matrix,rotation:Vector3,vertices:ArrayLike<number>){
 const local=Quaternion.RotationYawPitchRoll(rotation.y,rotation.x,rotation.z),matrix=Matrix.Identity();
 local.toRotationMatrix(matrix);
 let left=Infinity,right=-Infinity,bottom=Infinity,top=-Infinity;
 for(let i=0;i<vertices.length;i+=3){
  const point=Vector3.TransformCoordinates(new Vector3(vertices[i],vertices[i+1],vertices[i+2]),matrix);
  left=Math.min(left,point.x);right=Math.max(right,point.x);bottom=Math.min(bottom,point.y);top=Math.max(top,point.y);
 }
 return {
  rotation:Quaternion.FromRotationMatrix(Matrix.Invert(view)).multiply(local),
  radius:Math.max(right-left,top-bottom)/2,
 };
}
