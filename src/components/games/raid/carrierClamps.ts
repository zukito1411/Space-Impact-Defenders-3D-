import { getPublicAssetUrl } from '../sound'
import { makeImageCanvasSprite, getCanvasSpriteDimensions } from './assets'
import type { DockContact } from './hullDocking'

export const DOCK_CLAMP_PATH = 'assets/carrier/dock-clamp-atlas-v2.png'
export const getDockClampAtlas = () => makeImageCanvasSprite('dock-clamps-v2', getPublicAssetUrl(DOCK_CLAMP_PATH))
export type DockMount = { x: number; y: number; hull: number; floor: number; ceiling: number; mech: boolean; contacts?: DockContact[] }
const ease = (n: number) => { const t = Math.max(0, Math.min(1, n)); return t*t*(3-2*t) }
/** All points are in carrier artwork space, so mounts travel with the carrier. */
export function sampleDockClamps(dock: DockMount, release: number) {
  const r=ease(release)
  const contacts = dock.contacts ?? [-1,1].flatMap(side=>[-1,1].map(level=>({
    side, level, x:dock.x+side*dock.hull*(dock.mech?.23:.25),
    y:dock.y+dock.hull*(dock.mech?(level<0?-.02:.16):level<0?-.035:.14), nx:side,ny:0,
  })))
  return contacts.map(contact=>{
    const { side,level,nx,ny } = contact
    const bx=dock.x+side*dock.hull*.62
    const by=level<0?dock.ceiling+30:dock.floor-30
    const jawScale=dock.hull*.000095
    const jawAngle=Math.atan2(-ny,-nx)
    // The orange pads meet the hull. The hinge is outside it, not buried in its center.
    const contactX=contact.x+nx*dock.hull*.065*Math.min(1,r/.22)
    const contactY=contact.y+ny*dock.hull*.065*Math.min(1,r/.22)
    const hingeX=contactX-Math.cos(jawAngle)*375*jawScale
    const hingeY=contactY-Math.sin(jawAngle)*375*jawScale
    const fold=ease((r-.22)/.78)
    const tx=hingeX+(bx-side*dock.hull*.10-hingeX)*fold
    const ty=hingeY+(by-level*dock.hull*.04-hingeY)*fold
    const dx=tx-bx,dy=ty-by,d=Math.max(.001,Math.hypot(dx,dy))
    // Equal-length links remain rigid through the complete release stroke.
    const length=Math.max(Math.hypot(contact.x-Math.cos(jawAngle)*375*jawScale-bx,
      contact.y-Math.sin(jawAngle)*375*jawScale-by)*.60,dock.hull*.20)
    const h=Math.sqrt(Math.max(0,length*length-d*d/4))
    const ex=(bx+tx)/2-side*level*dy/d*h,ey=(by+ty)/2+side*level*dx/d*h
    return {bx,by,ex,ey,tx,ty,side,level,length,jawAngle,jawScale}
  })
}
type ClampPose = ReturnType<typeof sampleDockClamps>
type Piece = readonly [readonly number[], readonly number[], number, number, number, number, number]
const PLINTH = [40,120,620,365], PLINTH_PIVOT = [350,230]
const UPPER = [680,160,850,260], UPPER_PIVOT = [750,310]
const LOWER = [70,680,665,220], LOWER_PIVOT = [160,800]
const JAW = [860,640,575,295], JAW_PIVOT = [945,800]
const sampledPoses = new WeakMap<DockMount, { release: number; pose: ClampPose }>()
function clampPose(dock: DockMount, release: number) {
  let entry = sampledPoses.get(dock)
  if (!entry || entry.release !== release) {
    entry = { release, pose: sampleDockClamps(dock, release) }
    sampledPoses.set(dock, entry)
  }
  return entry.pose
}
function visitPieces(pose: ClampPose, layer: string, visit: (...piece: Piece) => void) {
  for (const a of pose) {
    if (layer !== 'front') {
      visit(PLINTH,PLINTH_PIVOT,a.bx,a.by,.125,0,a.level<0?-1:1)
      visit(UPPER,UPPER_PIVOT,a.bx,a.by,a.length/700,Math.atan2(a.ey-a.by,a.ex-a.bx),1)
      visit(LOWER,LOWER_PIVOT,a.ex,a.ey,a.length/515,Math.atan2(a.ty-a.ey,a.tx-a.ex),1)
    }
    if (layer !== 'back') visit(JAW,JAW_PIVOT,a.tx,a.ty,a.jawScale,a.jawAngle,1)
  }
}
function drawPieces(ctx: CanvasRenderingContext2D, source: CanvasImageSource, pose: ClampPose, layer: string) {
  visitPieces(pose,layer,(rect,pivot,x,y,scale,angle,flip) => {
    ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.scale(scale,scale*flip)
    ctx.drawImage(source,rect[0],rect[1],rect[2],rect[3],rect[0]-pivot[0],rect[1]-pivot[1],rect[2],rect[3]);ctx.restore()
  })
}
type ClampBitmap = { dock: DockMount; release: number; source: CanvasImageSource; transform: DOMMatrix;
  layer: string; smoothing: boolean; quality: ImageSmoothingQuality; canvas: HTMLCanvasElement; x: number; y: number }
