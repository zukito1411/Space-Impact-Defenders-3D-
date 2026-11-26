import type { OrbitalShadow } from './flightEffects'

type SectorLight = {
  sun: readonly [number, number, number]
  wreckAt?: number
}

// Bearings are in the logical playfield. Landscape uses the same rotated
// scene, so the sun, ship lighting and shadow all turn together.
const SECTOR_LIGHTS: Readonly<Partial<Record<number, SectorLight>>> = {
  2: { sun: [-.72, -.33, .64], wreckAt: 18 },
  4: { sun: [.77, -.24, .59], wreckAt: 24 },
  5: { sun: [-.50, -.64, .58] },
  6: { sun: [.73, -.29, .61], wreckAt: 26 },
  7: { sun: [-.86, -.16, .48], wreckAt: 18 },
  8: { sun: [.65, -.43, .62], wreckAt: 21 },
  9: { sun: [-.76, -.26, .59], wreckAt: 24 },
  10: { sun: [.46, -.71, .53] },
  11: { sun: [-.67, -.40, .62], wreckAt: 19 },
  12: { sun: [.89, -.13, .42], wreckAt: 23 },
  14: { sun: [-.83, -.25, .49], wreckAt: 20 },
  15: { sun: [.72, -.38, .58], wreckAt: 25 },
}

export const getRaidSectorLight = (stage: number) => SECTOR_LIGHTS[stage]

const smooth = (value: number) => {
  const t = Math.max(0, Math.min(1, value))
  return t * t * (3 - 2 * t)
}

export function raidRevealGain(secondsRemaining: number) {
  if (secondsRemaining <= 0 || secondsRemaining >= 5 || !Number.isFinite(secondsRemaining)) return 1
  return 1 - .76 * smooth((5 - secondsRemaining) / 1.4)
}

export type WreckFlyby = { x: number; y: number; size: number; alpha: number; rotation: number }

export function sampleSectorWreck(out: WreckFlyby, shadow: OrbitalShadow, age: number, start: number,
  width: number, height: number, sun: Float32Array) {
  const t = (age - start) / 3.8
  shadow.strength = 0
  if (t <= 0 || t >= 1) return false

  const span = Math.min(width, height)
  const side = Math.sign(sun[0]) || -1
  const padding = span * .35
  out.x = width * (.5 + side * (.48 - .035 * Math.sin(t * Math.PI)))
  out.y = -padding + (height + padding * 2) * t
  out.size = span * (.37 + t * .23)
  out.alpha = .92 * smooth(t / .14) * smooth((1 - t) / .14)
  out.rotation = side * (.34 - .48 * t)

  // Trace the wreck's penumbra away from the directional sun. Only hulls
  // sample it, leaving the foreground bullets, warnings and HUD legible.
  const dx = -sun[0], dy = -sun[1]
  const reach = width * .46 / Math.max(.2, Math.abs(dx))
  shadow.x = out.x + dx * reach
  shadow.y = out.y + dy * reach
  shadow.length = 2.4 * reach * Math.hypot(dx, dy)
  shadow.width = out.size * .73
  shadow.rotation = Math.atan2(dy, dx)
  shadow.strength = out.alpha * .52
  shadow.sunSide = side
  return true
}
