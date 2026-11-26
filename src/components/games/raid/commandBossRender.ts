import { BOSS_FX, drawBossFx, drawBossFxLane } from './combatArt'
import { getGenericBossArt } from './bossCatalog'
import { PLAYER_RADIUS } from './constants'
import { COMMAND_CLOAK_REVEAL_AT, COMMAND_CLOAK_SCAN_SECONDS, COMMAND_CLOAK_SECONDS, COMMAND_PHASE_HP, COMMAND_PHASE_SHIFT_SECONDS, commandVolleyPreviewIndex, createCommandVolley, getCommandManeuverAge, isCommandBeam, sampleCommandBossCloak, sampleCommandPhaseShiftX, writeCommandVolley } from './commandBoss'
import type { Enemy } from './types'
const preview = createCommandVolley()
/** Warning projections use the committed volley geometry. */
export function drawCommandBossTelegraph(ctx: CanvasRenderingContext2D, enemy: Enemy,
  toX: (v: number) => number, toY: (v: number) => number, viewportWidth: number) {
  if (enemy.hp <= 0 || enemy.bossAttackState !== 'warning' || (enemy.bossAttackTimer ?? 0) <= 0) return
  const count = writeCommandVolley(enemy, preview, commandVolleyPreviewIndex(enemy.bossAttackPattern))
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

export function getCommandBossHullOpacity(enemy: Enemy) {
  const depth = sampleCommandBossCloak(enemy)
  const minimum = prefersRaidReducedMotion() ? .24 : 0
  const hitReveal = .34 * Math.sqrt(Math.min(1, Math.max(0, enemy.hitFlash ?? 0) / .24))
  return 1 - depth * (1 - Math.max(minimum, hitReveal))
}

export function drawCommandPhaseAfterimages(enemy: Enemy, draw: (x: number, alpha: number, index: number) => void) {
  if (enemy.hp <= 0 || enemy.bossManeuver !== 'phaseShift' || prefersRaidReducedMotion()) return
  const age = getCommandManeuverAge(enemy)
  if (age <= 0 || age >= .65) return
  const tail = Math.min(1, (.65 - age) / .2)
  for (let index = 2; index >= 0; index--) {
    const historyAge = age - (index + 1) * .08
    if (historyAge < 0 || historyAge >= COMMAND_PHASE_SHIFT_SECONDS) continue
    const x = sampleCommandPhaseShiftX(enemy, historyAge)
    if (Math.abs(x - enemy.x) < 2) continue
    draw(x, (.36 - index * .085) * tail, index)
  }
}

function drawCloakScan(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, progress: number) {
  const reduced = prefersRaidReducedMotion()
  const extent = size * .43
  const span = size * .31
  const band = Math.max(5, size * .11)
  const scan = reduced ? 0 : (progress * 2 - 1) * extent
  ctx.save()
  ctx.translate(x, y)
  ctx.globalCompositeOperation = 'screen'
  ctx.globalAlpha *= Math.sin(progress * Math.PI) * (reduced ? .42 : .9)
  ctx.beginPath()
  ctx.ellipse(0, 0, span, extent, 0, 0, Math.PI * 2)
  ctx.clip()
  const sweep = ctx.createLinearGradient(0, scan - band, 0, scan + band)
  sweep.addColorStop(0, 'rgba(40,149,245,0)')
  sweep.addColorStop(.35, 'rgba(53,175,255,0.38)')
  sweep.addColorStop(.61, 'rgba(182,252,255,0.98)')
  sweep.addColorStop(.72, 'rgba(50,212,255,0.56)')
  sweep.addColorStop(1, 'rgba(34,143,234,0)')
  ctx.fillStyle = sweep
  ctx.fillRect(-span, scan - band, span * 2, band * 2)
  ctx.restore()
}

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

  const elapsed = getCommandManeuverAge(enemy)
  if (enemy.bossManeuver === 'cloak' && elapsed > 0) {
    if (elapsed < COMMAND_CLOAK_SCAN_SECONDS) {
      drawCloakScan(ctx, toX(enemy.x), toY(enemy.y), size, elapsed / COMMAND_CLOAK_SCAN_SECONDS)
    } else if (elapsed >= COMMAND_CLOAK_REVEAL_AT && elapsed < COMMAND_CLOAK_SECONDS) {
      const progress = (elapsed - COMMAND_CLOAK_REVEAL_AT) / (COMMAND_CLOAK_SECONDS - COMMAND_CLOAK_REVEAL_AT)
      const span = size * (prefersRaidReducedMotion() ? .32 : .28 + progress * .22)
      drawBossFx(ctx, BOSS_FX.pulse, toX(enemy.x), toY(enemy.y), span, span * .85,
        .62 * Math.sin(progress * Math.PI), 0, true)
    }
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
