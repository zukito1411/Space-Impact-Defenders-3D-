import { BOSS_FX, drawBossFx } from './combatArt'
import { CRUISE_ELITE_WARNING_SECONDS } from './cruiseEncounters'
import type { Enemy } from './types'

export function drawCruiseEliteWarnings(ctx: CanvasRenderingContext2D, enemies: readonly Enemy[],
  toX: (n: number) => number, toY: (n: number) => number, height: number) {
  for (const enemy of enemies) {
    if (enemy.cruiseEliteAge === undefined || enemy.miniBossKind === 'brood' || enemy.chargeTimer <= 0 || enemy.hp <= 0) continue
    const charge = 1 - Math.min(1, enemy.chargeTimer / CRUISE_ELITE_WARNING_SECONDS)
    if (enemy.miniBossKind === 'stalker') {
      const span = toX(11 + (1 - charge) * 7)
      drawBossFx(ctx, BOSS_FX.precision, toX(enemy.chargeLane), toY(enemy.chargeTargetY), span, span, .55 + charge * .33, 0, true)
      continue
    }
    const x = toX(enemy.chargeLane)
    const y = toY(enemy.y + 3)
    const half = toX(5.1)
    ctx.save()
    ctx.globalCompositeOperation = 'screen'
    const danger = ctx.createLinearGradient(x - half, 0, x + half, 0)
    danger.addColorStop(0, 'rgba(244,117,62,0)')
    danger.addColorStop(.2, 'rgba(253,114,49,.16)')
    danger.addColorStop(.5, 'rgba(255,159,78,.29)')
    danger.addColorStop(.8, 'rgba(253,114,49,.16)')
    danger.addColorStop(1, 'rgba(244,117,62,0)')
    ctx.globalAlpha *= .56 + charge * .44
    ctx.fillStyle = danger
    ctx.fillRect(x - half, y, half * 2, Math.max(0, height - y))
    drawBossFx(ctx, BOSS_FX.precision, x, y, half * 2.2, half * 2.2, .65, 0, true)
    ctx.restore()
  }
}
