/** Stage 13's AT-5 sighting is a scripted astronomical pass, not a combat entity.
 * The existing OrbitalCamera converts the intended angular size and physical radius
 * into a consistent kilometre distance at each compressed campaign keyframe. */
export const AT5_STAGE = 13
export const AT5_RADIUS_KM = 1800
export const AT5_PASS_START = 21
export const AT5_PASS_DURATION = 60
export const AT5_SIGNAL_START = 46
export const AT5_SIGNAL_DURATION = 13

const clamp01 = (value: number) => Math.max(0, Math.min(1, value))
export const isAt5Campaign = (stage: number, mode?: string) => stage === AT5_STAGE && mode === 'campaign'

export function at5PassProgress(age: number) {
  return clamp01((age - AT5_PASS_START) / AT5_PASS_DURATION)
}

export function at5DistanceKm(age: number) {
  const p = at5PassProgress(age)
  // 20 moon radii at closest approach; never a near-cockpit object.
  const encounter = Math.sin(Math.PI * p)
  return 112000 - 76000 * encounter * encounter
}

export function at5SignalOpacity(age: number) {
  const t = age - AT5_SIGNAL_START
  if (t < 0 || t >= AT5_SIGNAL_DURATION) return 0
  return Math.min(1, t / 1.1, (AT5_SIGNAL_DURATION - t) / 1.5)
}

export const AT5_SIGNAL_LINES = [
  'UNIDENTIFIED TRANSMISSION',
  'Origin: Uncharted moon',
  'Vessel ID: SM-8',
  'Status: SIGNAL LOST',
  'Last recorded depth: UNKNOWN',
] as const
