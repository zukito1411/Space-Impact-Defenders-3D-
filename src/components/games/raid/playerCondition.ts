import { COMBAT_TILE, drawRaidCombatTexture, getRaidCombatFrame } from './combatArt'
import { warmShipProtection } from './shipProtection'
import type { ProtectionHull } from './shipProtection'
import type { GamePhase, Player, PlayerFeedbackKind, Vec } from './types'

let serial = 0
type State = { serial: number; age: number; previous: number }
const states = new Map<string, State>()

export function recordPlayerFeedback(player: Player, kind: PlayerFeedbackKind, contact?: Vec) {
  const dx = (contact?.x ?? player.x) - player.x
  const dy = (contact?.y ?? player.y - 1) - player.y
  const length = Math.hypot(dx, dy) || 1
  player.feedback = { serial: ++serial, kind, dx: dx / length, dy: dy / length }
  return player.feedback
}

export function clearPlayerConditions() { states.clear() }

export function validPlayerFeedback(event: Player['feedback']): event is NonNullable<Player['feedback']> {
  return !!event && Number.isSafeInteger(event.serial) && event.serial > 0 && Number.isFinite(event.dx) && Number.isFinite(event.dy)
    && ['field-hit', 'shield-hit', 'combined-hit', 'field-break', 'shield-break', 'combined-break', 'hull-hit', 'repair'].includes(event.kind)
}

export function drawPlayerCondition(ctx: CanvasRenderingContext2D, player: Player, phase: GamePhase,
  x: number, y: number, size: number, time: number, identity: string, hull: ProtectionHull, reducedMotion: boolean) {
  let state = states.get(identity)
  if (!state) {
    if (states.size >= 8) states.delete(states.keys().next().value!)
    state = { serial: -1, age: 999, previous: time }
    states.set(identity, state)
  }
  const delta = Math.max(0, Math.min(.05, (time - state.previous) / 1000))
  state.previous = time
  if (phase !== 'paused' && phase !== 'briefing' && phase !== 'select') state.age += delta
  const feedback = player.feedback
  if (!validPlayerFeedback(feedback)) return
  if (feedback.serial !== state.serial) { state.serial = feedback.serial; state.age = 0 }
  const repair = feedback.kind === 'repair'
  const broken = feedback.kind.endsWith('break')
  const duration = repair ? 1.15 : broken ? .8 : .38
  const progress = Math.max(0, Math.min(1, state.age / duration))
  if (progress >= 1) return
  const art = warmShipProtection(hull)
  if (!art) return
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(size / 192, size / 192)
  ctx.globalCompositeOperation = 'lighter'
  ctx.globalAlpha *= (1 - progress) ** .75
  if (repair) {
    if (!reducedMotion) {
      ctx.beginPath()
      ctx.rect(-128, 110 - progress * 260, 256, 62)
      ctx.clip()
    }
    ctx.drawImage(art.repair, -128, -128)
  } else {
    const shield = feedback.kind.startsWith('shield')
    const combined = feedback.kind.startsWith('combined')
    const path = hull.contours
      ? shield ? hull.contours.shield : hull.contours.field
      : shield ? art.shieldPath : art.fieldPath
    const coordinates = hull.contours ? 192 : 1
    let contact = 0, best = -Infinity
    for (let i = 0; i < 256; i++) {
      const px = path.points[i * 2] * coordinates, py = path.points[i * 2 + 1] * coordinates
      const score = (px * feedback.dx + py * feedback.dy) / Math.max(1, Math.hypot(px, py))
      if (score > best) { contact = i; best = score }
    }
    ctx.strokeStyle = feedback.kind === 'hull-hit' ? '#fda4af' : combined ? '#ddd6fe' : shield ? '#fef3c7' : '#cffafe'
    ctx.lineWidth = (broken ? 3.3 : 2.8) * (1 - progress * .65)
    for (const direction of [-1, 1]) {
      ctx.beginPath()
      const travel = reducedMotion ? 0 : Math.round(progress * (broken ? 72 : 47))
      for (let step = 0; step < 18; step++) {
        const index = ((contact + direction * (travel + step)) % 256 + 256) % 256 * 2
        if (!step) ctx.moveTo(path.points[index] * coordinates, path.points[index + 1] * coordinates)
        else ctx.lineTo(path.points[index] * coordinates, path.points[index + 1] * coordinates)
      }
      ctx.stroke()
    }
    if (broken && !reducedMotion) for (let shard = 0; shard < 6; shard++) {
      const index = ((contact + shard * 9 - 23) % 256 + 256) % 256 * 2
      const px = path.points[index] * coordinates, py = path.points[index + 1] * coordinates
      const length = Math.hypot(px, py) || 1
      const drift = progress * (12 + shard * 2)
      const sx = px + px / length * drift, sy = py + py / length * drift
      ctx.fillStyle = shard % 2 ? (shield ? '#fbbf24' : combined ? '#a78bfa' : '#22d3ee') : '#ecfeff'
      ctx.beginPath()
      ctx.moveTo(sx, sy - 3.8)
      ctx.lineTo(sx + 2.8, sy + 2)
      ctx.lineTo(sx - 2, sy + 3)
      ctx.closePath()
      ctx.fill()
    }
  }
  ctx.restore()
}

export const CRITICAL_HULL_FILTER = 'grayscale(1) brightness(1.25) sepia(1) saturate(12) hue-rotate(315deg)'

export function drawHullDamageSmoke(ctx: CanvasRenderingContext2D, x: number, y: number,
  size: number, time: number, critical: boolean, still: boolean) {
  const smoke = getRaidCombatFrame(COMBAT_TILE.smoke)
  if (!smoke) return
  const count = critical ? 5 : 2
  const cycle = still ? .25 : time / 1050
  for (let i = 0; i < count; i++) {
    const drift = (cycle + i / count) % 1
    const side = i % 2 === 0 ? -1 : 1
    const width = size * (.22 + drift * .35)
    drawRaidCombatTexture(ctx, smoke, x + side * size * (.07 + drift * .17),
      y + size * (.19 + drift * .57), width, width * 1.12,
      side * (drift * 1.4 + i * .4), false, (1 - drift) * (critical ? .68 : .53))
  }
}
