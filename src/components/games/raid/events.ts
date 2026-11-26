import { ASTEROID_CLUSTER_MAX_SECONDS, ASTEROID_CLUSTER_MIN_SECONDS, RANDOM_EVENT_MAX_SECONDS, RANDOM_EVENT_MIN_SECONDS, RANDOM_EVENT_WARNING_SECONDS } from './constants'
import type { AsteroidHazard, IonStrike, RaidDifficulty, RaidRandomEvent, RaidRandomEventKind, Shot, Vec } from './types'
import { clamp } from './utils'

let asteroidId = 1

export function getAsteroidClusterInterval() {
  return ASTEROID_CLUSTER_MIN_SECONDS + Math.random() * (ASTEROID_CLUSTER_MAX_SECONDS - ASTEROID_CLUSTER_MIN_SECONDS)
}

export function getRandomEventInterval() {
  return RANDOM_EVENT_MIN_SECONDS + Math.random() * (RANDOM_EVENT_MAX_SECONDS - RANDOM_EVENT_MIN_SECONDS)
}

export function getRandomEventDuration(kind: RaidRandomEventKind) {
  if (kind === 'meteor') return 6.6
  if (kind === 'solar') return 9.35
  if (kind === 'rift') return 9.4
  if (kind === 'wreck') return 9
  if (kind === 'ambush') return 5.8
  return 7.8
}

const AMBUSH_WAVES = {
  easy: [2, 2, 2],
  normal: [3, 3, 3],
  hard: [3, 4, 3],
  expert: [4, 4, 3],
} as const
export const RAID_AMBUSH_WAVE_SPACING = 1.65

export function getRaidAmbushWaveSize(difficulty: RaidDifficulty, wave: number, liveEnemies: number) {
  return Math.min(AMBUSH_WAVES[difficulty][wave] ?? 0, Math.max(0, 32 - liveEnemies))
}

export function getRaidAmbushLane(seed: number, wave: number, slot: number) {
  const fromLeft = (Math.floor(seed) + wave) % 2 === 0
  const flank = 12 + slot * 8 + (seed % 1) * 3
  return fromLeft ? flank : 100 - flank
}

export function getRandomEventLabel(kind: RaidRandomEventKind) {
  if (kind === 'meteor') return 'METEOR SHOWER INBOUND'
  if (kind === 'solar') return 'SOLAR FLARE DETECTED'
  if (kind === 'rift') return 'BLACK HOLE FORMING'
  if (kind === 'wreck') return 'DERELICT SHIP AHEAD'
  if (kind === 'ambush') return 'SIGNAL JAMMED. AMBUSH'
  return 'ION STORM WARNING'
}

export const ION_STRIKE_WARMUP = 1.12
export const ION_STRIKE_DURATION = .68
export const ION_STRIKE_DISCHARGE = .31
export const ION_VOLLEY_SPACING = 1.42

export function ionStrikeIsLive(strike: IonStrike) {
  return strike.warmup <= 0 && strike.duration - strike.life < ION_STRIKE_DISCHARGE
}

export function ionStrikeHalfWidth(strike: IonStrike) {
  return strike.width * .62
}

export const SOLAR_WAVE_COUNT = 3
export const SOLAR_WAVE_SPACING = 3.05
export const SOLAR_WAVE_CHARGE = .95
export const SOLAR_WAVE_TRAVEL = 2.15
export const SOLAR_GAP_HALF_WIDTH = 15.5
export const SOLAR_FRONT_HALF_DEPTH = 2.1

export function getSolarWave(event: RaidRandomEvent, index: number) {
  const age = event.age - index * SOLAR_WAVE_SPACING
  const direction = Math.floor(event.seed) % 2 === 0 ? 1 : -1
  const gap = 50 + direction * (index - 1) * 26 + Math.sin(event.seed) * 2
  return { age, gap, y: -9 + (age - SOLAR_WAVE_CHARGE) * (118 / SOLAR_WAVE_TRAVEL) }
}

