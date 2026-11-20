import { Float32BufferAttribute, Mesh, Vector3, type Object3D } from 'three'

let worker: Worker | null = null
let serial = 0
const pending = new Map<number, { resolve(values: Float32Array): void; reject(error: Error): void }>()
function bake(points: Float32Array, indices: Uint32Array | null) {
  if (!worker) {
    worker = new Worker(new URL('./hullOcclusion.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (event: MessageEvent<{ id: number; values: Float32Array }>) => {
      pending.get(event.data.id)?.resolve(event.data.values); pending.delete(event.data.id)
    }
    worker.onerror = event => {
      for (const job of pending.values()) job.reject(new Error(event.message))
      pending.clear(); worker?.terminate(); worker = null
    }
  }
  return new Promise<Float32Array>((resolve,reject) => {
    const id = serial++; pending.set(id,{ resolve,reject })
    worker!.postMessage({ id,points,indices }, [points.buffer,...(indices ? [indices.buffer] : [])])
  })
}

/** Shared vertex cavity visibility is prepared in a worker during admission.
 * No screen-space AO pass, shadow framebuffer, or per-frame ray tracing. */
export async function prepareHullOcclusion(object: Object3D) {
  object.updateMatrixWorld(true)
  const p = new Vector3(), jobs: Promise<void>[] = []
  object.traverse(child => {
    if (!(child instanceof Mesh) || child.geometry.hasAttribute('raidOcclusion')) return
    const geometry = child.geometry, positions = geometry.getAttribute('position')
    if (!positions) return
    const materials = Array.isArray(child.material) ? child.material : [child.material]
    // Animated limbs retain dynamic normals; do not paint rest-pose shadows on them.
    if (materials.some(material => material.userData.bossOrganicLimb)) {
      geometry.setAttribute('raidOcclusion',new Float32BufferAttribute(new Float32Array(positions.count).fill(1),1)); return
    }
    const points = new Float32Array(positions.count*3)
    for (let i = 0; i < positions.count; i++) {
      p.fromBufferAttribute(positions,i).applyMatrix4(child.matrixWorld)
      points[i*3] = p.x; points[i*3+1] = p.y; points[i*3+2] = p.z
    }
    const indices = geometry.index ? new Uint32Array(geometry.index.array) : null
    jobs.push(bake(points,indices).then(values => { geometry.setAttribute('raidOcclusion',new Float32BufferAttribute(values,1)) }))
  })
  await Promise.all(jobs)
}
