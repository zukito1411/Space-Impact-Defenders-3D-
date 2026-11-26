import { Matrix, type Container } from 'pixi.js'
import { BLACK_HOLE_AXIS_RATIO, type BlackHole } from './events'
import type { AsteroidHazard, DerelictWreck, Enemy, MeteorHazard, NukeStrike, Player, PowerUp, RaidRandomEvent, Shot, Vec } from './types'
import { clamp } from './utils'

export type GravityWarp = { xx: number; xy: number; yy: number }
export type GravityField = {
  hole: BlackHole; scaleX: number; scaleY: number; reducedMotion: boolean
  age: number; captures?: readonly BlackHoleCapture[]
}

type CapturedBody =
  | { kind: 'pilot'; body: Player; remote: boolean }
  | { kind: 'enemy'; body: Enemy }
  | { kind: 'shot'; body: Shot; hostile: boolean }
  | { kind: 'asteroid'; body: AsteroidHazard }
  | { kind: 'meteor'; body: MeteorHazard }
  | { kind: 'wreck'; body: DerelictWreck }
  | { kind: 'pickup'; body: PowerUp }
  | { kind: 'nuke'; body: NukeStrike }

export type BlackHoleCapture = CapturedBody & { at: number; contact: Vec }
export const BLACK_HOLE_CAPTURE_SECONDS = .32
const MAX_CAPTURES = 24

export function gravityWarp(field: GravityField | null | undefined, body: Vec): GravityWarp | null {
  if (!field) return null
  const { hole } = field
  const dx = hole.x - body.x
  const dy = hole.y - body.y
  const range = hole.radius + 25
  if (Math.abs(dx) >= range || Math.abs(dy * BLACK_HOLE_AXIS_RATIO) >= range) return null
  const distance = Math.hypot(dx, dy * BLACK_HOLE_AXIS_RATIO)
  const proximity = clamp((range - distance) / 25, 0, 1)
  const intensity = proximity * proximity * hole.strength * (field.reducedMotion ? .46 : 1)
  return intensity > .012 ? radialWarp(dx * field.scaleX, dy * field.scaleY, 1 + intensity * 2.15, 1 - intensity * .57) : null
}

function radialWarp(dx: number, dy: number, stretch: number, compress: number): GravityWarp {
  const angle = Math.atan2(dy, dx)
  const x = Math.cos(angle)
  const y = Math.sin(angle)
  const difference = stretch - compress
  return { xx: compress + difference * x * x, xy: difference * x * y, yy: compress + difference * y * y }
}

// Nothing captured stays in the combat arrays. The small event stream also travels with co-op state.
export function recordBlackHoleCapture(event: RaidRandomEvent, hole: BlackHole, capture: CapturedBody, to: Vec, from = to) {
  const captures = event.captures ??= []
  if (captures.length >= MAX_CAPTURES) {
    let disposable = captures.findIndex(item => item.kind === 'shot')
    if (disposable < 0 && capture.kind !== 'shot') disposable = captures.findIndex(item => item.kind !== 'pilot')
    if (disposable < 0) return
    captures.splice(disposable, 1)
  }
  captures.push({ ...capture, at: event.age, contact: horizonContact(hole, from.x, from.y, to.x, to.y) })
}

function horizonContact(hole: BlackHole, fromX: number, fromY: number, toX: number, toY: number): Vec {
  const x = fromX - hole.x
  const y = (fromY - hole.y) * BLACK_HOLE_AXIS_RATIO
  const vx = toX - fromX
  const vy = (toY - fromY) * BLACK_HOLE_AXIS_RATIO
  const speedSq = vx * vx + vy * vy
  const distanceSq = x * x + y * y
  const inward = x * vx + y * vy
  const discriminant = inward * inward - speedSq * (distanceSq - hole.radius * hole.radius)
  if (speedSq > 0 && distanceSq >= hole.radius * hole.radius && discriminant >= 0) {
    const t = (-inward - Math.sqrt(discriminant)) / speedSq
    if (t >= 0 && t <= 1) return { x: fromX + vx * t, y: fromY + (toY - fromY) * t }
  }
  const length = Math.hypot(x, y)
  return length > .01
    ? { x: hole.x + x * hole.radius / length, y: hole.y + y * hole.radius / length / BLACK_HOLE_AXIS_RATIO }
    : { x: hole.x, y: hole.y + hole.radius / BLACK_HOLE_AXIS_RATIO }
}

export function sampleBlackHoleCapture(capture: BlackHoleCapture, age: number, field: GravityField) {
  const progress = (age - capture.at) / BLACK_HOLE_CAPTURE_SECONDS
  if (progress < 0 || progress >= 1) return null
  const { hole, scaleX, scaleY, reducedMotion } = field
  const dx = (capture.contact.x - hole.x) * scaleX
  const dy = (capture.contact.y - hole.y) * scaleY
  const angle = Math.atan2(dy, dx) + hole.direction * progress * (reducedMotion ? .13 : .56)
  const radius = Math.hypot(dx, dy) * (1 - progress ** .82)
  const stretch = (3.05 + Math.sin(Math.PI * progress) * 2.5) * (1 - progress * .6)
  const compress = .43 * (1 - progress * .85)
  return {
    x: hole.x * scaleX + Math.cos(angle) * radius,
    y: hole.y * scaleY + Math.sin(angle) * radius,
    warp: radialWarp(Math.cos(angle), Math.sin(angle), reducedMotion ? 1 + (stretch - 1) * .5 : stretch,
      reducedMotion ? .35 + compress * .55 : compress),
    alpha: (1 - progress) ** 1.55,
  }
}

const canvasWarps = new WeakMap<CanvasRenderingContext2D, GravityWarp>()
export function getCanvasGravityWarp(ctx: CanvasRenderingContext2D) { return canvasWarps.get(ctx) }
export function resetCanvasGravityWarp(ctx: CanvasRenderingContext2D) { endCanvasGravityWarp(ctx, canvasWarps.has(ctx)) }

export function beginCanvasGravityWarp(ctx: CanvasRenderingContext2D, warp: GravityWarp | null, x: number, y: number,
  targetX = x, targetY = y, alpha = 1) {
  if (!warp) return false
  ctx.save()
  ctx.globalAlpha *= alpha
  ctx.transform(warp.xx, warp.xy, warp.xy, warp.yy,
    targetX - warp.xx * x - warp.xy * y, targetY - warp.xy * x - warp.yy * y)
  canvasWarps.set(ctx, warp)
  return true
}

export function endCanvasGravityWarp(ctx: CanvasRenderingContext2D, warped: boolean) {
  if (!warped) return
  canvasWarps.delete(ctx)
  ctx.restore()
}

const pixiWarpMatrix = new Matrix()
export function applyPixiGravityWarp(sprite: Container, warp: GravityWarp) {
  const cos = Math.cos(sprite.rotation), sin = Math.sin(sprite.rotation)
  const { xx, xy, yy } = warp
  const sx = sprite.scale.x, sy = sprite.scale.y
  pixiWarpMatrix.set((xx * cos + xy * sin) * sx, (xy * cos + yy * sin) * sx,
    (xy * cos - xx * sin) * sy, (yy * cos - xy * sin) * sy, sprite.x, sprite.y)
  sprite.setFromMatrix(pixiWarpMatrix)
}
