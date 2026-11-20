import { raidCameraFocal } from './raidView'
/** Fictional Raid coordinates use kilometres, independent of viewport pixels.
 * CPU positions stay double precision; shaders receive camera-relative values. */
export const SPACE_DISTANCES = {
  nearClipKm: .08,
  dustCellKm: 15,
  starUnitKm: 1e12,
  nebulaKm: 4e14,
  galaxyKm: 2e17,
} as const

export type SpacePlacementMode = 'fixed' | 'stream' | 'scripted' | 'planet'
export type SpacePlacement = {
  mode: SpacePlacementMode
  referenceDistanceKm: number
  xKm: number; yKm: number; zKm: number
  widthKm: number; heightKm: number
  distanceKm: number
  radiusKm: number
  texture: number; epoch: number; admitted: boolean
  recycle: number
  roll: number
  ageSeconds: number; lastFrame: number
}

export function createSpacePlacement(distanceKm: number, mode: SpacePlacementMode): SpacePlacement {
  return { mode, referenceDistanceKm: distanceKm, xKm: 0, yKm: 0, zKm: 0,
    widthKm: 0, heightKm: 0, distanceKm, radiusKm: 0,
    texture: -1, epoch: -1, admitted: false, recycle: 0, roll: 0,
    ageSeconds: 0, lastFrame: -1 }
}

const positiveModulo = (value: number, span: number) => ((value % span) + span) % span

export class SpaceCamera {
  readonly positionKm = new Float64Array(3)
  readonly sunDirection = new Float32Array([-.61, -.49, .62])
  readonly starEye = new Float32Array(3)
  readonly dustEye = new Float32Array(3)
  // Nebula shaders operate in units of their own enormous distance.
  readonly eye = new Float32Array(3)
  focal = 1
  width = 1
  height = 1
  speed = 0
  frame = 0
  deltaSeconds = 0
  reducedMotion = false
  private previousSeconds: number | null = null
  private runToken: number | undefined
  private steeringX = 0
  private steeringY = 0

  setView(width: number, height: number, seconds: number, rush: number, reduced: boolean,
    steerX = 0, steerY = 0, runToken = 0, landscape = false) {
    if (this.runToken !== runToken) {
      this.runToken = runToken
      this.positionKm.fill(0)
      this.steeringX = 0; this.steeringY = 0
      this.previousSeconds = null
    }
    const dt = this.previousSeconds === null ? 0 : Math.max(0, Math.min(.05, seconds - this.previousSeconds))
    this.previousSeconds = seconds
    this.frame++
    this.deltaSeconds = reduced ? 0 : dt
    this.reducedMotion = reduced
    this.width = width; this.height = height
    this.focal = landscape ? raidCameraFocal(height) : Math.max(width, height) * .93
    this.speed = reduced ? 0 : .32 + Math.max(0, Math.min(1, rush)) * 1.1
    const blend = reduced ? 0 : 1 - Math.exp(-dt * 3)
    const x = Math.max(-1, Math.min(1, steerX)) * .28
    const y = Math.max(-1, Math.min(1, steerY)) * .18
    const dx = (x - this.steeringX) * blend, dy = (y - this.steeringY) * blend
    this.steeringX += dx; this.steeringY += dy
    // Logical flight is toward the top of the playfield. Its existing 90-degree
    // landscape transform turns this into rightward flight and leftward scenery.
    // Depth is for perspective and layering, never a substitute for flight heading.
    this.positionKm[0] += dx
    this.positionKm[1] += dy - dt * this.speed
    for (let axis = 0; axis < 3; axis++) {
      this.starEye[axis] = this.positionKm[axis] / SPACE_DISTANCES.starUnitKm
      this.eye[axis] = this.positionKm[axis] / SPACE_DISTANCES.nebulaKm
      this.dustEye[axis] = this.positionKm[axis]
    }
  }

  /** One distant key light, shared by natural scenery and friendly hulls. */
  setSunPosition(x?: number, y?: number) {
    const visible = x !== undefined && y !== undefined
    const sx = visible ? (x - this.width * .5) / this.focal : -.61
    const sy = visible ? (y - this.height * .5) / this.focal : -.49
    // A sun visible ahead lights the far side; an unseen key lights the front.
    const sz = visible ? -1 : .62
    const length = Math.hypot(sx, sy, sz)
    // Keep the current light while paused; seed the very first frame directly.
    const blend = this.frame <= 1 || this.reducedMotion ? 1 : 1 - Math.exp(-this.deltaSeconds * 2)
    const light = this.sunDirection
    light[0] += (sx / length - light[0]) * blend
    light[1] += (sy / length - light[1]) * blend
    light[2] += (sz / length - light[2]) * blend
    const scale = 1 / Math.hypot(light[0], light[1], light[2])
    light[0] *= scale; light[1] *= scale; light[2] *= scale
  }

  admit(out: SpacePlacement, xPx: number, yPx: number, widthPx: number, heightPx: number,
    width: number, height: number, texture: number, epoch: number,
    physicalWidthKm = 0, radiusKm = 0, roll = 0) {
    // A slot can change from a local wreck to a stellar-scale sun. Its new
    // physical span must be paired with its newly calculated distance.
    const keepPlacement = out.admitted && out.mode === 'stream' && out.epoch === epoch
      && out.texture === texture && physicalWidthKm === 0
    const previousX = out.xKm, previousY = out.yKm, previousZ = out.zKm
    let distanceKm = out.referenceDistanceKm
    if (physicalWidthKm > 0) distanceKm = Math.max(radiusKm * 1.025,
      physicalWidthKm * this.focal / Math.max(.001, widthPx))
    out.xKm = this.positionKm[0] + (xPx - width * .5) * distanceKm / this.focal
    out.yKm = this.positionKm[1] + (yPx - height * .5) * distanceKm / this.focal
    out.zKm = this.positionKm[2] + distanceKm
    out.widthKm = physicalWidthKm || widthPx * distanceKm / this.focal
    out.heightKm = out.widthKm * heightPx / Math.max(.001, widthPx)
    out.distanceKm = distanceKm
    out.radiusKm = radiusKm
    // Slot artwork can change only at a completed pass. Keep its newly
    // recycled world location instead of re-admitting it at the authored centre.
    if (keepPlacement) { out.xKm = previousX; out.yKm = previousY; out.zKm = previousZ }
    out.ageSeconds = 0; out.lastFrame = this.frame
    out.texture = texture; out.epoch = epoch; out.admitted = true; out.roll = roll
  }

  /** Admit recycled local scenery beyond the leading edge, at a real stable depth. */
  recycle(out: SpacePlacement, width: number, height: number) {
    out.recycle++
    const distance = out.referenceDistanceKm
    const seed = out.recycle * .61803398875 + out.referenceDistanceKm * .137
    const x = positiveModulo(seed, 1)
    out.zKm = this.positionKm[2] + distance
    out.xKm = this.positionKm[0] + (x - .5) * width * distance / this.focal
    // The full rotated footprint stays beyond the top until the camera reaches it.
    const paddingKm = Math.hypot(out.widthKm,out.heightKm)*.6 + 96*distance/this.focal
    out.yKm = this.positionKm[1] - height*.5*distance/this.focal - paddingKm
    out.ageSeconds = 0
  }

  advance(out: SpacePlacement) {
    if (out.lastFrame === this.frame) return
    out.lastFrame = this.frame
    out.ageSeconds += this.deltaSeconds
  }

  relativeDistance(out: SpacePlacement) {
    out.distanceKm = out.zKm - this.positionKm[2]
    return out.distanceKm
  }
}
