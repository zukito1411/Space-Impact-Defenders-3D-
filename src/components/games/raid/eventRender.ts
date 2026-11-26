import { drawCanvasImageContain, getCanvasSpriteSource, getRaidHazardCanvasSprite, getRaidOtherCanvasSprite } from './assets'
import { HEIGHT, RANDOM_EVENT_WARNING_SECONDS, WIDTH } from './constants'
import { BLACK_HOLE_AXIS_RATIO, BLACK_HOLE_PULL_RANGE, getBlackHole, getSolarWave, ION_STRIKE_DISCHARGE, ION_STRIKE_WARMUP, ionStrikeHalfWidth, SOLAR_FRONT_HALF_DEPTH, SOLAR_GAP_HALF_WIDTH, SOLAR_WAVE_CHARGE, SOLAR_WAVE_COUNT, SOLAR_WAVE_TRAVEL } from './events'
import type { IonStrike, RaidRandomEvent } from './types'
import { clamp, drawRadialEllipse } from './utils'

const TAU = Math.PI * 2
const BLACK_HOLE_HALO = [[0, 'rgba(71,31,137,.28)'], [.52, 'rgba(82,46,151,.12)'], [1, 'rgba(50,24,113,0)']] as const
const SOLAR_CORONA = [[0, 'rgba(255,213,114,.53)'], [.39, 'rgba(250,98,36,.38)'], [.66, 'rgba(221,42,18,.13)'], [1, 'rgba(216,58,16,0)']] as const
const ION_SOURCE_GLOW = [[0, 'rgba(202,212,255,.5)'], [.22, 'rgba(112,150,255,.31)'], [.54, 'rgba(87,76,236,.13)'], [1, 'rgba(66,47,221,0)']] as const
const STORM_LIGHT = [[0, 'rgba(155,141,255,.24)'], [.24, 'rgba(94,82,211,.14)'], [1, 'rgba(76,66,204,0)']] as const

function noise(seed: number) {
  const value = Math.sin(seed * 127.1 + 39.2) * 43758.5453
  return value - Math.floor(value)
}

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
  drawRadialEllipse(ctx, 0, 0, BLACK_HOLE_PULL_RANGE * sx * .8, BLACK_HOLE_PULL_RANGE * sy * .8, BLACK_HOLE_HALO)

  // Infall streaks trace the pull field in its own collision coordinates.
  const count = reduced ? 22 : 56
  const time = reduced ? 0 : event.age + formation * .48
  ctx.lineCap = 'round'
  for (let pass = 0; pass < 2; pass++) {
    ctx.beginPath()
    for (let i = pass; i < count; i += 2) {
      const cycle = (noise(i + event.seed) + time * (.33 + noise(i + 90) * .31)) % 1
      const radius = hole.radius + (BLACK_HOLE_PULL_RANGE * .71 - hole.radius) * (1 - cycle) ** 1.6
      const angle = i * 2.39996 + Math.log(BLACK_HOLE_PULL_RANGE / radius) * hole.direction * 1.15
      const length = (.6 + noise(i + 172) ** 2 * 7) * (.4 + cycle * .6)
      ctx.moveTo(Math.cos(angle) * radius * sx, Math.sin(angle) * radius * sy)
      ctx.quadraticCurveTo(
        Math.cos(angle - hole.direction * .035) * (radius + length * .44) * sx,
        Math.sin(angle - hole.direction * .035) * (radius + length * .44) * sy,
        Math.cos(angle - hole.direction * .11) * (radius + length) * sx,
        Math.sin(angle - hole.direction * .11) * (radius + length) * sy,
      )
    }
    ctx.lineWidth = pass ? 1.25 : .8
    ctx.strokeStyle = pass ? 'rgba(228,196,255,.39)' : 'rgba(151,148,224,.24)'
    ctx.stroke()
  }

  ctx.scale(hole.radius * sx, hole.radius * sy)
  if (landscape) ctx.rotate(-Math.PI / 2)
  ctx.rotate(-.22)
  ctx.globalCompositeOperation = 'source-over'
  ctx.fillStyle = '#020108'
  ctx.beginPath()
  ctx.arc(0, 0, 1, 0, TAU)
  ctx.fill()
  const lens = getRaidHazardCanvasSprite('blackHole')
  if (lens.loaded) {
    ctx.drawImage(getCanvasSpriteSource(lens), -3.6, -3.6, 7.2, 7.2)
  } else {
    ctx.strokeStyle = '#faad82'
    ctx.lineWidth = .053
    ctx.stroke()
    ctx.strokeStyle = 'rgba(190,110,244,.52)'
    ctx.beginPath()
    ctx.ellipse(0, .37, 2.4, .34, 0, 0, TAU)
    ctx.stroke()
  }

  // Tight, fast filaments give the baked lensing texture direction and depth.
  if (!reduced) {
    ctx.globalCompositeOperation = 'screen'
    ctx.lineWidth = .018
    ctx.strokeStyle = 'rgba(255,217,180,.7)'
    ctx.beginPath()
    for (let i = 0; i < 21; i++) {
      const angle = i * 2.39996 + time * (.85 + noise(i + 215) * .85) * hole.direction
      if (Math.sin(angle) < .28) continue
      const radius = 1.22 + noise(i + 8) * 1.94
      const x = Math.cos(angle) * radius
      const y = .36 + Math.sin(angle) * radius * .21
      if (x * x + y * y < 1.05) continue
      ctx.moveTo(x, y)
      ctx.lineTo(Math.cos(angle + .14 * hole.direction) * radius, .36 + Math.sin(angle + .14 * hole.direction) * radius * .21)
    }
    ctx.stroke()
  }
  ctx.restore()
}

