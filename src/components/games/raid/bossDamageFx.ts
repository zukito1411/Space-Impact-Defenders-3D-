import { BOSS_FX, drawBossFx } from './combatArt'
import { COMMAND_PHASE_HP } from './commandBoss'
import type { BossImpactKind, Enemy, Shot } from './types'

const IMPACT_SECONDS = .22

export function isRaidBossShielded(enemy: Enemy) {
  return enemy.isBoss ? enemy.shieldTime > 0 || enemy.y < 15
    : enemy.isMiniBoss && (enemy.shieldTime > 0 || enemy.y < 8)
}

export function getBossForceFieldStrength(enemy: Enemy) {
  if (enemy.hp <= 0) return 0
  const flash = enemy.bossImpact?.kind === 'shield' ? Math.min(1, (enemy.bossImpactTime ?? 0) / IMPACT_SECONDS) : 0
  return isRaidBossShielded(enemy) ? .76 + flash * .24 : flash * .55
}

export function recordBossImpact(enemy: Enemy, shot: Shot, shielded: boolean): BossImpactKind | undefined {
  if (!enemy.isBoss && !enemy.isMiniBoss) return
  const x = shot.x - enemy.x
  const y = shot.y - enemy.y
  const heavy = shot.kind === 'rocket' || shot.kind === 'homing' || shot.kind === 'coreBlast'
  const exposedCore = !heavy && enemy.bossArtStage !== undefined && y >= 0
    && enemy.hp / Math.max(1, enemy.maxHp) <= COMMAND_PHASE_HP.critical && Math.abs(x) <= enemy.radius * .24
  const kind = shielded ? 'shield' : heavy ? 'heavy' : exposedCore ? 'core' : 'armor'
  const recent = enemy.bossImpactTime ?? 0
  if (recent > .10 && (enemy.bossImpact?.kind !== 'armor' || kind === 'armor')) return
  enemy.bossImpact = { kind, shotId: shot.id, x, y }
  enemy.bossImpactTime = IMPACT_SECONDS
  return kind
}

export function drawBossImpact(ctx: CanvasRenderingContext2D, enemy: Enemy, x: number, y: number,
  pixelsPerX: number, pixelsPerY: number, size: number, reducedMotion: boolean) {
  const impact = enemy.bossImpact
  const time = enemy.bossImpactTime ?? 0
  if (!impact || time <= 0 || impact.kind === 'shield') return
  const progress = 1 - Math.min(1, time / IMPACT_SECONDS)
  const heavy = impact.kind === 'heavy'
  const core = impact.kind === 'core'
  const dx = impact.x * pixelsPerX
  const dy = impact.y * pixelsPerY
  // Keep contact on the drawn silhouette at every aspect ratio.
  const projection = Math.min(1, size * .39 / Math.max(1, Math.hypot(dx, dy)))
  const atX = x + dx * projection
  const atY = y + dy * projection
  const diameter = Math.max(16, size * (heavy || core ? .29 : .21))
    * (reducedMotion ? 1 : 1 + progress * .45)
  drawBossFx(ctx, core ? BOSS_FX.precision : BOSS_FX.impact, atX, atY,
    diameter, diameter, .93 * (1 - progress) ** 1.3, impact.shotId * .37, !heavy)
}

