import type { EnemyBankMotion } from './enemyBanking'
import { enemyHullKey } from './enemyHulls'
import { drawLiveHull } from './liveHullBridge'
import type { Enemy } from './types'

/** The body alone is 3D; attack clocks, telegraphs and damage locations remain authoritative. */
export function drawGenericBossShip(ctx: CanvasRenderingContext2D, enemy: Enemy, x: number, y: number,
  size: number, rotation: number, scale: number, alpha: number, landscape = false, enemyBank?: EnemyBankMotion) {
  const key = enemyHullKey(enemy)
  if (!key) return
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(rotation)
  drawLiveHull(ctx, key, 0, 0, size * 1.04 * scale, 0, alpha, landscape, 'enemy:' + enemy.id,
    { hit: Math.min(1, (enemy.hitFlash ?? 0) / .18), enemyBank })
  ctx.restore()
}
