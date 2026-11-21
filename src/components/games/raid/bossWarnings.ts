import type { Enemy } from './types'

export function bossChargeKind(enemy: Enemy) {
  return enemy.bossKind === 'final' && (enemy.mirageTimer ?? 0) > 0 && enemy.mirageKind
    ? enemy.mirageKind : enemy.bossKind
}

export function bossChargeProgress(enemy: Enemy, fallbackSeconds: number) {
  const duration = enemy.attackAudio?.cue === 'charge' ? enemy.attackAudio.seconds : undefined
  const seconds = duration && Number.isFinite(duration) && duration > 0 ? duration : fallbackSeconds
  return Math.max(0,Math.min(1,1-enemy.chargeTimer/Math.max(.01,seconds)))
}