export function drawIonStorm(ctx: CanvasRenderingContext2D, event: RaidRandomEvent, width: number, height: number, reduced: boolean) {
  const enter = clamp(1 - event.warning / RANDOM_EVENT_WARNING_SECONDS, 0, 1)
  const fade = Math.min(enter, clamp((event.duration - event.age) / .92, 0, 1))
  if (fade <= 0) return
  const time = reduced ? 0 : event.age
  const storm = getRaidHazardCanvasSprite('stormShelf')
  ctx.save()
  ctx.globalAlpha = fade
  if (storm.loaded) {
    const source = getCanvasSpriteSource(storm)
    const drift = Math.sin(time * .43 + event.seed) * width * .04
    ctx.drawImage(source, -width * .12 + drift, -height * .08, width * 1.24, height * .41)
    ctx.globalAlpha *= .53
    ctx.drawImage(source, -width * .22 - drift, height * .06, width * 1.5, height * .35)
  }
  ctx.globalCompositeOperation = 'screen'
  drawRadialEllipse(ctx, width * .53, height * .12, width * .52, height * .22, STORM_LIGHT)
  ctx.restore()
}

function traceLaneCorners(ctx: CanvasRenderingContext2D, x: number, half: number, height: number) {
  const mark = Math.max(6, half * .72)
  ctx.beginPath()
  for (const side of [-1, 1]) {
    const edge = x + side * half
    for (const y of [height * .09, height * .5, height * .91]) {
      ctx.moveTo(edge - side * mark, y)
      ctx.lineTo(edge, y)
      ctx.lineTo(edge, y - mark)
    }
  }
}

const LIGHTNING_SEGMENTS = 58
const lightningXs = new Float32Array(LIGHTNING_SEGMENTS + 1)

