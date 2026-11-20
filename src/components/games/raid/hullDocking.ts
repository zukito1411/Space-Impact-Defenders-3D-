import { LANDSCAPE_VIEW_YAW, raidCameraFocal } from './raidView'
import { Box3, Mesh, Raycaster, Vector3, type Object3D } from 'three'
import { getCarrierCanopyProfile } from './carrierCanopyProfiles'
import type { HullRegistration } from './liveHullAssets'

type Point = readonly [number, number, number]
export type HullDocking = { landscape: Point[]; portrait: Point[]; cockpit: Point;
  canopy?: { u: number; v: number; hingeY: number } }
export type DockMatrix = [number,number,number,number,number,number]
export type DockContact = { x: number; y: number; side: number; level: number; nx: number; ny: number }
export type ProjectedDock = { contacts: DockContact[]; cockpitX: number; cockpitY: number;
  canopy?: { closed: DockMatrix; open: DockMatrix } }

/** Read structural contacts once from the loaded mesh, never from a sprite's square. */
export function prepareHullDocking(object: Object3D, key: string, data: HullRegistration): HullDocking | undefined {
  const profile = getCarrierCanopyProfile(key, false, false)
  object.updateMatrixWorld(true)
  const bounds = new Box3().setFromObject(object)
  if(bounds.isEmpty())return undefined
  const [sx, sy, ox, oy] = data.registration
  const sourceX = (u: number) => ((u/240)*448-144*sx-ox)/sx
  const sourceY = (v: number) => (144*sy+oy-(v/240)*448)/sy
  const length = bounds.max.y-bounds.min.y
  const [left, top, right, bottom] = profile?.bounds ?? [117,95,123,121]
  const cockpitX = sourceX((left+right)/2), cockpitY = sourceY((top+bottom)/2)
  // Forebody and aft pressure-frame stations leave the canopy and wing tips free.
  const stations = [Math.min(bounds.max.y-length*.18, sourceY(top)+length*.045),
    Math.max(bounds.min.y+length*.18, sourceY(bottom)-length*.065)]
  const ray = new Raycaster(), meshes: Mesh[] = []
  object.traverse(child => { if (child instanceof Mesh) meshes.push(child) })
  const origin=new Vector3(),direction=new Vector3()
  const hit = (x: number, y: number, underside = false): Point | undefined => {
    // A few inward probes handle a seam between baked hull triangles. Never invent a contact in empty space.
    for(const inward of [1,.8,.5,0]){
      ray.set(origin.set(cockpitX+(x-cockpitX)*inward,y,underside ? bounds.min.z-100 : bounds.max.z+100),direction.set(0,0,underside ? 1 : -1))
      const first = ray.intersectObjects(meshes,false)[0]
      if(first)return [first.point.x,first.point.y,first.point.z]
      if(x===cockpitX)break
    }
    return undefined
  }
  const landscape = [-1,1].flatMap(level => stations.map(y => hit(cockpitX,y,level>0)))
  const shoulder = Math.max(4,Math.min((bounds.max.x-bounds.min.x)*.065,14))
  const portrait = stations.flatMap(y => [-1,1].map(side => hit(cockpitX+side*shoulder,y)))
  const cockpit=hit(cockpitX,cockpitY)
  if(!cockpit||landscape.some(p=>!p)||portrait.some(p=>!p))return undefined
  return { landscape:landscape as Point[], portrait:portrait as Point[], cockpit, canopy: profile ? {
    u:(left+right)/480-.5,v:(top+bottom)/480-.5,hingeY:sourceY(profile.hinge[1]),
  } : undefined }
}

/** Match ThreeShipPresentation's registration, yaw and perspective, then the CSS quarter-turn. */
export function projectHullDocking(data: HullRegistration, docking: HullDocking, shipX: number, shipY: number,
  size: number, width: number, height: number, landscape: boolean, canopyOpen=0): ProjectedDock {
  const logicalWidth = landscape ? height : width, logicalHeight = landscape ? width : height
  const centerX = landscape ? shipY : shipX, centerY = landscape ? logicalHeight-shipX : shipY
  const focal = raidCameraFocal(logicalHeight)
  const [sx,sy,ox,oy] = data.registration, yaw = landscape ? LANDSCAPE_VIEW_YAW : 0
  const c = Math.cos(yaw), s = Math.sin(yaw)
  const project = ([x,y,z]: Point): [number,number] => {
    const localX=(sx*x+144*sx+ox-224)*size/448,localZ=sx*z*size/448
    const px = centerX+c*localX+s*localZ
    const py = centerY-(sy*y+224-144*sy-oy)*size/448
    const pz = -s*localX+c*localZ, perspective = focal/Math.max(1,focal-pz)
    const lx = logicalWidth*.5+(px-logicalWidth*.5)*perspective
    const ly = logicalHeight*.5+(py-logicalHeight*.5)*perspective
    return landscape ? [logicalHeight-ly,lx] : [lx,ly]
  }
  const points = (landscape ? docking.landscape : docking.portrait).map(project)
  // Every row is ordered on screen; top/bottom mounts cannot cross to the opposite station.
  const contacts: DockContact[] = []
  for (let row=0;row<2;row++) {
    const pair = points.slice(row*2,row*2+2).sort((a,b)=>a[0]-b[0])
    for (let i=0;i<2;i++) contacts.push({x:pair[i][0],y:pair[i][1],side:i ? 1 : -1,level:row ? 1 : -1,
      nx:landscape ? 0 : i ? 1 : -1,ny:landscape ? row ? 1 : -1 : 0})
  }
  const [cockpitScreenX,cockpitScreenY] = project(docking.cockpit)
  let canopy: ProjectedDock['canopy']
  if(docking.canopy){
    const {u,v,hingeY}=docking.canopy
    const matrix=(open:number):DockMatrix=>{
      const angle=open*1.12, cos=Math.cos(angle),sin=Math.sin(angle)
      const surface=(u:number,v:number)=>{
        const x=(448*u-144*sx-ox+224)/sx
        const y=(144*sy+oy-224-448*v)/sy
        return project([x,hingeY+(y-hingeY)*cos,docking.cockpit[2]+(y-hingeY)*sin+.3])
      }
      const origin=surface(u,v),horizontal=surface(u+.04,v),vertical=surface(u,v+.04)
      const a=(horizontal[0]-origin[0])/.04,b=(horizontal[1]-origin[1])/.04
      const c=(vertical[0]-origin[0])/.04,d=(vertical[1]-origin[1])/.04
      return [a,b,c,d,origin[0]-a*u-c*v,origin[1]-b*u-d*v]
    }
    canopy={closed:matrix(0),open:matrix(canopyOpen)}
  }
  return { contacts, cockpitX:cockpitScreenX,cockpitY:cockpitScreenY, canopy }
}
