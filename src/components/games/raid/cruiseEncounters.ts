import { getRaidStageEncounter, getRaidWingSize } from './stageEncounters'
import type { Enemy, MiniBossKind, Shot, Vec } from './types'

export type CruiseManeuver = 'pincer' | 'dive' | 'barrage' | 'escort'
type CruiseEncounter = Exclude<CruiseManeuver, 'escort'> | 'patrol' | MiniBossKind

// Stage 1 uses the carrier tutorial's authored encounters. Each later sector
// changes the order of maneuvers, elite types, and recovery gaps.
const ROUTES: readonly (readonly CruiseEncounter[])[] = [
  ['patrol', 'pincer', 'dive', 'lancer', 'patrol', 'pincer', 'dive', 'stalker', 'pincer', 'patrol', 'dive'],
  ['barrage', 'patrol', 'pincer', 'stalker', 'barrage', 'dive', 'pincer', 'lancer', 'patrol', 'barrage', 'pincer'],
  ['dive', 'pincer', 'patrol', 'lancer', 'dive', 'barrage', 'pincer', 'stalker', 'dive', 'pincer', 'patrol'],
  ['pincer', 'patrol', 'barrage', 'brood', 'pincer', 'dive', 'barrage', 'stalker', 'pincer', 'barrage', 'patrol'],
  ['barrage', 'pincer', 'dive', 'lancer', 'barrage', 'patrol', 'barrage', 'brood', 'pincer', 'dive', 'barrage'],
  ['dive', 'barrage', 'pincer', 'stalker', 'dive', 'pincer', 'barrage', 'brood', 'dive', 'pincer', 'barrage'],
  ['pincer', 'dive', 'patrol', 'brood', 'pincer', 'barrage', 'dive', 'lancer', 'barrage', 'pincer', 'dive'],
  ['dive', 'pincer', 'dive', 'lancer', 'barrage', 'pincer', 'dive', 'stalker', 'pincer', 'dive', 'barrage'],
  ['barrage', 'dive', 'barrage', 'brood', 'pincer', 'barrage', 'dive', 'lancer', 'barrage', 'pincer', 'dive'],
  ['pincer', 'barrage', 'patrol', 'stalker', 'pincer', 'dive', 'barrage', 'brood', 'barrage', 'dive', 'pincer'],
  ['barrage', 'pincer', 'barrage', 'lancer', 'dive', 'barrage', 'barrage', 'brood', 'pincer', 'barrage', 'dive'],
  ['dive', 'barrage', 'pincer', 'lancer', 'dive', 'barrage', 'pincer', 'brood', 'dive', 'barrage', 'pincer'],
  ['pincer', 'dive', 'barrage', 'stalker', 'barrage', 'pincer', 'dive', 'lancer', 'dive', 'pincer', 'barrage'],
  ['barrage', 'dive', 'pincer', 'brood', 'pincer', 'barrage', 'dive', 'lancer', 'pincer', 'dive', 'barrage'],
]

export const CRUISE_BOSS_APPROACH_SECONDS = 7
export const CRUISE_ELITE_WARNING_SECONDS = 1.05

export function getCruiseEncounter(stage: number, serial: number) {
  const route = ROUTES[Math.max(0, stage - 2) % ROUTES.length]
  const encounter = route[serial % route.length]
  const elite = encounter === 'stalker' || encounter === 'brood' || encounter === 'lancer' ? encounter : null
  const maneuver = elite ? 'escort' : encounter as CruiseManeuver | 'patrol'
  const interval = elite ? 10.2 : maneuver === 'patrol' ? 5.8 : maneuver === 'pincer' ? 7.1 : maneuver === 'dive' ? 6.3 : 8.4
  return { maneuver, elite, interval, mirror: (stage + serial) % 2 === 0 ? 1 : -1 }
}

export function getCruiseWingSize(stage: number, serial: number, liveEnemies: number, escorted: boolean) {
  return Math.min(escorted ? 4 : 8, getRaidWingSize(stage, serial, liveEnemies + (escorted ? 1 : 0)))
}

export function getCruiseOpeningLayout(stage: number) {
  if (stage >= 2) {
    const { maneuver } = getCruiseEncounter(stage, 0)
    if (maneuver === 'pincer') return 'split'
    if (maneuver === 'dive') return 'echelon'
    if (maneuver === 'barrage') return 'line'
    if (maneuver === 'escort') return 'escort'
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
  }
}

export function beginCruiseEliteAttack(enemy: Enemy, target: Vec) {
  enemy.chargeLane = Math.max(12, Math.min(88, target.x))
  enemy.chargeTargetY = target.y
  enemy.chargeTimer = CRUISE_ELITE_WARNING_SECONDS
  enemy.chargeCooldown = enemy.miniBossKind === 'stalker' ? 3.6 : 4.8
}

export function fireCruiseLancer(enemy: Enemy, available: number, emit: (shot: Omit<Shot, 'id'>) => void) {
  if (available < 4) return false
  // The warning shows a committed lane. The salvo crosses the screen there,
  // giving the pilot room to dodge to either side.
  for (let slot = 0; slot < 4; slot++) {
    emit({ x: enemy.chargeLane + (slot - 1.5) * 2.35, y: enemy.y + 3 - slot * 4.1,
      vx: 0, vy: 53, damage: 1, radius: 1.25, kind: 'needle' })
  }
  return true
}

export function fireCruiseStalker(enemy: Enemy, available: number, emit: (shot: Omit<Shot, 'id'>) => void) {
  if (available < 4) return false
  const aim = Math.atan2(enemy.chargeLane - enemy.x, Math.max(16, enemy.chargeTargetY - enemy.y))
  for (const spread of [-.19, -.06, .06, .19]) {
    const angle = aim + spread
    emit({ x: enemy.x, y: enemy.y + 3, vx: Math.sin(angle) * 47, vy: Math.cos(angle) * 47,
      damage: 1, radius: 1.4, kind: 'blade' })
  }
  return true
}

export function cruiseEliteShouldWithdraw(age: number, bossRemaining: number) {
  return age >= 20 || bossRemaining <= 3
}