export function drawIonStrike(ctx: CanvasRenderingContext2D, strike: IonStrike, width: number, height: number, reduced: boolean) {
  const x = strike.x / WIDTH * width
  const half = ionStrikeHalfWidth(strike) / WIDTH * width
  const charging = strike.warmup > 0
  const charge = clamp(1 - strike.warmup / ION_STRIKE_WARMUP, 0, 1)
  const age = strike.duration - strike.life
  const afterglow = clamp(strike.life / strike.duration, 0, 1)
  ctx.save()
  ctx.globalCompositeOperation = 'screen'
  if (charging) {
    const lane = ctx.createLinearGradient(x - half, 0, x + half, 0)
    lane.addColorStop(0, 'rgba(93,151,255,.25)')
    lane.addColorStop(.18, 'rgba(57,91,202,.045)')
    lane.addColorStop(.82, 'rgba(57,91,202,.045)')
    lane.addColorStop(1, 'rgba(93,151,255,.25)')
    ctx.fillStyle = lane
    ctx.globalAlpha = .48 + charge * .46
    ctx.fillRect(x - half, 0, half * 2, height)
    ctx.strokeStyle = '#92c8ff'
    ctx.lineWidth = 1.4
    traceLaneCorners(ctx, x, half, height)
    ctx.stroke()
    ctx.strokeStyle = 'rgba(142,187,255,.56)'
    ctx.beginPath()
    ctx.moveTo(x - half, 0)
    ctx.lineTo(x - half, height * charge)
    ctx.moveTo(x + half, 0)
    ctx.lineTo(x + half, height * charge)
    ctx.stroke()
    drawRadialEllipse(ctx, x, height * .06, half * 2, height * .095, STORM_LIGHT)
    ctx.restore()
    return
  }

  const energy = age < ION_STRIKE_DISCHARGE ? .66 + .34 * Math.exp(-age * 13) : afterglow * .74
  const seed = strike.id * 3.429 + (reduced ? 0 : Math.min(2, Math.floor(age * 7)) * 42)
  ctx.globalAlpha = energy * (reduced ? .72 : 1)
  const haze = ctx.createLinearGradient(x - half, 0, x + half, 0)
  haze.addColorStop(0, 'rgba(76,50,212,0)')
  haze.addColorStop(.32, 'rgba(78,67,234,.06)')
  haze.addColorStop(.52, 'rgba(111,119,252,.16)')
  haze.addColorStop(1, 'rgba(76,50,212,0)')
  ctx.fillStyle = haze
  ctx.fillRect(x - half, 0, half * 2, height)
  drawRadialEllipse(ctx, x, height * .085, half * 3.0, height * .136, ION_SOURCE_GLOW)

  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.beginPath()
  const step = height / LIGHTNING_SEGMENTS
  for (let i = 0; i <= LIGHTNING_SEGMENTS; i++) {
    const bend = Math.sin(i * .36 + seed) * .34 + Math.sin(i * .93) * .13 + (noise(seed + i * 1.13) - .5) * .51
    lightningXs[i] = x + half * bend
    if (i === 0) ctx.moveTo(lightningXs[i], 0)
    else ctx.lineTo(lightningXs[i], i * step)
  }
  ctx.strokeStyle = 'rgba(65,58,245,.16)'
  ctx.lineWidth = Math.max(8, half * .84)
  ctx.stroke()
  ctx.strokeStyle = 'rgba(108,103,255,.3)'
  ctx.lineWidth = Math.max(5, half * .51)
  ctx.stroke()
  ctx.strokeStyle = 'rgba(127,172,255,.59)'
  ctx.lineWidth = Math.max(2.4, half * .23)
  ctx.stroke()
  ctx.strokeStyle = '#e6f4ff'
  ctx.lineWidth = Math.max(1.05, half * .065)
  ctx.stroke()

  ctx.beginPath()
  for (let i = 2; i < LIGHTNING_SEGMENTS - 5; i += reduced ? 7 : 4) {
    const side = noise(seed + i * .32) >= .5 ? 1 : -1
    const origin = lightningXs[i]
    const reach = .72 + noise(i + seed * 1.2) * .23
    const length = 1.8 + noise(i - seed) * 3.2
    ctx.moveTo(origin, i * step)
    for (let segment = 1; segment <= 5; segment++) {
      const fraction = segment / 5
      const destination = x + side * half * (reach * fraction + (noise(seed + i + segment * 2.1) - .5) * .3)
      const px = origin * (1 - fraction) + destination * fraction
      const py = (i + length * fraction) * step
      ctx.lineTo(px, py)
      if (segment === 2 && !reduced) {
        ctx.lineTo(px + side * half * .32, py + length * step * .15)
        ctx.lineTo(px + side * half * .47, py + length * step * .41)
        ctx.moveTo(px, py)
      }
    }
  }
  ctx.strokeStyle = 'rgba(119,134,255,.37)'
  ctx.lineWidth = Math.max(1.5, half * .16)
  ctx.stroke()
  ctx.strokeStyle = 'rgba(183,219,255,.75)'
  ctx.lineWidth = .8
  ctx.stroke()

  if (!reduced) {
    ctx.beginPath()
    for (let i = 1; i < LIGHTNING_SEGMENTS; i += 2) {
      const side = noise(i + seed) < .5 ? -1 : 1
      const px = x + side * half * (.33 + noise(i * 3.09 + seed) * .61)
      const py = step * (i + noise(i + 74))
      ctx.moveTo(px, py)
      ctx.lineTo(px + side * half * .05, py + 2 + noise(i + 32) * 3)
    }
    ctx.strokeStyle = 'rgba(155,193,255,.46)'
    ctx.lineWidth = .95
    ctx.stroke()
  }
  ctx.restore()
}

