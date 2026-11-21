import { BOSS_KEEL_DESIGNS } from './bossKeelDesigns'
import { BOSS_HULL_DESIGNS, bossDeckElevation, bossKeelElevation } from './bossHullDesigns'
import { MOB_HULL_DESIGNS,mobHullElevation,mobHullKeelElevation,mobHullPaintUV } from './mobHullDesigns'

type Profile = 'art' | 'fighter' | 'organic' | 'capital'
type VolumeInput = { pixels: Uint8ClampedArray; resolution: number; aspectX: number; aspectY: number; profile?: Profile; bossStage?: number; hullDesign?:string }
type Point = readonly [number, number]

/** Clip the original silhouette before lofting its deck and keel. */
export function buildVolumeGeometry({ pixels, resolution, aspectX, aspectY, profile, bossStage, hullDesign }: VolumeInput) {
  const boss = bossStage === undefined ? undefined : BOSS_HULL_DESIGNS[bossStage]
  const ventral=bossStage!==undefined&&Boolean(BOSS_KEEL_DESIGNS[bossStage])
  const lowerXY:number[]=[]
  const mob=hullDesign?MOB_HULL_DESIGNS[hullDesign]:undefined
  const edge = resolution - 1
  const alpha = (x: number, y: number) => pixels[(y * resolution + x) * 4 + 3] / 255 - .4
  const wantedPaintU=mob?.armorPaint?.[0]??.5,wantedPaintV=mob?.armorPaint?.[1]??.4
  let paintU=wantedPaintU,paintV=wantedPaintV,bestPaint=Infinity
  if(mob)for(let y=0;y<resolution;y++)for(let x=0;x<resolution;x++) {
    if(alpha(x,y)<.5)continue
    const d=(x/edge-wantedPaintU)**2+(y/edge-wantedPaintV)**2
    if(d<bestPaint){bestPaint=d;paintU=x/edge;paintV=y/edge}
  }
  const armorUV=(u:number,v:number):readonly[number,number]=>{
    for(let step=0;step<=12;step++){
      const t=step/12,a=Math.max(0,Math.min(1,u+(paintU-u)*t)),b=Math.max(0,Math.min(1,v+(paintV-v)*t))
      if(alpha(Math.round(a*edge),Math.round(b*edge))>.45)return[a,1-b]
    }
    return[paintU,1-paintV]
  }
  const distance = new Float32Array(resolution * resolution)
  for (let y = 0; y < resolution; y++) for (let x = 0; x < resolution; x++) {
    distance[y * resolution + x] = alpha(x, y) > 0 ? Math.min(x, y, edge - x, edge - y, resolution) : 0
  }
  for (let y = 1; y < edge; y++) for (let x = 1; x < edge; x++) {
    const i = y * resolution + x
    distance[i] = Math.min(distance[i], distance[i - 1] + 1, distance[i - resolution] + 1)
  }
  for (let y = edge - 1; y > 0; y--) for (let x = edge - 1; x > 0; x--) {
    const i = y * resolution + x
    distance[i] = Math.min(distance[i], distance[i + 1] + 1, distance[i + resolution] + 1)
  }
  const position: number[] = [], uv: number[] = [], indices: number[] = [], keel: number[] = []
  const vertices = new Map<string, number>()
  const boundary = new Map<string, readonly [number, number]>()
  const addVertex = ([x, y]: Point) => {
    const key = `${x.toFixed(5)},${y.toFixed(5)}`
    const cached = vertices.get(key)
    if (cached !== undefined) return cached
    const u = x / edge, v = y / edge
    const x0 = Math.floor(x), y0 = Math.floor(y), dx = x - x0, dy = y - y0
    const sample = (a: number, b: number) => distance[Math.max(0,Math.min(edge, b)) * resolution + Math.max(0,Math.min(edge, a))]
    const depth = sample(x0,y0)*(1-dx)*(1-dy)+sample(x0+1,y0)*dx*(1-dy)
      +sample(x0,y0+1)*(1-dx)*dy+sample(x0+1,y0+1)*dx*dy
    const bevel = Math.min(1, depth / Math.max(2, resolution * .035))
    const spine = Math.max(0, 1 - Math.abs(u - .5) / .19)
    const canopy = Math.max(0, 1 - Math.abs(u - .5) / .10)
      * Math.max(0, 1 - Math.abs(v - .4) / .18)
    const limbRadius=mob?.organic ? Math.min(.075,depth/edge*Math.min(aspectX,aspectY)*.9) : 0
    // Broad armor planes, narrow wing edges and a distinct center spine.
    // Painted highlights do not become bumps in the mesh.
    const height = boss ? bossDeckElevation(boss,u,v,bevel)
      : mob ? Math.max(mobHullElevation(mob,u,v,bevel),.006+limbRadius)
      : profile === 'fighter' ? .006 + bevel*(.017 + .035*spine + .022*canopy)
      : profile === 'capital' ? .008 + bevel*(.035 + .055*spine + .018*canopy)
      : profile === 'organic' ? .006 + bevel*(.025 + .045*spine)
      : .008 + bevel*.06
    const id = position.length / 3
    vertices.set(key, id)
    position.push((u-.5)*aspectX, (.5-v)*aspectY, height)
    uv.push(u, 1-v)
    // A rolled lower shoulder pulls inward while the painted deck and its
    // contour stay at their exact original coordinates.
    const gx=sample(x0+1,y0)-sample(x0-1,y0),gy=sample(x0,y0+1)-sample(x0,y0-1)
    const length=Math.hypot(gx,gy)||1,inset=ventral ? .0055*(1-bevel)**2 : mob ? .006*(1-bevel)**2 : 0
    lowerXY.push((u-.5+gx/length*inset)*aspectX,(.5-v-gy/length*inset)*aspectY)
    keel.push(boss ? bossKeelElevation(boss,u,v,bevel,height) : mob ? Math.min(mobHullKeelElevation(mob,u,v,bevel),-.006-limbRadius) : -height*.58)
    return id
  }
  const face = (points: Point[]) => {
    const ids = points.map(addVertex)
    for (let i = 1; i < ids.length-1; i++) indices.push(ids[0], ids[i+1], ids[i])
    for (let i = 0; i < ids.length; i++) {
      const a = ids[i], b = ids[(i+1)%ids.length]
      if (boundary.has(`${b}:${a}`)) boundary.delete(`${b}:${a}`)
      else boundary.set(`${a}:${b}`, [a,b])
    }
  }
  for (let y = 0; y < edge; y++) for (let x = 0; x < edge; x++) {
    for (const triangle of [[[x,y],[x+1,y],[x+1,y+1]],[[x,y],[x+1,y+1],[x,y+1]]] as Point[][]) {
      const clipped: Point[] = []
      for (let i = 0; i < 3; i++) {
        const a = triangle[i], b = triangle[(i+1)%3]
        const av = alpha(a[0], a[1]), bv = alpha(b[0], b[1])
        if (av > 0) clipped.push(a)
        if ((av > 0) !== (bv > 0)) {
          const t = av / (av-bv)
          clipped.push([a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t])
        }
      }
      if (clipped.length >= 3) face(clipped)
    }
  }
  const topCount = indices.length, count = position.length/3
  for (let i = 0; i < count; i++) {
    position.push(lowerXY[i*2],lowerXY[i*2+1],keel[i])
    if(mob){const paint=mobHullPaintUV(mob,uv[i*2],1-uv[i*2+1]);uv.push(...armorUV(paint[0],paint[1]))}
    else uv.push(uv[i*2],uv[i*2+1])
  }
  for (let i = 0; i < topCount; i += 3) indices.push(indices[i]+count,indices[i+2]+count,indices[i+1]+count)
  const sideStart = indices.length
  // Isolated wall normals preserve every upper face. Only mechanical
  // bosses gain the lower armor belt and the inward-rolled keel shoulder.
  for (const [a,b] of boundary.values()) {
    const quad=(points:number[][])=>{
      const start=position.length/3
      for(let j=0;j<4;j++) {
        position.push(...points[j])
        const id=j===0||j===3?a:b
        if(mob){
          const t=Math.max(0,Math.min(1,(points[j][2]+.006)/.012))
          const paint=mobHullPaintUV(mob,uv[id*2],1-uv[id*2+1],t)
          uv.push(...armorUV(paint[0],paint[1]))
        }else uv.push(uv[id*2],uv[id*2+1])
      }
      indices.push(start,start+1,start+2,start,start+2,start+3)
    }
    const point=(id:number)=>position.slice(id*3,id*3+3)
    if(mob){
      const shoulder=(id:number,t:number,z:number)=>[
        position[id*3]*(1-t)+position[(id+count)*3]*t,
        position[id*3+1]*(1-t)+position[(id+count)*3+1]*t,z]
      quad([point(a),point(b),shoulder(b,.3,.002),shoulder(a,.3,.002)])
      quad([shoulder(a,.3,.002),shoulder(b,.3,.002),shoulder(b,.7,-.002),shoulder(a,.7,-.002)])
      quad([shoulder(a,.7,-.002),shoulder(b,.7,-.002),point(b+count),point(a+count)])
    }else if(!ventral)quad([point(a),point(b),point(b+count),point(a+count)])
    else {
      const at=(id:number,z:number)=>[position[id*3],position[id*3+1],z]
      quad([point(a),point(b),at(b,0),at(a,0)])
      quad([at(a,0),at(b,0),at(b,-.009),at(a,-.009)])
      quad([at(a,-.009),at(b,-.009),point(b+count),point(a+count)])
    }
  }
  return { position: new Float32Array(position), uv: new Float32Array(uv),
    index: position.length/3 > 65535 ? new Uint32Array(indices) : new Uint16Array(indices), sideStart, deckVertexCount:count, deckIndexCount:topCount }
}

declare const self: { onmessage: ((event: MessageEvent<VolumeInput & { id: number }>) => void) | null
  postMessage(message: unknown, transfer: Transferable[]): void }
self.onmessage = event => {
  const result = buildVolumeGeometry(event.data)
  self.postMessage({ id: event.data.id, ...result }, [result.position.buffer,result.uv.buffer,result.index.buffer])
}
