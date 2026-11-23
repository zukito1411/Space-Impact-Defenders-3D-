import { HEIGHT, WIDTH } from './constants'
import type { Player, Shot } from './types'
import { getCachedProjectileOrbSprite, getCachedSpriteGlow } from './utils'

const RADIUS = 24
const MUZZLE_MERGE_RADIUS = 10
const EXHAUST_RADIUS = 48
const ION = { color: 'rgba(56,189,248,.85)', rgb: [.18, .74, 1], size: 48, duration: 132, priority: 1 }
const LASER = { color: 'rgba(125,249,255,.9)', rgb: [.29, .87, 1], size: 59, duration: 165, priority: 3 }
const WARM = { color: 'rgba(251,146,60,.85)', rgb: [1, .49, .14], size: 54, duration: 148, priority: 2 }
const EXHAUST_COLORS = ['rgba(34,211,238,.61)', 'rgba(251,146,60,.61)'] as const

export type RaidMuzzleFlash = { owner: Player; x: number; y: number; kind: Shot['kind']; at: number }

export function getWeaponIgnition(kind: Shot['kind']) {
  if (kind === 'laser' || kind === 'needle') return LASER
  if (kind === 'rocket' || kind === 'homing' || kind === 'coreBlast' || kind === 'spiegelKunai') return WARM
  return ION
}

/** Refresh an occupied mount; tight salvos share a flash while distant wing guns keep their own. */
export function recordRaidMuzzleFlash(flashes: RaidMuzzleFlash[], owner: Player, shot: Omit<Shot, 'id'>,
  time: number, width: number, height: number) {
  const x = shot.x - owner.x
  const y = shot.y - owner.y
  let oldest = 0
  for (let i = 0; i < flashes.length; i++) {
    const flash = flashes[i]
    if (flash.owner === owner && Math.abs(flash.x - x) * width / WIDTH < MUZZLE_MERGE_RADIUS &&
      Math.abs(flash.y - y) * height / HEIGHT < MUZZLE_MERGE_RADIUS) {
      if (flash.at !== time || getWeaponIgnition(shot.kind).priority > getWeaponIgnition(flash.kind).priority) {
        flash.x = x
        flash.y = y
        flash.kind = shot.kind
      }
      flash.at = time
      return
    }
    if (flash.at < flashes[oldest].at) oldest = i
  }
  const index = flashes.length < 6 ? flashes.length : oldest
  const flash = flashes[index]
  if (flash) {
    flash.owner = owner
    flash.x = x
    flash.y = y
    flash.kind = shot.kind
    flash.at = time
  } else flashes[index] = { owner, x, y, kind: shot.kind, at: time }
}

/** A shot can be emitted after the rAF timestamp and drawn by that same frame. */
export function sampleRaidMuzzleFlash(time: number, flash: RaidMuzzleFlash) {
  return Math.max(0, time - flash.at) / getWeaponIgnition(flash.kind).duration
}

export function warmRaidWeaponGlows() {
  for (const style of [ION, LASER, WARM]) getCachedProjectileOrbSprite(style.color, RADIUS)
  for (const color of EXHAUST_COLORS) getCachedSpriteGlow(color, EXHAUST_RADIUS)
}

export function drawRaidMuzzleBloom(ctx: CanvasRenderingContext2D, flash: RaidMuzzleFlash,
  x: number, y: number, scale: number, progress: number, deepSpace: boolean, reducedMotion: boolean) {
  const style = getWeaponIgnition(flash.kind)
  const sprite = getCachedProjectileOrbSprite(style.color, RADIUS)
  if (!sprite) return
  const size = style.size * scale * (1 + progress * .18)
  const intensity = (1 - progress) ** 1.45 * (reducedMotion ? .48 : deepSpace ? .98 : .73)
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.globalAlpha *= intensity
  // The center sits on the barrel so the halo spills onto the nose and into the shot lane.
  ctx.drawImage(sprite.canvas, x - size * .5, y - size * .54, size, size)
  ctx.restore()
}

export function drawRaidExhaustBloom(ctx: CanvasRenderingContext2D, x: number, y: number, size: number,
  throttle: number, warm: boolean, nozzles?: readonly (readonly [number, number, number])[]) {
  const sprite = getCachedSpriteGlow(EXHAUST_COLORS[warm ? 1 : 0], EXHAUST_RADIUS)
  if (!sprite) return
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.globalAlpha *= .72 + throttle * .22
  if (nozzles?.length) {
    for (const [offsetX, offsetY, aperture] of nozzles) {
      const spread = size * Math.max(.18, Math.min(.44, aperture * 7))
      const length = spread * (1.45 + throttle * .30)
      ctx.drawImage(sprite.canvas, x + size * offsetX - spread * .5, y + size * offsetY - length * .34, spread, length)
    }
  } else {
    const spread = size * .34
    ctx.drawImage(sprite.canvas, x - spread * .5, y + size * .20, spread, spread * 1.5)
  }
  ctx.restore()
}
