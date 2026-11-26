import { BOSS_FX, drawBossFx, drawBossFxLane } from './combatArt'
import { getGenericBossArt } from './bossCatalog'
import { PLAYER_RADIUS } from './constants'
import { COMMAND_PHASE_HP, createCommandVolley, isCommandBeam, writeCommandVolley } from './commandBoss'
import type { Enemy } from './types'
const preview = createCommandVolley()
/** Warning projections use the committed volley geometry. */
export function drawCommandBossTelegraph(ctx: CanvasRenderingContext2D, enemy: Enemy,
  toX: (v: number) => number, toY: (v: number) => number, viewportWidth: number) {
  if (enemy.hp <= 0 || enemy.bossAttackState !== 'warning' || (enemy.bossAttackTimer ?? 0) <= 0) return
  const count = writeCommandVolley(enemy, preview, enemy.bossAttackPattern === 'hydra' ? -1 : 0)
  if (!count) return
  const progress = 1 - (enemy.bossAttackTimer ?? 0) / Math.max(.01, enemy.bossWarningSeconds ?? 1)
  for (let i = 0; i < count; i++) {
    const shot = preview[i]
    if (isCommandBeam(enemy.bossAttackPattern)) {
      const half = shot.radius * .82 + PLAYER_RADIUS * .72
      drawBossFxLane(ctx, BOSS_FX.lane, toX(shot.x), toY(0), toX(shot.x), toY(100),
        toX(half * 2) - toX(0), .4 + progress * .23)
      if (enemy.bossArtStage === 1 && enemy.bossAttackSerial === 0) {
        const direction = shot.x < 50 ? 1 : -1
        const center = shot.x + (direction > 0 ? 100 - shot.x : -shot.x) * .5
        const x = toX(center), y = toY(84)
        ctx.save()
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        ctx.beginPath()
        ctx.moveTo(x - direction * 13, y - 9)
        ctx.lineTo(x, y)
        ctx.lineTo(x - direction * 13, y + 9)
        ctx.moveTo(x, y - 9)
        ctx.lineTo(x + direction * 13, y)
        ctx.lineTo(x, y + 9)
        ctx.strokeStyle = '#063028'
        ctx.lineWidth = 7
        ctx.stroke()
        ctx.strokeStyle = '#91ffcf'
        ctx.lineWidth = 3
        ctx.stroke()
        ctx.restore()
      }
    } else {
      const span = shot.vy > 2 ? Math.max(.8, (92 - shot.y) / shot.vy) : 1.25
      drawBossFxLane(ctx, BOSS_FX.aim, toX(shot.x), toY(shot.y),
        toX(shot.x + shot.vx * span), toY(shot.y + shot.vy * span),
        Math.max(4, Math.min(7, viewportWidth / 120)), .38 + progress * .4)
    }
  }
}

const reducedMotion = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
  ? window.matchMedia('(prefers-reduced-motion: reduce)')
  : undefined
export const prefersRaidReducedMotion = () => reducedMotion?.matches === true
const phaseColors = ['#67e8f9', '#fbbf24', '#fb7185'] as const

/** Short, local effects driven by the same encounter clock as the attacks. */
export function drawCommandBossEnergy(ctx: CanvasRenderingContext2D, enemy: Enemy,
  toX: (v: number) => number, toY: (v: number) => number, size: number) {
  const age = enemy.bossEncounterAge
  if (enemy.hp <= 0 || age === undefined) return

  if (enemy.bossArtStage === 1 && enemy.bossAttackSerial === 0 && enemy.bossAttackPattern === 'beam'
    && enemy.bossAttackState === 'recovery' && (enemy.bossRecoverySeconds ?? 0) - (enemy.bossAttackTimer ?? 0) >= .68) {
    const x = toX(enemy.x), y = toY(enemy.y + 4)
    const radius = Math.max(8, size * .12)
    ctx.save()
    ctx.strokeStyle = '#a1ffdb'
    ctx.lineWidth = 2
    ctx.beginPath()
    for (const direction of [-1, 1]) {
      ctx.moveTo(x + direction * radius * .65, y - radius)
      ctx.lineTo(x + direction * radius, y - radius)
      ctx.lineTo(x + direction * radius, y + radius)
      ctx.lineTo(x + direction * radius * .65, y + radius)
    }
    ctx.stroke()
    ctx.restore()
  }

  const volleyAge = age - (enemy.bossLastVolleyAge ?? -Infinity)
  if (volleyAge >= 0 && volleyAge < .18) {
    const motionReduced = prefersRaidReducedMotion()
    const count = writeCommandVolley(enemy, preview, Math.max(0, (enemy.bossBurstIndex ?? 1) - 1))
    const progress = volleyAge / .18
    const diameter = Math.max(12, size * .15) * (motionReduced ? 1 : 1 + progress * .5)
    for (let i = 0; i < count; i++) {
      const shot = preview[i]
      let sharedMuzzle = false
      for (let j = 0; j < i; j++) {
        if (preview[j].x === shot.x && preview[j].y === shot.y) { sharedMuzzle = true; break }
      }
      if (!sharedMuzzle) drawBossFx(ctx, BOSS_FX.muzzle, toX(shot.x), toY(shot.y),
        diameter, diameter * 1.18, .9 * (1 - progress), 0, true)
    }
  }
}

/** Phase divisions use the same HP thresholds as the encounter scheduler. */
export function drawCommandBossHealthBar(ctx: CanvasRenderingContext2D, enemy: Enemy, x: number, y: number, size: number) {
  const width = size * .9
  const height = 7
  const left = x - width / 2
  const top = y + size * .5 + 12
  const fill = Math.max(0, Math.min(1, enemy.hp / Math.max(1, enemy.maxHp)))

  ctx.save()
  ctx.fillStyle = '#08111e'
  ctx.fillRect(left - 2, top - 2, width + 4, height + 4)
  ctx.fillStyle = '#243448'
  ctx.fillRect(left, top, width, height)
  ctx.fillStyle = phaseColors[enemy.bossCombatPhase ?? 0] ?? phaseColors[0]
  ctx.fillRect(left, top, width * fill, height)
  ctx.fillStyle = 'rgba(255,255,255,0.34)'
  ctx.fillRect(left, top, width * fill, 1)
  ctx.fillStyle = '#08111e'
  ctx.fillRect(left + width * COMMAND_PHASE_HP.critical - 1, top, 2, height)
  ctx.fillRect(left + width * COMMAND_PHASE_HP.pressure - 1, top, 2, height)
  const name = getGenericBossArt(enemy.bossKind ?? 'carrier', enemy.bossArtStage)?.name
  if (name) {
    ctx.fillStyle = '#e2e8f0'
    ctx.font = '600 10px Orbitron, system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillText(name, x, top + height + 5, width + 14)
  }
  ctx.restore()
}
