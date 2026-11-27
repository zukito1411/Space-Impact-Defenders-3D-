import { getBossForceFieldStrength } from './bossDamageFx'
import { authoredDefeatAlpha } from './destructionProfile'
import type { EnemyBankMotion } from './enemyBanking'
import { enemyHullKey } from './enemyHulls'
import { fighterGunHeading, fighterHullBank, fighterHullHeading } from './fighterHulls'
import { drawLiveHull } from './liveHullBridge'
import { BOSS_FX, COMBAT_TILE, drawBossFx, drawRaidCombatTexture, getRaidCombatFrame } from './combatArt'
import { FIGHTER_FIRE_FLASH, getRaidFighterCharge, getRaidFighterOpacity } from './stageEncounters'
import { drawCommandBossEnergy, drawCommandBossHealthBar, drawCommandBossTelegraph, drawCommandPhaseAfterimages, getCommandBossHullOpacity, prefersRaidReducedMotion } from './commandBossRender'
import { sampleCommandBossCloak } from './commandBoss'
import { drawGenericBossShip } from './genericBossRender'
import { getEnemyCanvasSize } from './assets'
import { DEG, STAGE_CLEAR_SECONDS } from './constants'
import type { BossKind, Enemy, MirageBossKind } from './types'
import { clamp } from './utils'
import { drawCachedBossBar } from './bossHudRender'
import { drawDevilGundamBoss } from './devilBossRender'
import { drawSnakeVenomTelegraph } from './snakeBossRender'
import { specialBossHullKey } from './specialBossCatalog'
import { ORGANIC_BOSS_VIEW_YAW } from './raidView'
import { getStageBossIntroProgress } from './stageBossRender'

// Kept as lifecycle hooks for the runtime; enemy bodies no longer allocate Canvas rasters.
export function pruneNormalEnemyRasters(_activeEnemies: readonly Enemy[], _maxRetire = 8) {}
export function clearNormalEnemyRasters() {}

export function getBossDefeatFade(enemy: Enemy) {
  if (enemy.hp > 0) return 1
  const remaining=enemy.defeatTimer ?? enemy.devilDefeatedTimer ?? STAGE_CLEAR_SECONDS
  return authoredDefeatAlpha(enemy.defeatStyle,enemy.defeatFinale,STAGE_CLEAR_SECONDS-remaining,clamp(remaining/STAGE_CLEAR_SECONDS,0,1))
}

function drawBossResidualHit(ctx: CanvasRenderingContext2D, enemy: Enemy, size: number) {
  if (enemy.bossImpactTime || !enemy.hitFlash) return
  const alpha = Math.min(.66, enemy.hitFlash * 2.8)
  drawBossFx(ctx, BOSS_FX.impact, 0, 0, size * .22, size * .21, alpha, 0, true)
}

function drawRaidEnemyHealthBar(
  ctx: CanvasRenderingContext2D, enemy: Enemy, x: number, y: number, size: number,
  viewportWidth: number, viewportHeight: number, landscape: boolean, command = false,
) {
  const draw = command ? drawCommandBossHealthBar : drawCachedBossBar
  if (!landscape) {
    draw(ctx, enemy, x, y+(enemy.bossKind==='snake'?size*.1:0), size)
    return
  }
  // Keep the existing boss-bar artwork upright and contained on short screens.
  const barSize = Math.min(size, viewportWidth * .32)
  const margin = barSize * .9 + 12
  const screenX = clamp(viewportHeight - y, margin, viewportHeight - margin)
  const snake=enemy.bossKind==='snake'
  const barTop = clamp(x + size * (snake ? .62 : .4), 90, viewportWidth - (snake ? 32 : 40))
  const offset = command ? 12 : enemy.bossKind === 'devil' ? 30 : enemy.bossKind === 'final' ? 20
    : enemy.bossKind === 'snake' || enemy.bossKind === 'squid' || enemy.bossKind === 'super' ? 16 : 12
  ctx.save()
  ctx.translate(0, viewportHeight)
  ctx.rotate(-Math.PI / 2)
  draw(ctx, enemy, screenX, barTop - barSize * .5 - offset, barSize)
  ctx.restore()
}

