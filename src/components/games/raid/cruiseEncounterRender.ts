import { BOSS_FX, drawBossFx } from './combatArt'
import { forEachMiniBossLane, getMiniBossWarningSeconds } from './cruiseEncounters'
import type { Enemy } from './types'

export function drawCruiseEliteWarnings(ctx: CanvasRenderingContext2D, enemies: readonly Enemy[],
  toX: (n: number) => number, toY: (n: number) => number, height: number, reducedMotion: boolean) {
  const unit = toX(1) - toX(0)
  for (const enemy of enemies) {
    const attack = enemy.miniBossAttack
    if (!attack || enemy.chargeTimer <= 0 || enemy.hp <= 0) continue
    const charge = reducedMotion ? .7 : 1 - Math.min(1, enemy.chargeTimer / getMiniBossWarningSeconds(attack))
    const origin = toX(enemy.miniBossAttackOriginX ?? enemy.x)
    const y = toY(enemy.y + 3)
    const aimX = toX(enemy.chargeLane)
    const aimY = toY(enemy.chargeTargetY)
    const alpha = .52 + charge * .32
    if (attack === 'drill' || attack === 'crossfire' || attack === 'screen') {
      const halfWidth = unit * (attack === 'screen' ? 2.7 : 5.1)
      const color = attack === 'screen' ? '219,130,255' : '255,159,78'
      forEachMiniBossLane(attack, enemy.chargeLane, lane => {
        const x = toX(lane)
        ctx.save()
        ctx.globalCompositeOperation = 'screen'
        const danger = ctx.createLinearGradient(x - halfWidth, 0, x + halfWidth, 0)
        danger.addColorStop(0, `rgba(${color},0)`)
        danger.addColorStop(.5, `rgba(${color},.29)`)
        danger.addColorStop(1, `rgba(${color},0)`)
        ctx.globalAlpha *= alpha
        ctx.fillStyle = danger
        ctx.fillRect(x - halfWidth, y, halfWidth * 2, Math.max(0, height - y))
        ctx.restore()
        drawBossFx(ctx, BOSS_FX.precision, x, y, unit * 10, unit * 8, alpha, 0, true)
      })
    } else if (attack === 'launch' || attack === 'pods') {
      for (const side of [-1, 1]) {
        const pod = toX(enemy.x + side * (attack === 'launch' ? 11 : 7))
        drawBossFx(ctx, attack === 'launch' ? BOSS_FX.pulse : BOSS_FX.muzzle,
          pod, y, unit * 13, unit * 10, alpha, 0, true)
      }
    } else {
      const span = unit * (attack === 'fan' ? 23 : 12 + (1 - charge) * 5)
      drawBossFx(ctx, attack === 'fan' ? BOSS_FX.aim : BOSS_FX.precision,
        aimX, aimY, span, span, alpha, 0, true)
      drawBossFx(ctx, BOSS_FX.muzzle, origin, y, unit * 13, unit * 9, alpha, Math.atan2(aimY - y, aimX - origin), true)
    }
  }
}
