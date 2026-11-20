import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { PerspectiveCamera, Quaternion, Vector3 } from 'three'
const read = file => readFileSync(new URL('../src/components/games/raid/'+file,import.meta.url),'utf8').replace(/\r\n/g,'\n')
const load = async code => import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2020}}).outputText).toString('base64'))
const view=read('raidView.ts')
const {LANDSCAPE_VIEW_YAW,RAID_CAMERA_FOV,raidCameraFocal}=await load(view)
const projectSource=read('hullDocking.ts').slice(read('hullDocking.ts').indexOf('export function projectHullDocking'))
const {projectHullDocking}=await load(view+'\n'+projectSource)
const docking={landscape:[[-22,34,5],[22,34,5],[-22,-34,-5],[22,-34,-5]],portrait:[[-22,34,5],[22,34,5],[-22,-34,-5],[22,-34,-5]],cockpit:[4,45,9]}
let count=0
for(const landscape of [false,true])for(const [w,h]of [[390,700],[844,390],[1024,768]])for(const registration of [[448/288,448/288,0,0],[1.4,1.2,7,-8]]){
 const data={registration},x=w*.56,y=h*.58,size=210
 const out=projectHullDocking(data,docking,x,y,size,w,h,landscape)
 const lw=landscape?h:w,lh=landscape?w:h,cx=landscape?y:x,cy=landscape?lh-x:y
 const camera=new PerspectiveCamera(RAID_CAMERA_FOV,lw/lh,1,20000)
 camera.position.set(lw/2,lh/2,raidCameraFocal(lh));camera.updateMatrixWorld(true)
 const [sx,sy,ox,oy]=registration
 const rotation=new Quaternion().setFromAxisAngle(new Vector3(0,1,0),landscape?LANDSCAPE_VIEW_YAW:0)
 const reference=point=>{
  const v=new Vector3((sx*point[0]+144*sx+ox-224)*size/448,(sy*point[1]+224-144*sy-oy)*size/448,sx*point[2]*size/448)
  v.applyQuaternion(rotation).add(new Vector3(cx,lh-cy,0)).project(camera)
  const px=(v.x+1)*lw/2,py=(1-v.y)*lh/2
  return landscape?[lh-py,px]:[px,py]
 }
 const cockpit=reference(docking.cockpit)
 assert.ok(Math.abs(cockpit[0]-out.cockpitX)<1e-7 && Math.abs(cockpit[1]-out.cockpitY)<1e-7,'cockpit must track the rendered hull')
 for(let row=0;row<2;row++){
  const points=(landscape?docking.landscape:docking.portrait).slice(row*2,row*2+2).map(reference).sort((a,b)=>a[0]-b[0])
  for(let i=0;i<2;i++){
   const actual=out.contacts[row*2+i]
   assert.ok(Math.abs(actual.x-points[i][0])<1e-7 && Math.abs(actual.y-points[i][1])<1e-7,'clamp contact must track the camera-projected hull')
   count++
  }
 }
}
// A world heading rotates around the same flight-plane normal before the view.
const cameraBasis=new Quaternion().setFromAxisAngle(new Vector3(0,1,0),LANDSCAPE_VIEW_YAW)
const normal=new Vector3(0,0,1).applyQuaternion(cameraBasis)
for(const heading of [0,Math.PI/2,Math.PI,-Math.PI/2]){
 const q=cameraBasis.clone().multiply(new Quaternion().setFromAxisAngle(new Vector3(0,0,1),heading))
 assert.ok(new Vector3(0,0,1).applyQuaternion(q).distanceTo(normal)<1e-9,'opposing ships must share the flight-plane normal')
}
console.log(`Raid view: shared flight plane and ${count} Three/cockpit/clamp projection comparisons passed.`)
