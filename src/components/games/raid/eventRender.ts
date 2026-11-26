import { getCanvasSpriteSource, getRaidHazardCanvasSprite } from './assets'
import { HEIGHT, RANDOM_EVENT_WARNING_SECONDS, WIDTH } from './constants'
import {
  BLACK_HOLE_AXIS_RATIO, BLACK_HOLE_PULL_RANGE, getBlackHole, getSolarWave, ION_STRIKE_DISCHARGE,
  ION_STRIKE_WARMUP, ionStrikeHalfWidth, SOLAR_FRONT_HALF_DEPTH, SOLAR_GAP_HALF_WIDTH,
  SOLAR_WAVE_CHARGE, SOLAR_WAVE_COUNT, SOLAR_WAVE_TRAVEL,
} from './events'
import type { IonStrike, RaidRandomEvent } from './types'
import { clamp, drawRadialEllipse } from './utils'

const TAU = Math.PI * 2
const BLACK_HOLE_HALO = [[0, 'rgba(72,36,122,.18)'], [.44, 'rgba(89,34,122,.1)'], [1, 'rgba(45,23,87,0)']] as const
const ION_CHARGE_GLOW = [[0, 'rgba(166,191,255,.54)'], [.26, 'rgba(97,114,255,.28)'], [1, 'rgba(55,38,195,0)']] as const
const ION_DISCHARGE_GLOW = [[0, 'rgba(220,232,255,.66)'], [.14, 'rgba(157,167,255,.35)'], [.36, 'rgba(108,75,216,.19)'], [1, 'rgba(61,39,124,0)']] as const
const SOLAR_PASSAGE_GLOW = [[0, 'rgba(123,227,223,.27)'], [.5, 'rgba(68,155,170,.17)'], [1, 'rgba(31,72,95,0)']] as const

const ACCRETION_FRAMES = 8
const SOLAR_FRAMES = 12
const ION_FRAMES = 6

type HazardSprite = NonNullable<ReturnType<typeof getCanvasSpriteSource>>

function drawAtlasFrame(
  ctx: CanvasRenderingContext2D, source: HazardSprite, frame: number, columns: number, rows: number,
  x: number, y: number, width: number, height: number,
) {
  const cellWidth = source.width / columns
  const cellHeight = source.height / rows
  ctx.drawImage(source, frame % columns * cellWidth, Math.floor(frame / columns) * cellHeight,
    cellWidth, cellHeight, x, y, width, height)
}

function drawLoop(
  ctx: CanvasRenderingContext2D, source: HazardSprite, frame: number, frames: number,
  x: number, y: number, width: number, height: number,
) {
  const index = Math.floor(frame)
  const blend = frame - index
  const rows = frames / 4
  const alpha = ctx.globalAlpha
  drawAtlasFrame(ctx, source, index % frames, 4, rows, x, y, width, height)
  if (blend <= .02) return
  ctx.globalAlpha = alpha * blend
  drawAtlasFrame(ctx, source, (index + 1) % frames, 4, rows, x, y, width, height)
  ctx.globalAlpha = alpha
}

function noise(seed: number) {
  const value = Math.sin(seed * 127.1 + 39.2) * 43758.5453
  return value - Math.floor(value)
}

const orbitDust = Array.from({ length: 96 }, (_, index) => ({
  phase: noise(index + 9),
  scatter: noise(index + 24),
  speed: .24 + noise(index + 81) * .41,
  angle: noise(index + 134) * TAU,
}))

