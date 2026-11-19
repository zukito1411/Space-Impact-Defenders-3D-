import { getHullRegistration } from './liveHullAssets'
export type LiveHullDraw = {
  id: string; key: string; x: number; y: number; size: number; bank: number
  angle: number; alpha: number; landscape: boolean; attack?: number; crouch?: number
}
export interface LiveHullSink {
  submitHull(draw: LiveHullDraw): boolean
}
let activeSink: LiveHullSink | null = null
export function bindLiveHulls(sink: LiveHullSink | null) { activeSink = sink }
export function unbindLiveHulls(sink: LiveHullSink) { if (activeSink === sink) activeSink = null }
export function liveHullsEnabled() { return activeSink !== null }
export function drawLiveHull(ctx: CanvasRenderingContext2D, key: string, x: number, y: number,
  size: number, bank: number, alpha: number, landscape: boolean, identity = key, pose: { attack?: number; crouch?: number } = {}) {
  if (!activeSink) return false
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


export function sampleLiveHullPoints(key: string, bank: number, landscape: boolean) {
  const data = getHullRegistration(key)
  if (!data) return null
  const angle = (landscape ? -56 : 0) * Math.PI / 180 + bank * 150 * Math.PI / 180
  const cos = Math.cos(angle), sin = Math.sin(angle)
  const [sx, sy, ox, oy] = data.registration
  const project = ([x, y, z]: number[]): [number, number] =>
    [(sx*(cos*x+sin*z)+144*sx+ox-224)/448, -(sy*y+224-144*sy-oy)/448]
  return {
    nozzles: data.nozzles.map(point => [...project(point), point[3]*sx/448] as [number, number, number]),
    wing: data.wing.map(project),
  }
}