export function solarWaveHits(wave: ReturnType<typeof getSolarWave>, pilot: Vec, radius: number, dt: number) {
  if (wave.age < SOLAR_WAVE_CHARGE || wave.age > SOLAR_WAVE_CHARGE + SOLAR_WAVE_TRAVEL + dt) return false
  const previousY = wave.y - dt * (118 / SOLAR_WAVE_TRAVEL)
  return pilot.y + radius >= previousY - SOLAR_FRONT_HALF_DEPTH
    && pilot.y - radius <= wave.y + SOLAR_FRONT_HALF_DEPTH
    && Math.abs(pilot.x - wave.gap) + radius > SOLAR_GAP_HALF_WIDTH
}

export const BLACK_HOLE_AXIS_RATIO = 1.63
export const BLACK_HOLE_PULL_RANGE = 69
const BLACK_HOLE_HORIZON = 8.3

export type BlackHole = Vec & { radius: number; strength: number; direction: number }

export function getBlackHole(event: RaidRandomEvent): BlackHole {
  const phase = event.seed * .11
  const age = event.age
  const formation = 1 - clamp(event.warning / RANDOM_EVENT_WARNING_SECONDS, 0, 1)
  const fade = clamp((event.duration - age) / .75, 0, 1)
  return {
    x: 50 + Math.sin(phase + age * .41) * 13,
    y: 51 + Math.cos(phase + age * .31) * 5,
    radius: BLACK_HOLE_HORIZON * (.26 + .74 * formation ** .65) * (.22 + .78 * fade),
    strength: event.warning > 0 ? 0 : fade,
    direction: Math.floor(event.seed) % 2 === 0 ? 1 : -1,
  }
}

// Test the full movement segment so a fast projectile cannot tunnel through the horizon.
export function crossesEventHorizon(hole: BlackHole, from: Vec, to = from) {
  return segmentCrossesHorizon(hole, from.x, from.y, to.x, to.y)
}

function segmentCrossesHorizon(hole: BlackHole, fromX: number, fromY: number, toX: number, toY: number) {
  const x = fromX - hole.x
  const y = (fromY - hole.y) * BLACK_HOLE_AXIS_RATIO
  const dx = toX - fromX
  const dy = (toY - fromY) * BLACK_HOLE_AXIS_RATIO
  const lengthSq = dx * dx + dy * dy
  const t = lengthSq ? clamp(-(x * dx + y * dy) / lengthSq, 0, 1) : 0
  return (x + t * dx) ** 2 + (y + t * dy) ** 2 <= hole.radius ** 2
}

export function pullIntoBlackHole(body: Vec, hole: BlackHole, dt: number, speed: number) {
  const x = body.x
  const y = body.y
  const dx = hole.x - x
  const dy = (hole.y - y) * BLACK_HOLE_AXIS_RATIO
  const distance = Math.hypot(dx, dy)
  if (distance <= hole.radius) return true
  if (distance >= BLACK_HOLE_PULL_RANGE) return false
  const field = 1 - (distance - hole.radius) / (BLACK_HOLE_PULL_RANGE - hole.radius)
  const step = dt * speed * hole.strength * field * (.42 + .58 * field)
  const swirl = .32 * hole.direction
  body.x += (dx - dy * swirl) / distance * step
  body.y += (dy + dx * swirl) / distance * step / BLACK_HOLE_AXIS_RATIO
  return segmentCrossesHorizon(hole, x, y, body.x, body.y)
}

function bendBlackHoleShot(shot: Shot, hole: BlackHole, dt: number) {
  const dx = hole.x - shot.x
  const dy = (hole.y - shot.y) * BLACK_HOLE_AXIS_RATIO
  const distance = Math.hypot(dx, dy)
  if (distance >= BLACK_HOLE_PULL_RANGE || distance < .001) return
  const field = 1 - distance / BLACK_HOLE_PULL_RANGE
  const step = dt * 145 * hole.strength * field ** 2 / distance
  const swirl = .4 * hole.direction
  shot.vx += (dx - dy * swirl) * step
  shot.vy += (dy + dx * swirl) * step / BLACK_HOLE_AXIS_RATIO
}