export function drawBlackHole(ctx: CanvasRenderingContext2D, event: RaidRandomEvent, width: number, height: number, landscape: boolean, reduced: boolean) {
  const hole = getBlackHole(event)
  const sx = width / WIDTH
  const sy = height / HEIGHT / BLACK_HOLE_AXIS_RATIO
  const formation = 1 - event.warning / RANDOM_EVENT_WARNING_SECONDS
  const opacity = clamp(formation * 1.7, 0, 1) * clamp((event.duration - event.age) / .62, 0, 1)
  if (opacity <= 0) return

  ctx.save()
  ctx.translate(hole.x * sx, hole.y / HEIGHT * height)
  ctx.globalAlpha = opacity
  ctx.globalCompositeOperation = 'screen'
  drawRadialEllipse(ctx, 0, 0, BLACK_HOLE_PULL_RANGE * sx * .65, BLACK_HOLE_PULL_RANGE * sy * .65, BLACK_HOLE_HALO)

  // Dust rotates faster as it approaches the horizon and vanishes at the rim.
  const time = reduced ? 0 : event.age + formation * .48
  const count = reduced ? 28 : orbitDust.length
  const scale = Math.min(sx, sy)
  for (let pass = 0; pass < 2; pass++) {
    ctx.fillStyle = pass ? '#f9cbab' : '#a58cdf'
    ctx.beginPath()
    for (let index = pass; index < count; index += 2) {
      const dust = orbitDust[index]
      const cycle = (dust.phase + time * dust.speed) % 1
      const radius = hole.radius + (BLACK_HOLE_PULL_RANGE * (.53 + dust.scatter * .27) - hole.radius) * (1 - cycle) ** 1.72
      const angle = dust.angle + Math.log(BLACK_HOLE_PULL_RANGE / radius) * hole.direction * 1.63
      const x = Math.cos(angle) * radius * sx
      const y = Math.sin(angle) * radius * sy
      const size = scale * (.07 + dust.scatter ** 2 * .28) * Math.sin(cycle * Math.PI) + .18
      ctx.moveTo(x + size, y)
      ctx.arc(x, y, size, 0, TAU)
    }
    ctx.globalAlpha = opacity * (pass ? .72 : .38)
    ctx.fill()
  }

  ctx.globalAlpha = opacity
  ctx.scale(hole.radius * sx, hole.radius * sy)
  if (landscape) ctx.rotate(-Math.PI / 2)
  ctx.rotate(-.29)
  ctx.globalCompositeOperation = 'source-over'
  ctx.fillStyle = '#010106'
  ctx.beginPath()
  ctx.arc(0, 0, 1, 0, TAU)
  ctx.fill()
  const lens = getRaidHazardCanvasSprite('blackHole')
  if (lens.loaded) {
    const motion = hole.direction > 0 ? time : (100 - time)
    drawLoop(ctx, getCanvasSpriteSource(lens), (event.seed % 8) + motion * 3.2,
      ACCRETION_FRAMES, -3.4, -3.4, 6.8, 6.8)
  } else {
    ctx.globalCompositeOperation = 'screen'
    drawRadialEllipse(ctx, 0, 0, 1.16, 1.16, [
      [0, 'rgba(70,29,117,0)'], [.83, 'rgba(138,77,141,0)'], [.89, 'rgba(255,179,132,.76)'], [1, 'rgba(143,75,135,0)'],
    ])
  }
  ctx.restore()
}

export function drawIonStorm(ctx: CanvasRenderingContext2D, event: RaidRandomEvent, width: number, height: number, reduced: boolean) {
  const enter = clamp(1 - event.warning / RANDOM_EVENT_WARNING_SECONDS, 0, 1)
  const fade = Math.min(enter, clamp((event.duration - event.age) / .92, 0, 1))
  const storm = getRaidHazardCanvasSprite('stormShelf')
  if (fade <= 0 || !storm.loaded) return

  const depth = Math.min(height * .37, width * .75)
  const time = reduced ? 0 : event.age
  const drift = Math.sin(time * .49 + event.seed) * width * .084
  const source = getCanvasSpriteSource(storm)
  ctx.save()
  ctx.globalAlpha = fade * .61
  ctx.drawImage(source, -width * .22 - drift, -depth * .08, width * 1.45, depth)
  ctx.translate(width, 0)
  ctx.scale(-1, 1)
  ctx.globalAlpha = fade * .54
  ctx.drawImage(source, -width * .16 + drift, -depth * .44, width * 1.32, depth * 1.31)
  ctx.restore()
}

export function drawIonStrike(ctx: CanvasRenderingContext2D, strike: IonStrike, width: number, height: number, reduced: boolean) {
  const x = strike.x / WIDTH * width
  const half = ionStrikeHalfWidth(strike) / WIDTH * width
  const charge = clamp(1 - strike.warmup / ION_STRIKE_WARMUP, 0, 1)
  const age = strike.duration - strike.life
  const texture = getRaidHazardCanvasSprite('ionDischarge')
  const charged = strike.warmup <= 0

  ctx.save()
  ctx.globalCompositeOperation = 'screen'
  if (!charged) {
    // Charge is visible across the hit area, with a brighter packet moving down the lane.
    const lane = ctx.createLinearGradient(x - half, 0, x + half, 0)
    lane.addColorStop(0, 'rgba(58,54,186,0)')
    lane.addColorStop(.21, 'rgba(77,83,210,.13)')
    lane.addColorStop(.5, 'rgba(116,126,248,.32)')
    lane.addColorStop(.79, 'rgba(77,83,210,.13)')
    lane.addColorStop(1, 'rgba(58,54,186,0)')
    ctx.globalAlpha = .63 + charge * .37
    ctx.fillStyle = lane
    ctx.fillRect(x - half, 0, half * 2, height)
    drawRadialEllipse(ctx, x, height * (reduced ? .17 : .045 + charge * .90), half, height * .16, ION_CHARGE_GLOW)
    if (texture.loaded) {
      ctx.globalAlpha = .13 + charge * .13
      drawAtlasFrame(ctx, getCanvasSpriteSource(texture), strike.id % ION_FRAMES, 3, 2, x - half, 0, half * 2, height)
    }
  } else {
    const decay = clamp(strike.life / (strike.duration - ION_STRIKE_DISCHARGE), 0, 1)
    const energy = age < ION_STRIKE_DISCHARGE ? .82 + .18 * Math.exp(-age * 14) : decay ** 1.55 * .29
    const spread = Math.min(half * 4.1, width * .25)
    ctx.globalAlpha = energy * (reduced ? .7 : 1)
    drawRadialEllipse(ctx, x, height * .12, spread, height * .24, ION_DISCHARGE_GLOW)
    if (texture.loaded) {
      const phase = !reduced && age < ION_STRIKE_DISCHARGE ? Math.floor(age * 12) : 0
      drawAtlasFrame(ctx, getCanvasSpriteSource(texture), (strike.id + phase) % ION_FRAMES, 3, 2,
        x - half * 1.79, 0, half * 3.58, height)
    } else {
      drawRadialEllipse(ctx, x, height * .5, half, height * .8, ION_DISCHARGE_GLOW)
    }
  }
  ctx.restore()
}

