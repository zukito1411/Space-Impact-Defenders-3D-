import { hullDistanceField, protectionContour } from './protectionGeometry'

export const PROTECTION_BANKS = 43
export const PROTECTION_DEFAULT_BANK_RANGE = .14
export const PROTECTION_POINTS = 256
export const PROTECTION_STRIDE = PROTECTION_POINTS * 2 * 3
const EDGE = 192, HULL = 144

/** Rasterize the actual mesh projection on a worker, never read the GPU. */
export function projectProtection(vertices: Float32Array, indices: Uint32Array,
  registration: readonly number[], angle: number) {
  const [sx, sy, ox, oy] = registration
  const cos = Math.cos(angle), sin = Math.sin(angle)
  const projected = new Float32Array(vertices.length / 3 * 2)
  const alpha = new Uint8ClampedArray(EDGE * EDGE * 4)
  const pixel = (x: number, y: number) => {
    if (x >= 0 && y >= 0 && x < EDGE && y < EDGE) alpha[(y * EDGE + x) * 4 + 3] = 255
  }
  for (let i = 0, j = 0; i < vertices.length; i += 3, j += 2) {
    projected[j] = EDGE/2 + HULL*(sx*(cos*vertices[i]+sin*vertices[i+2])+144*sx+ox-224)/448
    projected[j+1] = EDGE/2 - HULL*(sy*vertices[i+1]+224-144*sy-oy)/448
  }
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i]*2, b = indices[i+1]*2, c = indices[i+2]*2
    const ax = projected[a], ay = projected[a+1], bx = projected[b], by = projected[b+1]
    const cx = projected[c], cy = projected[c+1]
    // Edges retain subpixel antennae, fins and barrels in the silhouette.
    for (const [x0,y0,x1,y1] of [[ax,ay,bx,by],[bx,by,cx,cy],[cx,cy,ax,ay]]) {
      const steps = Math.max(1,Math.ceil(Math.max(Math.abs(x1-x0),Math.abs(y1-y0))))
      for (let n = 0; n <= steps; n++) pixel(Math.floor(x0+(x1-x0)*n/steps),Math.floor(y0+(y1-y0)*n/steps))
    }
    const low = Math.max(0,Math.floor(Math.min(ay,by,cy)))
    const high = Math.min(EDGE-1,Math.ceil(Math.max(ay,by,cy)))
    for (let row = low; row <= high; row++) {
      const y = row+.5
      let left = Infinity, right = -Infinity
      for (const [x0,y0,x1,y1] of [[ax,ay,bx,by],[bx,by,cx,cy],[cx,cy,ax,ay]]) {
        if ((y0 <= y && y1 > y) || (y1 <= y && y0 > y)) {
          const x = x0+(x1-x0)*(y-y0)/(y1-y0)
          left = Math.min(left,x); right = Math.max(right,x)
        }
      }
      if (right < left) continue
      for (let x = Math.max(0,Math.floor(left)); x <= Math.min(EDGE-1,Math.ceil(right)); x++) pixel(x,row)
    }
  }
  const distance = hullDistanceField(alpha,EDGE,EDGE)
  const result = new Float32Array(PROTECTION_STRIDE)
  for (const [layer,padding] of [0,7*HULL/192,13*HULL/192].entries()) {
    const path = protectionContour(distance,EDGE,EDGE,padding)
    // Anchor every perimeter at the nose so adjacent banks interpolate smoothly.
    for (let point = 0; point < PROTECTION_POINTS; point++) {
      const source = (path.nose+point)%PROTECTION_POINTS*2
      const target = layer*PROTECTION_POINTS*2+point*2
      result[target] = path.points[source]/HULL
      result[target+1] = path.points[source+1]/HULL
    }
  }
  return result
}

/** Continuous bank/pose interpolation; reuse output storage on every frame. */
export function blendProtection(frames: Float32Array, poses: number, bank: number,
  landscape: boolean, attack: number, crouch: number, output: Float32Array, bankRange = PROTECTION_DEFAULT_BANK_RANGE) {
  const last = PROTECTION_BANKS - 1
  const position = Math.max(0, Math.min(last, (1 + bank / bankRange) * last / 2))
  const low = Math.floor(position), high = Math.min(last, low + 1), t = position - low
  output.fill(0)
  for (let pose = 0; pose < poses; pose++) {
    const weight = poses === 1 ? 1 : ((pose&1) ? attack : 1-attack)*((pose&2) ? crouch : 1-crouch)
    if (weight <= 0) continue
    const offset = ((Number(landscape)*poses+pose)*PROTECTION_BANKS+low)*PROTECTION_STRIDE
    const next = offset+(high-low)*PROTECTION_STRIDE
    for (let i = 0; i < output.length; i++) output[i] += (frames[offset+i]*(1-t)+frames[next+i]*t)*weight
  }
  // Match the mech dock rig's extra rotation in the logical flight plane.
  if (poses > 1 && landscape && crouch > 0) {
    const angle = -crouch*Math.PI/2, c = Math.cos(angle), s = Math.sin(angle)
    for (let i = 0; i < output.length; i += 2) {
      const x = output[i], y = output[i+1]
      output[i] = c*x-s*y; output[i+1] = s*x+c*y
    }
  }
}
