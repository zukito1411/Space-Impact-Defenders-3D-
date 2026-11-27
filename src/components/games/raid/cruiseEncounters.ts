import { getRaidStageEncounter, getRaidWingSize } from './stageEncounters'
import type { Enemy, MiniBossAttack, MiniBossKind, Shot, Vec } from './types'

export type CruiseManeuver = 'pincer' | 'dive' | 'barrage' | 'escort' | 'sweep' | 'crossfire'
type CruiseEncounter = Exclude<CruiseManeuver, 'escort'> | 'patrol' | MiniBossKind

// Stage 1 uses the carrier tutorial's authored encounters. Each later sector
// changes the order of maneuvers, elite types, and recovery gaps.
const ROUTES: readonly (readonly CruiseEncounter[])[] = [
  ['patrol', 'pincer', 'sweep', 'lancer', 'patrol', 'pincer', 'sweep', 'stalker', 'pincer', 'patrol', 'sweep'],
  ['barrage', 'patrol', 'crossfire', 'stalker', 'barrage', 'sweep', 'pincer', 'lancer', 'patrol', 'crossfire', 'pincer'],
  ['dive', 'pincer', 'sweep', 'lancer', 'dive', 'crossfire', 'pincer', 'stalker', 'dive', 'pincer', 'patrol'],
  ['pincer', 'sweep', 'barrage', 'brood', 'crossfire', 'dive', 'barrage', 'stalker', 'pincer', 'sweep', 'patrol'],
  ['barrage', 'crossfire', 'dive', 'lancer', 'barrage', 'patrol', 'crossfire', 'brood', 'pincer', 'dive', 'barrage'],
  ['sweep', 'barrage', 'pincer', 'stalker', 'dive', 'sweep', 'crossfire', 'brood', 'dive', 'sweep', 'barrage'],
  ['pincer', 'sweep', 'crossfire', 'brood', 'pincer', 'barrage', 'dive', 'lancer', 'crossfire', 'pincer', 'dive'],
  ['dive', 'sweep', 'dive', 'lancer', 'crossfire', 'pincer', 'dive', 'stalker', 'sweep', 'dive', 'barrage'],
  ['barrage', 'dive', 'crossfire', 'brood', 'pincer', 'barrage', 'sweep', 'lancer', 'barrage', 'pincer', 'dive'],
  ['sweep', 'barrage', 'patrol', 'stalker', 'pincer', 'crossfire', 'barrage', 'brood', 'sweep', 'dive', 'pincer'],
  ['crossfire', 'pincer', 'barrage', 'lancer', 'sweep', 'barrage', 'crossfire', 'brood', 'pincer', 'barrage', 'dive'],
  ['dive', 'barrage', 'pincer', 'lancer', 'sweep', 'crossfire', 'pincer', 'brood', 'dive', 'barrage', 'pincer'],
  ['pincer', 'sweep', 'barrage', 'stalker', 'crossfire', 'pincer', 'dive', 'lancer', 'sweep', 'pincer', 'crossfire'],
  ['crossfire', 'dive', 'sweep', 'brood', 'pincer', 'barrage', 'dive', 'lancer', 'crossfire', 'sweep', 'barrage'],
]

const CAMPAIGN_CRUISE_SECONDS = [76, 80, 82, 76, 84, 80, 84, 82, 80, 84, 88, 86, 88, 90] as const
const CRUISE_INTERVALS = { patrol: 5.8, pincer: 7.1, dive: 6.3, barrage: 8.4, escort: 10.2, sweep: 6.9, crossfire: 8.1 }
export const CRUISE_BOSS_APPROACH_SECONDS = 7
export const CROSSFIRE_WARNING_SECONDS = 1.15
export const CROSSFIRE_LOCK_AGE = 1.9

export function getCampaignCruiseSeconds(stage: number): number | undefined {
  return CAMPAIGN_CRUISE_SECONDS[stage - 2]
}