export function drawSolarFlare(ctx: CanvasRenderingContext2D, event: RaidRandomEvent, width: number, height: number, landscape: boolean, reduced: boolean) {
  const intensity = clamp(1 - event.warning / RANDOM_EVENT_WARNING_SECONDS, 0, 1)
    * clamp((event.duration - event.age) / .67, 0, 1)
  if (intensity <= 0) return
  const sunX = width * (Math.floor(event.seed) % 2 === 0 ? .72 : .28)
  const radius = Math.min(width * .35, height * .23)
  ctx.save()
  ctx.globalAlpha = intensity
  ctx.globalCompositeOperation = 'screen'
  drawRadialEllipse(ctx, sunX, -radius * .52, radius * 2.5, radius * 1.9, SOLAR_CORONA)
  ctx.globalCompositeOperation = 'source-over'
  drawCanvasImageContain(ctx, getRaidOtherCanvasSprite('sun'), sunX, -radius * .69, radius * 2.8, radius * 2.8,
    'none', .94, (!reduced ? event.age * .06 : 0) + (landscape ? -Math.PI / 2 : 0))

  ctx.globalCompositeOperation = 'screen'
  ctx.beginPath()
  for (let i = 0; i < 5; i++) {
    const start = .25 + i * .52 + Math.sin(event.age * (reduced ? 0 : .35) + i) * .07
    const end = start + .23 + noise(i + 45) * .19
    const y = -radius * .61
    ctx.moveTo(sunX + Math.cos(start) * radius, y + Math.sin(start) * radius)
    const lift = 1.22 + noise(i + 249) * .27
    ctx.bezierCurveTo(
      sunX + Math.cos(start) * radius * lift, y + Math.sin(start) * radius * lift,
      sunX + Math.cos(end + .09) * radius * (lift + .08), y + Math.sin(end + .09) * radius * (lift + .08),
      sunX + Math.cos(end) * radius, y + Math.sin(end) * radius,
    )
  }
  ctx.strokeStyle = 'rgba(255,101,53,.44)'
  ctx.lineWidth = 3.6
  ctx.stroke()
  ctx.strokeStyle = 'rgba(255,182,114,.79)'
  ctx.lineWidth = .9
  ctx.stroke()
  ctx.restore()

  for (let i = 0; i < SOLAR_WAVE_COUNT; i++) {
    const wave = getSolarWave(event, i)
    if (wave.age < 0 || wave.age > SOLAR_WAVE_CHARGE + SOLAR_WAVE_TRAVEL) continue
    const left = (wave.gap - SOLAR_GAP_HALF_WIDTH) / WIDTH * width
    const right = (wave.gap + SOLAR_GAP_HALF_WIDTH) / WIDTH * width
    const y = wave.y / HEIGHT * height
    const depth = SOLAR_FRONT_HALF_DEPTH / HEIGHT * height
    const charging = wave.age < SOLAR_WAVE_CHARGE || event.warning > 0
    ctx.save()
    if (charging) {
      ctx.globalAlpha = intensity * (event.warning > 0 ? .55 : .85)
      const tint = ctx.createLinearGradient(0, 0, 0, height)
      tint.addColorStop(0, 'rgba(89,210,228,.46)')
      tint.addColorStop(.4, 'rgba(104,225,249,.31)')
      tint.addColorStop(1, 'rgba(104,225,249,.75)')
      ctx.strokeStyle = tint
      ctx.lineWidth = 1.5
      ctx.setLineDash([11, 10])
      ctx.beginPath()
      ctx.moveTo(left, 0)
      ctx.lineTo(left, height)
      ctx.moveTo(right, 0)
      ctx.lineTo(right, height)
      ctx.stroke()
      ctx.restore()
      continue
    }

    ctx.globalAlpha = intensity
    ctx.globalCompositeOperation = 'screen'
    ctx.beginPath()
    ctx.rect(0, 0, left, height)
    ctx.rect(right, 0, width - right, height)
    ctx.clip()
    const texture = getRaidHazardCanvasSprite('solarFront')
    const wake = Math.max(depth * 9, height * .14)
    if (texture.loaded) {
      ctx.drawImage(getCanvasSpriteSource(texture), 0, y - wake * .81, width, wake)
    } else {
      const glow = ctx.createLinearGradient(0, y - wake * .6, 0, y + depth)
      glow.addColorStop(0, 'rgba(250,91,20,0)')
      glow.addColorStop(.85, 'rgba(255,105,28,.71)')
      glow.addColorStop(1, 'rgba(255,229,173,.88)')
      ctx.fillStyle = glow
      ctx.fillRect(0, y - wake * .6, width, wake * .6 + depth)
    }
    if (!reduced) {
      ctx.strokeStyle = 'rgba(255,178,94,.56)'
      ctx.lineWidth = 1
      ctx.beginPath()
      for (let j = 0; j < 40; j++) {
        const drift = (noise(event.seed + j * 5) + wave.age * (.44 + noise(j) * .45)) % 1
        const px = noise(j * 3.17 + i) * width
        const py = y - drift * wake * .81
        ctx.moveTo(px, py)
        ctx.lineTo(px + (noise(j + 13) - .7) * 8, py - (1 - drift) * 15 - 2)
      }
      ctx.stroke()
    }
    ctx.restore()

    ctx.save()
    ctx.globalAlpha = intensity * .8
    ctx.strokeStyle = '#ffcb8f'
    ctx.lineWidth = 1.25
    ctx.beginPath()
    for (const x of [left, right]) {
      ctx.moveTo(x, y - depth * 2)
      ctx.lineTo(x, y + depth)
    }
    ctx.stroke()
    ctx.restore()
  }
}
