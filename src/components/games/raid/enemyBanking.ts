/** Cosmetic movement samples stay on the pooled render actor, not co-op packets. */
export type EnemyBankMotion = {
  x: number; y: number; time: number; kind: 'elite' | 'capital' | 'organic' | 'mothership'; paused: boolean
}
export type EnemyBankPose = { x: number; y: number; time: number; bank: number; velocity: number }
const clamp = (value: number, limit: number) => Math.max(-limit, Math.min(limit, value))
const profiles = {
  elite: { limit: .16, speed: 26, spring: 13 },
  capital: { limit: .105, speed: 16, spring: 9 },
  organic: { limit: .065, speed: 18, spring: 8 },
  mothership: { limit: .085, speed: 18, spring: 8 },
} as const

/** Exact damped spring: visible turn-in, smooth reversal, then level at rest.
 * X is logical lateral movement in both orientations, never projected pixels. */
export function updateEnemyBank(pose: EnemyBankPose, motion: EnemyBankMotion, reduced = false) {
  const dt = (motion.time - pose.time) / 1000
  const dx = motion.x - pose.x, dy = motion.y - pose.y
  if (reduced || !motion.paused && (dt < 0 || dt > .25 || Math.hypot(dx, dy) > 12)) {
    pose.bank = 0; pose.velocity = 0
  } else if (!motion.paused && dt > 0) {
    const profile = profiles[motion.kind]
    // Ignore sub-pixel co-op interpolation noise, retaining real slow drift.
    const speed = Math.abs(dx / dt) < .3 ? 0 : dx / dt
    const target = clamp(speed / profile.speed, 1) * profile.limit
    const displacement = pose.bank - target
    const impulse = pose.velocity + profile.spring * displacement
    const decay = Math.exp(-profile.spring * dt)
    pose.bank = target + (displacement + impulse * dt) * decay
    pose.velocity = (pose.velocity - profile.spring * impulse * dt) * decay
  }
  pose.x = motion.x; pose.y = motion.y; pose.time = motion.time
  return pose.bank
}
