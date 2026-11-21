/** Shared presentation-only lighting in the background's X-right/Y-down frame.
 * Colors are linear RGB. No collision, stage, or ship-stat state lives here. */
type RGB = readonly [number, number, number]
const linear = (hex: number): RGB => {
  const channel = (n: number) => n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4
  return [channel((hex >>> 16 & 255) / 255), channel((hex >>> 8 & 255) / 255), channel((hex & 255) / 255)]
}
export const SHIP_LIGHTING_PALETTES = [
  { sky: linear(0xa0c5e4), ground: linear(0x182436), key: linear(0xfff0dc), fill: linear(0x86bddc), sun: 2.8, ambient: .20, bounce: .12, reflection: .30 },
  { sky: linear(0xc6bcaa), ground: linear(0x30251e), key: linear(0xffedcd), fill: linear(0xd5ad76), sun: 2.7, ambient: .18, bounce: .10, reflection: .28 },
  { sky: linear(0x9fb9ba), ground: linear(0x182225), key: linear(0xf3f0e4), fill: linear(0x86b1af), sun: 2.6, ambient: .17, bounce: .09, reflection: .26 },
  { sky: linear(0xada8cb), ground: linear(0x251d36), key: linear(0xf6eaf3), fill: linear(0xaaa0cf), sun: 2.8, ambient: .19, bounce: .11, reflection: .29 },
  { sky: linear(0xb4d1e7), ground: linear(0x3a768d), key: linear(0xfff0d9), fill: linear(0x7cb8d1), sun: 2.7, ambient: .48, bounce: .60, reflection: .42 },
  { sky: linear(0xaa9c9b), ground: linear(0xb14c24), key: linear(0xffd9ad), fill: linear(0xf08a45), sun: 2.3, ambient: .36, bounce: .65, reflection: .38 },
  { sky: linear(0xc9d8df), ground: linear(0x715744), key: linear(0xf0f7ff), fill: linear(0xffc382), sun: 3.0, ambient: .58, bounce: .50, reflection: .50 },
] as const

export type ShipLightingFrame = {
  sun: Float32Array; fillDirection: Float32Array
  keyColor: Float32Array; skyColor: Float32Array; groundColor: Float32Array; fillColor: Float32Array
  sunIntensity: number; ambientIntensity: number; fillIntensity: number; reflectionIntensity: number
  probe: number; seconds: number
}
export function createShipLightingFrame(): ShipLightingFrame {
  const out = { sun: new Float32Array([-.61, -.49, .62]), fillDirection: new Float32Array([.7, .35, .55]),
    keyColor: new Float32Array(3), skyColor: new Float32Array(3), groundColor: new Float32Array(3), fillColor: new Float32Array(3),
    sunIntensity: 2.8, ambientIntensity: .34, fillIntensity: .34, reflectionIntensity: .36, probe: 0, seconds: 0 }
  sampleShipLighting(out, out.sun, 0, 0, 0, 0)
  return out
}
export function sampleShipLighting(out: ShipLightingFrame, sun: Float32Array, region: number,
  surface: 0 | 1 | 2, surfaceAlpha: number, seconds: number) {
  const index = Math.max(0, Math.min(3, region)), space = SHIP_LIGHTING_PALETTES[index]
  const ground = SHIP_LIGHTING_PALETTES[surface === 1 ? 4 : surface === 2 ? 5 : index]
  const t = surface ? Math.max(0, Math.min(1, surfaceAlpha)) : 0
  for (let axis = 0; axis < 3; axis++) {
    // Nearby hulls and planets see the same distant source: direction and
    // irradiance do not change with a few kilometres of camera/ship movement.
    out.sun[axis] = sun[axis]
    out.keyColor[axis] = space.key[axis] + (ground.key[axis] - space.key[axis]) * t
    out.skyColor[axis] = space.sky[axis] + (ground.sky[axis] - space.sky[axis]) * t
    out.groundColor[axis] = space.ground[axis] + (ground.ground[axis] - space.ground[axis]) * t
    out.fillColor[axis] = space.fill[axis] + (ground.fill[axis] - space.fill[axis]) * t
  }
  const length = Math.hypot(out.sun[0], out.sun[1], out.sun[2])
  for (let axis = 0; axis < 3; axis++) out.sun[axis] /= length
  // Planetary bounce comes from below; distant nebula fill comes from the other flank.
  out.fillDirection[0] = -out.sun[0] * (1 - t) + .3 * t
  out.fillDirection[1] = -out.sun[1] * (1 - t) + .75 * t
  out.fillDirection[2] = .55
  out.sunIntensity = space.sun + (ground.sun - space.sun) * t
  out.ambientIntensity = space.ambient + (ground.ambient - space.ambient) * t
  out.fillIntensity = space.bounce + (ground.bounce - space.bounce) * t
  out.reflectionIntensity = space.reflection + (ground.reflection - space.reflection) * t
  out.probe = t > .5 ? surface === 1 ? 4 : 5 : index
  out.seconds = seconds
}