export function drawSolarFlare(ctx: CanvasRenderingContext2D, event: RaidRandomEvent, width: number, height: number, reduced: boolean) {
  const intensity = clamp(1 - event.warning / RANDOM_EVENT_WARNING_SECONDS, 0, 1)
    * clamp((event.duration - event.age) / .4, 0, 1)
  if (intensity <= 0) return

  const texture = getRaidHazardCanvasSprite('solarFront')
  const wing = width * .87
  const wake = Math.min(height * .24, width * .49)
  for (let index = 0; index < SOLAR_WAVE_COUNT; index++) {
    const wave = getSolarWave(event, index)
    if (wave.age < 0 || wave.age > SOLAR_WAVE_CHARGE + SOLAR_WAVE_TRAVEL) continue
    const gap = wave.gap / WIDTH * width
    const gapRadius = SOLAR_GAP_HALF_WIDTH / WIDTH * width
    const y = wave.y / HEIGHT * height
    ctx.save()
    ctx.globalAlpha = intensity

    if (wave.age < SOLAR_WAVE_CHARGE) {
      const charge = clamp(wave.age / SOLAR_WAVE_CHARGE, 0, 1)
      ctx.globalCompositeOperation = 'screen'
      drawRadialEllipse(ctx, gap, height * .55, gapRadius, height * .63, SOLAR_PASSAGE_GLOW)
      // Show exactly where the two banks will enter. The opening stays unlit by the plasma.
      ctx.globalAlpha *= .68 + charge * .32
      if (texture.loaded) drawPlasmaWings(ctx, getCanvasSpriteSource(texture),
        index * 3 + (reduced ? 0 : charge * 3), gap, gapRadius, wing, -wake * (.71 - charge * .19), wake * .76)
      ctx.restore()
      continue
    }

    if (y + SOLAR_FRONT_HALF_DEPTH / HEIGHT * height >= 0) {
      if (texture.loaded) drawPlasmaWings(ctx, getCanvasSpriteSource(texture),
        (event.seed % 4) + index * 3 + (reduced ? 0 : wave.age * 8.4),
        gap, gapRadius, wing, y - wake * .73, wake)
      else {
        const depth = SOLAR_FRONT_HALF_DEPTH / HEIGHT * height
        ctx.globalCompositeOperation = 'screen'
        const glow = [[0, 'rgba(255,132,60,.83)'], [.42, 'rgba(243,72,32,.51)'], [1, 'rgba(158,20,32,0)']] as const
        drawRadialEllipse(ctx, (gap - gapRadius) * .5, y, (gap - gapRadius) * .5, depth * 2.1, glow)
        drawRadialEllipse(ctx, (width + gap + gapRadius) * .5, y, (width - gap - gapRadius) * .5, depth * 2.1, glow)
      }
    }
    ctx.restore()
  }
}

function drawPlasmaWings(
  ctx: CanvasRenderingContext2D, source: HazardSprite, frame: number,
  gap: number, gapRadius: number, wing: number, top: number, height: number,
) {
  drawLoop(ctx, source, frame, SOLAR_FRAMES, gap - gapRadius - wing, top, wing, height)
  ctx.save()
  ctx.translate(gap + gapRadius, 0)
  ctx.scale(-1, 1)
  drawLoop(ctx, source, frame + 5, SOLAR_FRAMES, -wing, top, wing, height)
  ctx.restore()
}
