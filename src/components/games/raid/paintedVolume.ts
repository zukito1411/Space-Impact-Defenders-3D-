import { BufferAttribute, BufferGeometry, Color, Float32BufferAttribute, Mesh, MeshStandardMaterial, Texture, SRGBColorSpace, LinearMipmapLinearFilter } from 'three'

export type VolumeProfile = 'art' | 'fighter' | 'organic' | 'capital'

type VolumeBuffers = { position: Float32Array; uv: Float32Array; index?: Uint16Array | Uint32Array; sideStart: number }
let worker: Worker | null = null
let serial = 0
const jobs = new Map<number, { resolve(value: VolumeBuffers): void; reject(error: Error): void }>()

function volumeBuffers(pixels: Uint8ClampedArray, resolution: number, width: number, height: number, profile: VolumeProfile, bossStage?: number,hullDesign?:string) {
  if (!worker) {
    worker = new Worker(new URL('./volumeGeometry.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (event: MessageEvent<VolumeBuffers & { id: number }>) => {
      jobs.get(event.data.id)?.resolve(event.data)
      jobs.delete(event.data.id)
    }
    worker.onerror = event => {
      for (const job of jobs.values()) job.reject(new Error(event.message))
      jobs.clear()
      worker?.terminate()
      worker = null
    }
  }
  const id = serial++
  return new Promise<VolumeBuffers>((resolve, reject) => {
    jobs.set(id, { resolve, reject })
    worker!.postMessage({ id, pixels, resolution, profile, bossStage, hullDesign, aspectX: width/Math.max(width,height),
      aspectY: height/Math.max(width,height) }, [pixels.buffer])
  })
}

/** Reconstruct a closed, lit shell from approved art when an authored mesh is absent.
 * Texture decoding and contour extraction run once during asset admission. */
export async function paintedVolume(source: CanvasImageSource, width: number, height: number, resolution = 112, profile: VolumeProfile = 'art', filter = 'none', bossStage?: number,hullDesign?:string) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { willReadFrequently: true })!
  context.filter = filter
  context.drawImage(source, 0, 0, width, height)
  context.filter = 'none'
  const sample = document.createElement('canvas')
  sample.width = sample.height = resolution
  const probe = sample.getContext('2d', { willReadFrequently: true })!
  probe.drawImage(canvas, 0, 0, resolution, resolution)
  const pixels = probe.getImageData(0, 0, resolution, resolution).data
  const { position, uv, index, sideStart } = await volumeBuffers(pixels, resolution, width, height, profile, bossStage,hullDesign)
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(position, 3))
  geometry.setAttribute('uv', new Float32BufferAttribute(uv, 2))
  if (index) geometry.setIndex(new BufferAttribute(index, 1))
  const colors = new Float32Array(position.length).fill(1)
  const walls = new Float32Array(position.length/3)
  const wallColor = new Color(0xa9b6c5), wallVertex = index ? index[sideStart] : sideStart
  for (let i = wallVertex; i < walls.length; i++) {
    colors[i*3] = wallColor.r; colors[i*3+1] = wallColor.g; colors[i*3+2] = wallColor.b
    walls[i] = 1
  }
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3))
  geometry.setAttribute('hullWall', new Float32BufferAttribute(walls, 1))
  geometry.computeVertexNormals()
  const map = new Texture(canvas)
  map.colorSpace = SRGBColorSpace
  map.generateMipmaps = true
  map.minFilter = LinearMipmapLinearFilter
  map.needsUpdate = true
  const material = new MeshStandardMaterial({ map, roughness: .52, metalness: .22, alphaTest: .15, vertexColors: true })
  material.emissive.setHex(0xffffff)
  material.emissiveMap = map
  material.emissiveIntensity = .20
  if (bossStage !== undefined) material.userData.bossHullStage = bossStage
  material.userData.raidVolumeSurface = true
  return new Mesh(geometry, material)
}