export function getCruiseEncounter(stage: number, serial: number) {
  const route = ROUTES[Math.max(0, stage - 2) % ROUTES.length]
  const beat = serial % route.length
  const encounter = route[beat]
  const elite = encounter === 'stalker' || encounter === 'brood' || encounter === 'lancer' ? encounter : null
  const maneuver = elite ? 'escort' : encounter as CruiseManeuver | 'patrol'
  let side = serial
  if (maneuver === 'sweep') {
    const cycles = Math.floor(serial / route.length)
    side = route.reduce((count, entry, index) => count + (entry === 'sweep' ? cycles + Number(index < beat) : 0), 0)
  }
  return { maneuver, elite, interval: CRUISE_INTERVALS[maneuver], mirror: (stage + side) % 2 === 0 ? 1 : -1 }
}

export function getCruiseWingSize(stage: number, serial: number, liveEnemies: number, maneuver: CruiseManeuver) {
  const escorted = maneuver === 'escort'
  return Math.min(escorted ? 4 : maneuver === 'crossfire' ? 6 : 8, getRaidWingSize(stage, serial, liveEnemies + (escorted ? 1 : 0)))
}

export function getCruiseOpeningLayout(stage: number) {
  if (stage >= 2) {
    const { maneuver } = getCruiseEncounter(stage, 0)
    if (maneuver === 'pincer') return 'split'
    if (maneuver === 'dive') return 'echelon'
    if (maneuver === 'barrage') return 'line'
    if (maneuver === 'escort') return 'escort'
    if (maneuver === 'sweep') return 'echelon'
    if (maneuver === 'crossfire') return 'split'
  }
  return getRaidStageEncounter(stage).wings[0][0]
}

export function placeCruiseWing(maneuver: CruiseManeuver, slot: number, count: number, mirror: number) {
  const flank = slot % 2 === 0 ? mirror : -mirror
  const rank = Math.floor(slot / 2)
  switch (maneuver) {
    case 'pincer': return { x: 50 + flank * (22 + rank * 5), y: -6 - rank * 4 - (flank === mirror ? 0 : 13) }
    case 'dive': return { x: 50 + mirror * (32 - slot * 8), y: -6 - slot * 3.6 }
    case 'barrage': return { x: 50 + flank * (16 + rank * (count > 6 ? 8 : 9)), y: -7 - rank * 1.6 }
    case 'escort': return { x: 50 + mirror * 12 + flank * (13 + rank * 5), y: -10 - rank * 5 }
    case 'sweep': return { x: 50 + mirror * (30 + (slot % 3) * 6), y: -6 - slot * 4 }
    case 'crossfire': return { x: 50 + flank * (slot === 0 ? 17 : 23 + rank * 7), y: -6 - rank * 2 - (slot === 0 ? 0 : 3) }
  }
}

export function fireCruiseCrossfire(enemy: Enemy, available: number, emit: (shot: Omit<Shot, 'id'>) => void) {
  if (available < 1 || enemy.chargeTargetY < enemy.y + 19) return false
  const angle = Math.atan2(enemy.chargeLane - enemy.x, enemy.chargeTargetY - enemy.y - 2.5)
  emit({ x: enemy.x, y: enemy.y + 2.5, vx: Math.sin(angle) * 43, vy: Math.cos(angle) * 43,
    radius: 1.22, damage: 1, kind: 'needle' })
  return true
}

const MINI_BOSS_PROFILES = {
  lancer: ['drill', 'crossfire', 'rail'],
  stalker: ['knives', 'flank', 'fan'],
  brood: ['launch', 'pods', 'screen'],
} as const satisfies Record<MiniBossKind, readonly MiniBossAttack[]>

const MINI_BOSS_TIMING: Record<MiniBossAttack, { warning: number; recovery: number; shots: number }> = {
  drill: { warning: 1.05, recovery: 1.8, shots: 4 },
  crossfire: { warning: 1.05, recovery: 2, shots: 6 },
  rail: { warning: 1.2, recovery: 2.15, shots: 3 },
  knives: { warning: 1.05, recovery: 1.5, shots: 4 },
  flank: { warning: 1.15, recovery: 1.9, shots: 3 },
  fan: { warning: .9, recovery: 1.7, shots: 6 },
  launch: { warning: 1.2, recovery: 2, shots: 0 },
  pods: { warning: 1, recovery: 1.9, shots: 4 },
  screen: { warning: 1.15, recovery: 2.2, shots: 6 },
}

