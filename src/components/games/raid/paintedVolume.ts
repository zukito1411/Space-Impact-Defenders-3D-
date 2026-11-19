import { BufferGeometry, Float32BufferAttribute, Mesh, MeshStandardMaterial, Texture, SRGBColorSpace } from 'three'

type VolumeBuffers = { position: Float32Array; uv: Float32Array }
let worker: Worker | null = null
let serial = 0
const jobs = new Map<number, { resolve(value: VolumeBuffers): void; reject(error: Error): void }>()

function volumeBuffers(pixels: Uint8ClampedArray, resolution: number, width: number, height: number) {
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
    worker!.postMessage({ id, pixels, resolution, aspectX: width/Math.max(width,height),
      aspectY: height/Math.max(width,height) }, [pixels.buffer])
  })
}

/** Reconstruct a closed, lit shell from approved art when an authored mesh is absent.
 * Texture decoding and contour extraction run once during asset admission. */
export async function paintedVolume(source: CanvasImageSource, width: number, height: number, resolution = 112) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { willReadFrequently: true })!
  context.drawImage(source, 0, 0, width, height)
  const sample = document.createElement('canvas')
  sample.width = sample.height = resolution
  const probe = sample.getContext('2d', { willReadFrequently: true })!
  probe.drawImage(canvas, 0, 0, resolution, resolution)
  const pixels = probe.getImageData(0, 0, resolution, resolution).data
  const { position, uv } = await volumeBuffers(pixels, resolution, width, height)
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(position, 3))
  geometry.setAttribute('uv', new Float32BufferAttribute(uv, 2))
  geometry.computeVertexNormals()
  const map = new Texture(canvas)
  map.colorSpace = SRGBColorSpace
  map.needsUpdate = true
  const material = new MeshStandardMaterial({ map, roughness: .48, metalness: .12, alphaTest: .25 })
  material.emissive.setHex(0xffffff)
  material.emissiveMap = map
  material.emissiveIntensity = .20
  return new Mesh(geometry, material)
}
