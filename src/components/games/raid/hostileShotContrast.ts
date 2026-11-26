import { raidObjectInView } from './visibility'
import type { RaidVisibilityBounds } from './visibility'
import type { Shot } from './types'

/** Mark the solid contact point over foreground glare using two batched strokes. */
export function drawHostileShotContrast(
  ctx: CanvasRenderingContext2D, shots: readonly Shot[], bounds: RaidVisibilityBounds,
  toX: (value: number) => number, toY: (value: number) => number, visualScale: number,
) {
  ctx.save()
  ctx.globalCompositeOperation = 'source-over'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  let visible = false
  for (const shot of shots) {
    if (shot.kind === 'beam' || shot.kind === 'poisonCloud' || shot.kind === 'squidBubble'
      || (shot.life ?? 1) <= 0 || !raidObjectInView(bounds, shot.x, shot.y, shot.radius)) continue
    const x = toX(shot.x), y = toY(shot.y)
    const radius = Math.max(2.5, Math.min(5, shot.radius * visualScale * 1.8))
    ctx.moveTo(x, y - radius)
    ctx.lineTo(x + radius, y)
    ctx.lineTo(x, y + radius)
    ctx.lineTo(x - radius, y)
    ctx.closePath()
    visible = true
  }
  if (visible) {
    ctx.strokeStyle = '#22091a'
    ctx.lineWidth = 3.5
    ctx.stroke()
    ctx.strokeStyle = '#ffe3dd'
    ctx.lineWidth = 1.25
    ctx.stroke()
  }
  ctx.restore()
}
