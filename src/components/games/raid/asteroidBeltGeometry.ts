import { Geometry } from 'pixi.js'
import { IcosahedronGeometry } from 'three'
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js'

function generator(seed: number) {
  let state = seed >>> 0
  return () => { state = (Math.imul(state,1664525)+1013904223) >>> 0;return state/4294967296 }
}

type Stone = { positions: Float32Array; normals: Float32Array; cavity: Float32Array; indices: Uint16Array }

/** Chipped boulders, flattened fragments and cratered chunks; built only at load. */
function stone(detail: number, variant: number): Stone {
  const random = generator(variant*7919+1847)
  const source = new IcosahedronGeometry(1,detail)
  source.deleteAttribute('normal');source.deleteAttribute('uv')
  const geometry = mergeVertices(source,1e-5)
  source.dispose()
  const positions = geometry.getAttribute('position')
  const cavity = new Float32Array(positions.count)
  const phase = random()*Math.PI*2
  const craters = Array.from({ length: 4 }, () => {
    const x = random()*2-1,y = random()*2-1,z = random()*2-1
    const length = Math.hypot(x,y,z)
    return [x/length,y/length,z/length,.76+random()*.15,.16+random()*.22]
  })
  for (let i=0;i<positions.count;i++) {
    const x = positions.getX(i),y = positions.getY(i),z = positions.getZ(i)
    let radius = 1+.14*Math.sin(x*4.7+y*3.2+phase)*Math.cos(z*5.3-phase)
      +.075*Math.sin(x*11.3-z*7.1+phase)*Math.cos(y*8.2+z*2.9)
    let dent = 0
    for (const [cx,cy,cz,edge,depth] of craters) {
      const cap = Math.max(0,(x*cx+y*cy+z*cz-edge)/(1-edge))
      dent += cap*cap*depth
    }
    radius -= dent
    // Large fracture planes break the spherical silhouette, including wedges.
    const cut = x*Math.cos(phase)+y*Math.sin(phase)*.6+z*.35
    if (cut > .58) radius = Math.min(radius,.68/cut)
    radius = Math.max(.48,radius)
    positions.setXYZ(i,x*radius,y*radius,z*radius)
    cavity[i] = Math.max(.58,1-dent*1.4)
  }
  geometry.computeVertexNormals()
  const normals = geometry.getAttribute('normal')
  const normalData = new Float32Array(positions.count*3)
  for (let i=0;i<positions.count;i++) {
    const x = positions.getX(i),y = positions.getY(i),z = positions.getZ(i),r = Math.hypot(x,y,z)
    const nx = normals.getX(i)*.78+x/r*.22,ny = normals.getY(i)*.78+y/r*.22,nz = normals.getZ(i)*.78+z/r*.22
    const length = Math.hypot(nx,ny,nz)
    normalData.set([nx/length,ny/length,nz/length],i*3)
  }
  const data = { positions: new Float32Array(positions.array), normals: normalData, cavity,
    indices: new Uint16Array(geometry.getIndex()!.array) }
  geometry.dispose()
  return data
}

/** Three bounded detail bands in one merged 3D batch (~21k triangles).
 * Position, depth, scale, silhouette and spin each use independent random draws. */
export function createAsteroidBeltGeometry() {
  const random = generator(0x51d3b317)
  const templates = [3,1,0].map(detail => Array.from({ length: 8 },(_,variant) => stone(detail,variant+detail*11)))
  const counts = [20,120,240]
  const vertexCount = counts.reduce((sum,count,band) => sum+count*templates[band][0].cavity.length,0)
  const xy = new Float32Array(vertexCount*2), hull = new Float32Array(vertexCount*3)
  const normals = new Float32Array(vertexCount*4), centers = new Float32Array(vertexCount*4)
  const shapes = new Float32Array(vertexCount*4), motion = new Float32Array(vertexCount*4)
  const indexCount = counts.reduce((sum,count,band) => sum+count*templates[band][0].indices.length,0)
  const indices = new Uint16Array(indexCount)
  let offset = 0,indexOffset = 0
  for (let band=0;band<counts.length;band++) for (let rock=0;rock<counts[band];rock++) {
    const model = templates[band][Math.floor(random()*8)]
    const seed = random(),x = (random()-.5)*1.65
    const forward = random()*25+(x+.825)*3+random()*4
    const depth = band === 0 ? 12+random()*16 : band === 1 ? 19+random()*38 : 32+random()*64
    const size = band === 0 ? .60+random()*.95 : band === 1 ? .11+random()*.42 : .025+random()*.12
    let sx = .62+random()*.8,sy = .60+random()*.85,sz = .58+random()*.9
    if (rock%7 === 0) sy *= .42
    if (rock%11 === 0) sx *= 1.35
    const extent = 1.25/Math.max(sx,sy,sz)
    sx *= extent;sy *= extent;sz *= extent
    const ax = random()*2-1,ay = random()*2-1,az = random()*2-1,length = Math.hypot(ax,ay,az)
    const rate = (.025+random()*.075)*(random()<.5 ? -1 : 1)
    for (let i=0;i<model.cavity.length;i++) {
      const n = offset+i,p = i*3
      xy[n*2] = model.positions[p];xy[n*2+1] = model.positions[p+1]
      hull.set(model.positions.subarray(p,p+3),n*3)
      normals.set([model.normals[p],model.normals[p+1],model.normals[p+2],model.cavity[i]],n*4)
      centers.set([x,forward,depth,seed],n*4)
      shapes.set([sx,sy,sz,size],n*4)
      motion.set([ax/length,ay/length,az/length,rate],n*4)
    }
    for (const index of model.indices) indices[indexOffset++] = offset+index
    offset += model.cavity.length
  }
  const geometry = new Geometry({ attributes: {
    aPosition: { buffer: xy, format: 'float32x2' }, aHull: { buffer: hull, format: 'float32x3' },
    aNormal: { buffer: normals, format: 'float32x4' }, aRock: { buffer: centers, format: 'float32x4' },
    aShape: { buffer: shapes, format: 'float32x4' }, aMotion: { buffer: motion, format: 'float32x4' },
  }, indexBuffer: indices })
  geometry.autoGarbageCollect = false
  return geometry
}
