import {Color,Mesh,MeshStandardMaterial,Raycaster,Vector3,type Object3D} from 'three'
import {getHullLampDesign,type HullLampSpec} from './hullLampDesigns'
export type HullLampSite={point:readonly number[];rgb:readonly number[];spec:HullLampSpec}
export type HullLampBinding={mesh:Mesh;sites:readonly HullLampSite[]}
/** Admission only: fit every emitter to actual opaque geometry, including the
 * transformed cobra head. Shared sites follow each pooled model's own matrices. */
export function prepareHullLampAnchors(object:Object3D,key:string){
 const specs=getHullLampDesign(key)
 if(!specs.length)return
 object.updateMatrixWorld(true)
 let body:Mesh|undefined
 object.traverse(child=>{if(!body&&child instanceof Mesh)body=child})
 if(!body||body.geometry.userData.hullLampSites)return
 const selected=body as Mesh,sites:HullLampSite[]=[],ray=new Raycaster(),point=new Vector3(),normal=new Vector3()
 const boss=key.endsWith('Hull')||key.startsWith('commandHull')
 const material=Array.isArray(selected.material)?selected.material[0]:selected.material
 const image=(material instanceof MeshStandardMaterial?material.map?.image:undefined) as {width:number;height:number}|undefined
 const span=boss?1:288,ax=boss&&image?image.width/Math.max(image.width,image.height):1
 const ay=boss&&image?image.height/Math.max(image.width,image.height):1
 const color=new Color()
 for(const spec of specs){
  for(let attempt=0;attempt<5;attempt++){
   const fit=1-attempt*.045
   point.set((spec.u-.5)*span*ax*fit,(.5-spec.v)*span*ay*fit,0)
   if(boss)point.applyMatrix4(selected.matrixWorld)
   ray.set(new Vector3(point.x,point.y,4096),new Vector3(0,0,-1))
   const hit=ray.intersectObject(selected,false).find(hit=>{
    const limbs=selected.geometry.getAttribute('bossLimb')
    return !limbs||!hit.face||limbs.getX(hit.face.a)<0
   })
   if(!hit)continue
   normal.copy(hit.face?.normal??new Vector3(0,0,1)).transformDirection(selected.matrixWorld)
   if(normal.z<0)normal.negate()
   point.copy(hit.point).addScaledVector(normal,boss ? .58 : .75)
   selected.worldToLocal(point)
   color.setHex(spec.color)
   sites.push({point:[point.x,point.y,point.z],rgb:[color.r,color.g,color.b],spec})
   break
  }
 }
 selected.geometry.userData.hullLampSites=sites
}
export function bindHullLamps(object:Object3D):HullLampBinding[]{
 const out:HullLampBinding[]=[]
 object.traverse(child=>{
  if(child instanceof Mesh){
   const sites=child.geometry.userData.hullLampSites as HullLampSite[]|undefined
   if(sites?.length)out.push({mesh:child,sites})
  }
 })
 return out
}