// One tight, full-resolution settled pose per destination context. Moving links
// still render every frame; no time quantization or animation-frame cache.
const settledClamps = new WeakMap<CanvasRenderingContext2D, ClampBitmap>()
function bakeSettledClamps(ctx: CanvasRenderingContext2D, source: CanvasImageSource, dock: DockMount,
  release: number, layer: string, transform: DOMMatrix, pose: ClampPose): ClampBitmap | undefined {
  let left=Infinity,top=Infinity,right=-Infinity,bottom=-Infinity
  visitPieces(pose,layer,(rect,pivot,x,y,scale,angle,flip) => {
    const c=Math.cos(angle),s=Math.sin(angle)
    for (const u of [rect[0]-pivot[0],rect[0]+rect[2]-pivot[0]]) {
      for (const v of [rect[1]-pivot[1],rect[1]+rect[3]-pivot[1]]) {
        const px=x+scale*(u*c-v*flip*s),py=y+scale*(u*s+v*flip*c)
        const screenX=transform.a*px+transform.c*py+transform.e,screenY=transform.b*px+transform.d*py+transform.f
        left=Math.min(left,screenX);right=Math.max(right,screenX);top=Math.min(top,screenY);bottom=Math.max(bottom,screenY)
      }
    }
  })
  const x=Math.floor(left-2),y=Math.floor(top-2)
  const width=Math.ceil(right-x+2),height=Math.ceil(bottom-y+2)
  // Fall back to the original draws rather than reduce detail on large displays.
  if (!Number.isFinite(width*height) || width*height>4*1024*1024) return
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height
  const bake=canvas.getContext('2d');if(!bake)return
  bake.imageSmoothingEnabled=ctx.imageSmoothingEnabled;bake.imageSmoothingQuality=ctx.imageSmoothingQuality
  bake.setTransform(transform.a,transform.b,transform.c,transform.d,transform.e-x,transform.f-y)
  drawPieces(bake,source,pose,layer)
  return {dock,release,source,transform,layer,smoothing:ctx.imageSmoothingEnabled,quality:ctx.imageSmoothingQuality,canvas,x,y}
}
/** Atlas pieces rotate around their painted pivots; never stretch image axes. */
export function drawDockClamps(ctx:CanvasRenderingContext2D,dock:DockMount,release:number, source?:CanvasImageSource, layer:'all'|'back'|'front'='all'){
  const sprite=source?null:getDockClampAtlas()
  if(!source&&!sprite?.loaded)return
  const bitmap=source??getCanvasSpriteDimensions(sprite!).source
  const pose=clampPose(dock,release)
  if ((release===0 || release===1) && ctx.globalAlpha===1 && ctx.globalCompositeOperation==='source-over' && ctx.filter==='none') {
    const transform=ctx.getTransform()
    let cache=settledClamps.get(ctx)
    if (!cache || cache.dock!==dock || cache.release!==release || cache.source!==bitmap || cache.transform.a!==transform.a || cache.transform.b!==transform.b || cache.transform.c!==transform.c || cache.transform.d!==transform.d || cache.layer!==layer || cache.smoothing!==ctx.imageSmoothingEnabled || cache.quality!==ctx.imageSmoothingQuality) {
      cache=bakeSettledClamps(ctx,bitmap,dock,release,layer,transform,pose)
      if(cache)settledClamps.set(ctx,cache)
    }
    if(cache){
      const dx=transform.e-cache.transform.e,dy=transform.f-cache.transform.f
      // Copy physical pixels at integer offsets: no second scaling/filter pass.
      // Moving fractional offsets use the original atlas draws instead.
      if(Math.abs(dx-Math.round(dx))<1e-6 && Math.abs(dy-Math.round(dy))<1e-6){
        ctx.save();ctx.setTransform(1,0,0,1,0,0)
        ctx.drawImage(cache.canvas,cache.x+Math.round(dx),cache.y+Math.round(dy));ctx.restore();return
      }
    }
  }
  drawPieces(ctx,bitmap,pose,layer)
}
