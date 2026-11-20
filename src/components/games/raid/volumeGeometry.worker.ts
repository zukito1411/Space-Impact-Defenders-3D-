import { BOSS_HULL_DESIGNS, bossDeckElevation } from './bossHullDesigns'

type Profile = 'art' | 'fighter' | 'organic' | 'capital'
type VolumeInput = { pixels: Uint8ClampedArray; resolution: number; aspectX: number; aspectY: number; profile?: Profile; bossStage?: number }
type Point = readonly [number, number]

/** Clip the original silhouette before lofting its deck and keel. */
export function buildVolumeGeometry({ pixels, resolution, aspectX, aspectY, profile, bossStage }: VolumeInput) {
  const boss = bossStage === undefined ? undefined : BOSS_HULL_DESIGNS[bossStage]
  const edge = resolution - 1
  const alpha = (x: number, y: number) => pixels[(y * resolution + x) * 4 + 3] / 255 - .4
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
  const position: number[] = [], uv: number[] = [], indices: number[] = []
  const vertices = new Map<string, number>()
  const boundary = new Map<string, readonly [number, number]>()
  const addVertex = ([x, y]: Point) => {
    const key = `${x.toFixed(5)},${y.toFixed(5)}`
    const cached = vertices.get(key)
    if (cached !== undefined) return cached
    const u = x / edge, v = y / edge
    const x0 = Math.floor(x), y0 = Math.floor(y), dx = x - x0, dy = y - y0
    const sample = (a: number, b: number) => distance[Math.min(edge, b) * resolution + Math.min(edge, a)]
    const depth = sample(x0,y0)*(1-dx)*(1-dy)+sample(x0+1,y0)*dx*(1-dy)
      +sample(x0,y0+1)*(1-dx)*dy+sample(x0+1,y0+1)*dx*dy
    const bevel = Math.min(1, depth / Math.max(2, resolution * .035))
    const spine = Math.max(0, 1 - Math.abs(u - .5) / .19)
    const canopy = Math.max(0, 1 - Math.abs(u - .5) / .10)
      * Math.max(0, 1 - Math.abs(v - .4) / .18)
    // Broad armor planes, narrow wing edges and a distinct center spine.
    // Painted highlights do not become bumps in the mesh.
    const height = boss ? bossDeckElevation(boss,u,v,bevel)
      : profile === 'fighter' ? .006 + bevel*(.017 + .035*spine + .022*canopy)
      : profile === 'capital' ? .008 + bevel*(.035 + .055*spine + .018*canopy)
      : profile === 'organic' ? .006 + bevel*(.025 + .045*spine)
      : .008 + bevel*.06
    const id = position.length / 3
    vertices.set(key, id)
    position.push((u-.5)*aspectX, (.5-v)*aspectY, height)
    uv.push(u, 1-v)
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
    position.push(position[i*3],position[i*3+1],boss ? -boss.keel*(.5+Math.min(1,position[i*3+2]/.08)*.5) : -position[i*3+2]*.58)
    uv.push(uv[i*2],uv[i*2+1])
  }
  for (let i = 0; i < topCount; i += 3) indices.push(indices[i]+count,indices[i+2]+count,indices[i+1]+count)
  const sideStart = indices.length
  // Separate wall vertices keep the bevel's normals off the painted deck.
  for (const [a,b] of boundary.values()) {
    const start = position.length/3
    for (const id of [a,b,b+count,a+count]) {
      position.push(position[id*3],position[id*3+1],position[id*3+2])
      uv.push(uv[id*2],uv[id*2+1])
    }
    indices.push(start,start+1,start+2,start,start+2,start+3)
  }
  return { position: new Float32Array(position), uv: new Float32Array(uv),
    index: position.length/3 > 65535 ? new Uint32Array(indices) : new Uint16Array(indices), sideStart }
}

declare const self: { onmessage: ((event: MessageEvent<VolumeInput & { id: number }>) => void) | null
  postMessage(message: unknown, transfer: Transferable[]): void }
self.onmessage = event => {
  const result = buildVolumeGeometry(event.data)
  self.postMessage({ id: event.data.id, ...result }, [result.position.buffer,result.uv.buffer,result.index.buffer])
}