export function drawRaidEliteFighterBar(
  ctx: CanvasRenderingContext2D, enemy: Enemy, x: number, y: number, size: number,
  viewportWidth: number, viewportHeight: number, landscape: boolean,
) {
  ctx.save()
  ctx.globalAlpha *= getRaidFighterOpacity(enemy, prefersRaidReducedMotion())
  drawRaidEnemyHealthBar(ctx, enemy, x, y, size * .82, viewportWidth, viewportHeight, landscape)
  ctx.restore()
}

export function drawRaidEnemy(
  ctx: CanvasRenderingContext2D,
  enemy: Enemy,
  toX: (value: number) => number,
  toY: (value: number) => number,
  viewportWidth: number,
  time: number,
  _normalEnemyFilter: string,
  _dpr = 1,
  skipGpuStageBossBody = false,
  landscape = false,
  paused = false,
  captured = false,
) {
  const x = toX(enemy.x)
  const y = toY(enemy.y)
  const size = getEnemyCanvasSize(enemy, viewportWidth, landscape) * (viewportWidth > 1100 ? 0.96 : 1)

  const bossForceField = enemy.isBoss || enemy.isMiniBoss ? getBossForceFieldStrength(enemy) : 0
  const enemyBank: EnemyBankMotion | undefined = (enemy.isBoss || enemy.isMiniBoss) && enemy.bossKind !== 'devil'
    ? { x: enemy.x, y: enemy.y, time, paused: paused || enemy.hp <= 0,
      kind: enemy.isMiniBoss ? 'elite' : enemy.bossKind === 'squid' || enemy.bossKind === 'snake' ? 'organic'
        : enemy.bossKind === 'final' ? 'mothership' : 'capital' }
    : undefined

  if (enemy.isBoss) {
    const defeatFade = getBossDefeatFade(enemy)
    const floatScale = 1 + Math.sin(time / 1100) * 0.03
    const rotation = Math.sin(time / 1100) * 0.5 * DEG
    const displayBossKind: BossKind | MirageBossKind | null = enemy.bossKind === 'final' && (enemy.mirageTimer ?? 0) > 0 && enemy.mirageKind
      ? enemy.mirageKind
      : enemy.bossKind
    if (displayBossKind === 'devil') {
      ctx.save()
      ctx.translate(x, y)
      // The landscape playfield rotates clockwise; counter-rotate the body.
      if (landscape) ctx.rotate(-Math.PI / 2)
      drawDevilGundamBoss(ctx, enemy, skipGpuStageBossBody ? getEnemyCanvasSize(enemy, viewportWidth, landscape) : size,
        time, skipGpuStageBossBody, landscape)
      if (landscape) ctx.translate(0, size * 0.28)
      drawBossResidualHit(ctx, enemy, size)
      ctx.restore()
      if (enemy.hp > 0) {
        const bodyX = landscape ? x + size * 0.28 : x
        const barY = landscape ? y : y + size * 0.16
        drawRaidEnemyHealthBar(ctx, enemy, bodyX, barY, size, viewportWidth, toY(100), landscape)
      }
      return
    }
    if (displayBossKind === 'squid' || displayBossKind === 'snake' || displayBossKind === 'final') {
      const introProgress = getStageBossIntroProgress(enemy, displayBossKind)
      const introScale = 0.74 + introProgress * 0.26
      ctx.save()
      ctx.translate(x, y)
      ctx.globalAlpha *= defeatFade
      // Counter the rotated playfield so the organic boss is upright on screen.
      if (landscape && (displayBossKind === 'squid' || displayBossKind === 'snake')) ctx.rotate(-Math.PI / 2)
      ctx.rotate(displayBossKind === 'snake' ? 0 : rotation * 0.45)
      ctx.globalAlpha *= 0.58 + introProgress * 0.42
      // Fit the hood and complete coils into the same boss envelope. This is
      // presentation scale; simulation hit tests and committed lanes stay native.
      const bodyScale=floatScale*introScale*(displayBossKind==='snake' ? .8 : 1)
      ctx.scale(bodyScale,bodyScale)
      const key=specialBossHullKey(displayBossKind)!
      const organic=displayBossKind!=='final'
      if (enemyBank) enemyBank.kind = organic ? 'organic' : 'mothership'
      const reduced=prefersRaidReducedMotion()
      const bite=displayBossKind==='snake'&&enemy.chargePattern==='cross'
        &&(enemy.chargeTimer>0||(enemy.beamVolleyRecovery??0)>0)
      const whip=displayBossKind==='squid'&&enemy.chargeTimer>0&&enemy.chargePattern!=='rotate'
      const chargeWarm=clamp(1-enemy.chargeTimer/(bite?1.08:.9),0,1)
      const attack=bite&&enemy.chargeTimer<=0
        ?clamp((enemy.beamVolleyRecovery??0)/.42,0,1):bite||whip?chargeWarm:0
      // Targets use the body's upright local plane. Undo the landscape yaw
      // foreshortening so a 3D extension reaches the authoritative lane.
      const dx=toX(enemy.chargeLane)-x,dy=toY(enemy.chargeTargetY??enemy.y+34)-y
      const localX=(landscape?-dy:dx)/(size*bodyScale)
      const localY=(landscape?-dx:-dy)/(size*bodyScale)
      const rage=clamp((.55-enemy.hp/Math.max(1,enemy.maxHp))/.55,0,1)
      drawLiveHull(ctx,key,0,0,size,0,1,landscape,'enemy:'+enemy.id,{
        hit:Math.min(1,(enemy.hitFlash??0)/.18), enemyBank, bossForceField,
        spin:organic||reduced?0:time/1000*(.055+rage*.018),
        bossPose:organic?{seconds:time/1000,attack,targetX:localX/(landscape?Math.cos(ORGANIC_BOSS_VIEW_YAW):1),
          targetY:localY,motion:reduced?0:1}:undefined,
      })
      drawBossResidualHit(ctx, enemy, size)
      ctx.restore()
      if (enemy.hp > 0) {
        if (displayBossKind === 'squid' && enemy.chargeTimer > 0 && enemy.chargePattern !== 'rotate') {
          // Keep the actual target warning; the whip itself is a lit 3D limb.
          drawBossFx(ctx,BOSS_FX.precision,toX(enemy.chargeLane),toY(enemy.chargeTargetY??enemy.y+34),
            size*.24,size*.17,.7,0,true)
        }
        if (displayBossKind === 'snake' && (enemy.chargeTimer > 0 || (enemy.chargePattern === 'cross' && (enemy.beamVolleyRecovery ?? 0) > 0))) {
          drawSnakeVenomTelegraph(ctx, x, y, toX(enemy.chargeLane), toY(enemy.chargeTargetY ?? enemy.y + 34), size, viewportWidth, time, enemy.chargeTimer, enemy.chargePattern, enemy.beamVolleyRecovery ?? 0, landscape, true)
        }
        drawRaidEnemyHealthBar(ctx, enemy, x, y, size, viewportWidth, toY(100), landscape)
      }
      return
    }
    drawCommandBossTelegraph(ctx, enemy, toX, toY, viewportWidth)
    const reducedMotion = prefersRaidReducedMotion()
    const recoil = !reducedMotion && enemy.bossImpact?.kind === 'heavy' ? (enemy.bossImpactTime ?? 0) * size * .12 : 0
    const drift = enemy.hp <= 0 && !reducedMotion ? (1 - defeatFade) * (enemy.id % 2 ? -.18 : .18) : 0
    const hullOpacity = getCommandBossHullOpacity(enemy)
    if (enemy.bossManeuver === 'phaseShift') {
      drawCommandPhaseAfterimages(enemy, (ghostX, alpha, index) => {
        drawGenericBossShip(ctx, enemy, toX(ghostX), y, size, rotation, floatScale, alpha, landscape, undefined,
          'fx:command-phase:' + enemy.id + ':' + index)
      })
    }
    drawGenericBossShip(ctx, enemy, x, y - recoil, size, rotation + drift, floatScale, defeatFade * hullOpacity, landscape, enemyBank, undefined, bossForceField)
    drawCommandBossEnergy(ctx, enemy, toX, toY, size)
    ctx.save()
    ctx.translate(x, y)
    ctx.globalAlpha *= defeatFade
    drawBossResidualHit(ctx, enemy, size)
    ctx.restore()
    if (enemy.hp > 0 && sampleCommandBossCloak(enemy) < .8) {
      ctx.save()
      ctx.globalAlpha *= hullOpacity
      drawRaidEnemyHealthBar(ctx, enemy, x, y, size, viewportWidth, toY(100), landscape, true)
      ctx.restore()
    }
    return
  }

  if (enemy.isMiniBoss) {
    const floatScale = 1 + Math.sin(time / 760 + enemy.phase) * 0.035
    const rotation = Math.sin(time / 900 + enemy.phase) * 1.4 * DEG
    const key = enemyHullKey(enemy)
    if (key) {
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(rotation)
      drawLiveHull(ctx, key, 0, 0, size * floatScale, 0, 1, landscape, 'enemy:' + enemy.id,
        { hit: Math.min(1, (enemy.hitFlash ?? 0) / .14), enemyBank, bossForceField })
      ctx.restore()
    }
    ctx.save()
    ctx.translate(x, y)
    drawBossResidualHit(ctx, enemy, size)
    ctx.restore()
    if (!captured) drawRaidEnemyHealthBar(ctx, enemy, x, y, size * 0.82, viewportWidth, toY(100), landscape)
    return
  }

  const key = enemyHullKey(enemy)
  const heading = fighterHullHeading(enemy.fighterBankVx ?? enemy.vx, enemy.vy, viewportWidth, toY(100))
  const bank = fighterHullBank(enemy.fighterBankVx)
  if (key) {
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(-heading)
    const opacity = enemy.fighterDefenseAge === undefined ? 1 : getRaidFighterOpacity(enemy, prefersRaidReducedMotion())
    drawLiveHull(ctx, key, 0, 0, size, bank, opacity, landscape, 'enemy:' + enemy.id,
      { hit: Math.min(1, (enemy.hitFlash ?? 0) / .16) })
    ctx.restore()
  }
  const hit = Math.min(1, (enemy.hitFlash ?? 0) / .16)
  const charge = getRaidFighterCharge(enemy)
  const muzzle = Math.min(1, (enemy.fighterShotFlash ?? 0) / FIGHTER_FIRE_FLASH)
  const texture = hit ? getRaidCombatFrame(COMBAT_TILE.ionImpact)
    : muzzle ? getRaidCombatFrame(COMBAT_TILE.muzzle) : charge ? getRaidCombatFrame(COMBAT_TILE.charge) : undefined
  if (texture) {
    const edge = size * (hit ? .74 : muzzle ? .76 : .46)
    const gunHeading = fighterGunHeading(enemy.fighterShotAngle, heading, viewportWidth, toY(100))
    drawRaidCombatTexture(ctx, texture, x+Math.sin(gunHeading)*size*(hit ? .02 : .34),
      y+Math.cos(gunHeading)*size*(hit ? .02 : .34), edge, edge, 0, true, hit || muzzle || charge)
  }
  if (enemy.eliteFighter && !captured) drawRaidEliteFighterBar(ctx, enemy, x, y, size, viewportWidth, toY(100), landscape)
}