export function advanceRaidEventShot(shot: Shot, dt: number, hole: BlackHole | null) {
  const x = shot.x
  const y = shot.y
  if (hole) bendBlackHoleShot(shot, hole, dt)
  shot.x += shot.vx * dt
  shot.y += shot.vy * dt
  return !hole || !segmentCrossesHorizon(hole, x, y, shot.x, shot.y)
}

export function pickRandomRaidEventKind(stage: number, surfaceStage: boolean): RaidRandomEventKind {
  const pool: RaidRandomEventKind[] = stage < 4
    ? ['meteor', 'ion', 'wreck']
    : surfaceStage
      ? ['meteor', 'solar', 'rift', 'ambush', 'ion']
      : ['meteor', 'solar', 'rift', 'wreck', 'ambush', 'ion']
  return pool[Math.floor(Math.random() * pool.length)]
}

export function pickNextRandomRaidEventKind(stage: number, surfaceStage: boolean, previousKind: RaidRandomEventKind | null) {
  let kind = pickRandomRaidEventKind(stage, surfaceStage)
  if (previousKind && kind === previousKind) {
    for (let attempt = 0; attempt < 4 && kind === previousKind; attempt += 1) {
      kind = pickRandomRaidEventKind(stage, surfaceStage)
    }
  }
  return kind
}

export function getAsteroidHp(tier: number, stage: number, powerPressure: number) {
  const tierBase = tier === 2 ? 168 : tier === 1 ? 66 : 22
  const stageScale = tier === 2 ? 15 : tier === 1 ? 6.4 : 2.4
  const powerScale = tier === 2 ? 6.2 : tier === 1 ? 2.5 : 0.85
  return Math.round(tierBase + stage * stageScale + powerPressure * powerScale)
}

export function createAsteroidHazard(tier: number, x: number, y: number, vx: number, vy: number, stage: number, powerPressure: number): AsteroidHazard {
  const hp = getAsteroidHp(tier, stage, powerPressure)
  return {
    id: asteroidId++,
    x,
    y,
    vx,
    vy,
    hp,
    maxHp: hp,
    radius: tier === 2 ? 16.5 : tier === 1 ? 9.2 : 4.8,
    tier,
    spin: Math.random() * 360,
    spinSpeed: (Math.random() < 0.5 ? -1 : 1) * (tier === 2 ? 14 + Math.random() * 18 : 24 + Math.random() * 34),
    phase: Math.random() * Math.PI * 2,
  }
}

export function splitAsteroidHazard(asteroid: AsteroidHazard, stage: number, powerPressure: number) {
  if (asteroid.tier <= 0) return []

  const childTier = asteroid.tier - 1
  const childCount = asteroid.tier === 2 ? 3 : 2
  const spread = asteroid.tier === 2 ? 0.72 : 0.58
  const children: AsteroidHazard[] = []
  for (let index = 0; index < childCount; index += 1) {
    const angle = Math.PI / 2 + (index - (childCount - 1) / 2) * spread + (Math.random() - 0.5) * 0.24
    const speed = asteroid.tier === 2 ? 15 + Math.random() * 8 : 19 + Math.random() * 10
    children.push(createAsteroidHazard(
      childTier,
      asteroid.x + Math.cos(angle) * asteroid.radius * 0.8,
      asteroid.y + Math.sin(angle) * asteroid.radius * 0.5,
      asteroid.vx * 0.42 + Math.cos(angle) * speed,
      Math.max(8, asteroid.vy * 0.62 + Math.sin(angle) * speed),
      stage,
      powerPressure,
    ))
  }

  return children
}