export function beginCruiseEliteAttack(enemy: Enemy, target: Vec, canLaunch: boolean) {
  const profile = MINI_BOSS_PROFILES[enemy.miniBossKind ?? 'stalker']
  let index = enemy.miniBossAttackIndex ?? 0
  let attack = profile[index % profile.length]
  if (attack === 'launch' && !canLaunch) {
    index++
    attack = profile[index % profile.length]
  }
  enemy.miniBossAttack = attack
  enemy.miniBossAttackIndex = index + 1
  const laneInset = attack === 'crossfire' ? 24 : attack === 'screen' ? 32 : 12
  enemy.chargeLane = Math.max(laneInset, Math.min(100 - laneInset, target.x))
  enemy.chargeTargetY = target.y
  enemy.miniBossAttackOriginX = attack === 'flank'
    ? Math.max(10, Math.min(90, target.x + (enemy.x < target.x ? 28 : -28)))
    : enemy.x
  const { warning, recovery } = MINI_BOSS_TIMING[attack]
  enemy.chargeTimer = warning
  enemy.chargeCooldown = recovery * (enemy.hp <= enemy.maxHp * .38 ? .82 : 1)
}

export function getMiniBossWarningSeconds(attack: MiniBossAttack) {
  return MINI_BOSS_TIMING[attack].warning
}

export function forEachMiniBossLane(attack: 'drill' | 'crossfire' | 'screen', lane: number, visit: (x: number) => void) {
  const offsets = attack === 'drill' ? [0] : attack === 'crossfire' ? [-17, 17] : [-26, -19, -12, 12, 19, 26]
  for (const offset of offsets) visit(lane + offset)
}

export function fireCruiseEliteAttack(enemy: Enemy, available: number, emit: (shot: Omit<Shot, 'id'>) => void) {
  const attack = enemy.miniBossAttack
  if (!attack || attack === 'launch' || available < MINI_BOSS_TIMING[attack].shots) return false
  const y = enemy.y + 3
  const origin = enemy.miniBossAttackOriginX ?? enemy.x
  const aimed = (x: number, spread: number, speed: number, kind: Shot['kind'], radius: number, offsetY = 0) => {
    const angle = Math.atan2(enemy.chargeLane - x, enemy.chargeTargetY - y) + spread
    emit({ x, y: y + offsetY, vx: Math.sin(angle) * speed, vy: Math.cos(angle) * speed, damage: 1, radius, kind })
  }
  if (attack === 'drill') {
    for (let slot = 0; slot < 4; slot++) {
      emit({ x: enemy.chargeLane + (slot - 1.5) * 2.35, y: y - slot * 4.1, vx: 0, vy: 53, damage: 1, radius: 1.25, kind: 'needle' })
    }
  } else if (attack === 'crossfire') {
    forEachMiniBossLane(attack, enemy.chargeLane, lane => {
      for (const offset of [-3.4, 0, 3.4]) {
        emit({ x: lane + offset, y: y - Math.abs(offset), vx: 0, vy: 45, damage: 1, radius: 1.25, kind: 'needle' })
      }
    })
  } else if (attack === 'rail') {
    aimed(origin, 0, 65, 'superShot', 2.1)
    aimed(origin, -.075, 57, 'needle', 1.25, -5)
    aimed(origin, .075, 57, 'needle', 1.25, -5)
  } else if (attack === 'knives') {
    for (const spread of [-.19, -.06, .06, .19]) aimed(origin, spread, 47, 'blade', 1.4)
  } else if (attack === 'flank') {
    for (const spread of [-.1, 0, .1]) aimed(origin, spread, 57, 'blade', 1.4)
  } else if (attack === 'fan') {
    for (const spread of [-.64, -.41, -.21, .21, .41, .64]) aimed(origin, spread, 38, 'blade', 1.4)
  } else if (attack === 'pods') {
    for (const side of [-1, 1]) {
      aimed(origin + side * 7, side * .25, 24, 'orbShot', 2)
      aimed(origin + side * 7, side * .085, 36, 'voidShot', 1.55)
    }
  } else {
    forEachMiniBossLane(attack, enemy.chargeLane, lane => {
      emit({ x: lane, y, vx: 0, vy: Math.abs(lane - enemy.chargeLane) > 20 ? 27 : 32, damage: 1, radius: 1.7, kind: 'orbShot' })
    })
  }
  return true
}

export function cruiseEliteShouldWithdraw(age: number, bossRemaining: number) {
  return age >= 20 || bossRemaining <= 3
}
