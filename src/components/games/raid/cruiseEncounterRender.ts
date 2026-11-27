import type { LanguageCode } from '../../../i18n'
import { getCanvasSpriteSource, getNormalAlienCanvasSprite } from './assets'
import { BOSS_FX, drawBossFx } from './combatArt'
import { forEachMiniBossLane, getMiniBossWarningSeconds } from './cruiseEncounters'
import { getRaidFighter, getRaidFighterDefenseTime, isRaidFighterPhased } from './stageEncounters'
import type { Enemy } from './types'

const crossfireCopy = {
  en: 'Crossfire · Destroy the gold-lit lead fighter',
  zh: '交叉火力 · 击毁金光领航机',
  ja: '交差射撃 · 金色に光る先頭機を撃破',
  ko: '교차 사격 · 금빛 선두기를 격추',
} satisfies Record<LanguageCode, string>

export function drawCruiseCrossfireStatus(ctx: CanvasRenderingContext2D, width: number, y: number, language: LanguageCode) {
  const span = Math.min(width * .85, 295)
  ctx.save()
  ctx.globalCompositeOperation = 'source-over'
  ctx.fillStyle = 'rgba(6,19,33,.92)'
  ctx.beginPath()
  ctx.roundRect((width - span) * .5, y, span, 28, 5)
  ctx.fill()
  ctx.fillStyle = '#ffda9d'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = 'bold 12px system-ui, sans-serif'
  ctx.fillText(crossfireCopy[language], width * .5, y + 14, span - 20)
  ctx.restore()
}

export function drawRaidFighterDefense(ctx: CanvasRenderingContext2D, enemy: Enemy, x: number, y: number,
  size: number, reducedMotion: boolean) {
  const shield = (enemy.fighterShield ?? 0) > 0
  const impact = Math.min(1, (enemy.fighterShieldFlash ?? 0) * 4)
  if (shield || impact > 0) {
    const span = size * (shield ? 1.4 : 1.55 + (1 - impact) * .36)
    drawBossFx(ctx, BOSS_FX.shield, x, y, span, span, (shield ? .43 : 0) + impact * .42, -.35, true)
  }
  if (enemy.fighterDefenseAge === undefined) return
  const age = getRaidFighterDefenseTime(enemy)
  if (age < 0 || age > 1.6) return
  if (isRaidFighterPhased(enemy)) {
    const side = enemy.fighterPhaseSide ?? 1
    const silhouette = !reducedMotion && getCanvasSpriteSource(getNormalAlienCanvasSprite(enemy.variant))
    if (silhouette) {
      ctx.save()
      ctx.globalCompositeOperation = 'screen'
      const height = size * silhouette.height / silhouette.width
      for (let echo = 2; echo >= 1; echo--) {
        ctx.globalAlpha = .32 / echo
        ctx.drawImage(silhouette, x - side * size * echo * .48 - size * .5, y - height * .5, size, height)
      }
      ctx.restore()
    }
    drawBossFx(ctx, BOSS_FX.precision, x - side * size * .23, y, size * 1.45, size * .68, .48, 0, true)
  } else if (getRaidFighter(enemy.variant)?.defense === 'cloak' && (age < .28 || age > 1.26)) {
    const scan = age < .28 ? age / .28 : (age - 1.26) / .3
    drawBossFx(ctx, BOSS_FX.shield, x, y + (reducedMotion ? 0 : scan - .5) * size,
      size * 1.14, size * .24, .48, Math.PI * .5, true)
  } else if (enemy.fighterPhaseSide && age < .31) {
    drawBossFx(ctx, BOSS_FX.precision, x + enemy.fighterPhaseSide * size * .3, y,
      size * .76, size * .76, .38 + age, 0, true)
  }
}

export function drawCruiseAttackWarnings(ctx: CanvasRenderingContext2D, enemies: readonly Enemy[],
  toX: (n: number) => number, toY: (n: number) => number, height: number, reducedMotion: boolean) {
  const unit = toX(1) - toX(0)
  for (const enemy of enemies) {
    if (enemy.chargeTimer <= 0 || enemy.hp <= 0) continue
    if (enemy.cruiseManeuver === 'crossfire') {
      const lead = enemy.trainSlot === 0
      const progress = reducedMotion ? .75 : 1 - Math.min(1, enemy.chargeTimer)
      const span = unit * (lead ? 14 : 8)
      drawBossFx(ctx, lead ? BOSS_FX.muzzle : BOSS_FX.precision,
        toX(enemy.x), toY(enemy.y + (lead ? 0 : 2.5)), span, span,
        (lead ? .58 : .43) + progress * .38, 0, true)
      continue
    }
    const attack = enemy.miniBossAttack
    if (!attack) continue
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
