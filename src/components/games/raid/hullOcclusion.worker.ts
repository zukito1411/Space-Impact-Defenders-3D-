import { bakeHullOcclusion } from './hullOcclusionBake'
self.onmessage = (event: MessageEvent<{ id: number; points: Float32Array; indices: Uint32Array | null }>) => {
  const { id, points, indices } = event.data
  const values = bakeHullOcclusion(points,indices)
  self.postMessage({ id,values }, { transfer: [values.buffer] })
}
