import type { EnemyBankMotion } from './enemyBanking'
import { hullViewYaw } from './raidView'
import { isRaid2DMech } from './mechArtwork'
import { projectHullDocking } from './hullDocking'
import { getHullDocking, getHullRegistration } from './liveHullAssets'
import type { OrganicBossPose } from './specialBossGeometry'
export type LiveHullDraw = {
  id: string; key: string; x: number; y: number; size: number; bank: number
  angle: number; alpha: number; landscape: boolean; attack?: number; crouch?: number; hit?: number
  bossPose?: OrganicBossPose; spin?: number; enemyBank?: EnemyBankMotion; dock?: number
}
export interface LiveHullSink {
  submitHull(draw: LiveHullDraw): boolean
}
let activeSink: LiveHullSink | null = null
export function bindLiveHulls(sink: LiveHullSink | null) { activeSink = sink }
export function unbindLiveHulls(sink: LiveHullSink) { if (activeSink === sink) activeSink = null }
/** GPU actor coordinates already use logical CSS pixels, without a Canvas transform. */
export function submitLiveHull(draw: LiveHullDraw) { return !isRaid2DMech(draw.key) && (activeSink?.submitHull(draw) ?? false) }
export function liveHullsEnabled() { return activeSink !== null }
export function drawLiveHull(ctx: CanvasRenderingContext2D, key: string, x: number, y: number,
  size: number, bank: number, alpha: number, landscape: boolean, identity = key,
  pose: { attack?: number; crouch?: number; hit?: number; bossPose?: OrganicBossPose; spin?: number; enemyBank?: EnemyBankMotion; dock?: number } = {}) {
  if (!activeSink || isRaid2DMech(key)) return false
  const transform = ctx.getTransform()
  const density = Math.hypot(transform.a, transform.b)
  // Canvas transforms carry the renderer DPR, while world coordinates use CSS pixels.
  const dpr = Number(ctx.canvas.dataset.raidDpr) || window.devicePixelRatio || 1
  return activeSink.submitHull({
    id: identity, key, x: (transform.a * x + transform.c * y + transform.e) / dpr,
    y: (transform.b * x + transform.d * y + transform.f) / dpr,
    size: size * density / dpr, bank, angle: -Math.atan2(transform.b, transform.a),
    alpha: alpha * ctx.globalAlpha, landscape, ...pose,
  })
}


export function sampleLiveHullPoints(key: string, bank: number, landscape: boolean, dock = 0) {
  if (isRaid2DMech(key)) return null
  const data = getHullRegistration(key)
  if (!data) return null
  const angle = bank * 150 * Math.PI / 180
  const cos = Math.cos(angle), sin = Math.sin(angle)
  const yaw = hullViewYaw(landscape,dock), c = Math.cos(yaw), s = Math.sin(yaw)
  const [sx, sy, ox, oy] = data.registration
  const project = ([x, y, z]: number[]): [number, number] => {
    const px=sx*(cos*x+sin*z)+144*sx+ox-224,pz=sx*(-sin*x+cos*z)
    return [(c*px+s*pz)/448, -(sy*y+224-144*sy-oy)/448]
  }
  return {
    nozzles: data.nozzles.map(point => [...project(point), point[3]*sx/448] as [number, number, number]),
    wing: data.wing.map(project),
  }
}

/** Deck coordinates are physical screen pixels; the model remains in logical flight space. */
export function sampleLiveHullDock(key: string, x: number, y: number, size: number, width: number, height: number, landscape: boolean, canopyOpen=0, dock=0) {
  if (!activeSink || isRaid2DMech(key)) return undefined
  const registration = getHullRegistration(key), docking = getHullDocking(key)
  return registration && docking ? projectHullDocking(registration,docking,x,y,size,width,height,landscape,canopyOpen,dock) : undefined
}
