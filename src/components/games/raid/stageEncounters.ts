import type { Enemy, MiniBossKind, Shot, Vec } from './types'

export const LEGACY_FIGHTER_COUNT = 8
export const RAID_STAGE_ENEMY_LIMIT = 32
export const RAID_FIGHTER_ASSETS = [
  'assets/aliens/fighter-needle-scout-v1.webp',
  'assets/aliens/fighter-cinder-interceptor-v1.webp',
  'assets/aliens/fighter-violet-gunship-v1.webp',
  'assets/aliens/fighter-crimson-ram-v1.webp',
  'assets/aliens/fighter-jade-sensor-v1.webp',
  'assets/aliens/fighter-auric-artillery-v1.webp',
] as const

export const RAID_FIGHTERS = [
  { color: '#7ce4eb', hull: .81, shield: 0, defense: 'scout', radius: 2.65, speed: 25, cooldown: 1.26, shots: 1, boltSpeed: 38, spread: 0, aim: .82, kind: 'needle' },
  { color: '#f9a15d', hull: 1.02, shield: 0, defense: 'phase', radius: 3.4, speed: 23, cooldown: 1.95, shots: 2, boltSpeed: 34, spread: .20, aim: .73, kind: 'blade' },
  { color: '#c4a4fe', hull: 1.33, shield: .27, defense: 'tank', radius: 3.9, speed: 15, cooldown: 2.35, shots: 2, boltSpeed: 30, spread: .08, aim: .24, kind: 'plasma' },
  { color: '#f8777f', hull: 1.22, shield: 0, defense: 'ram', radius: 4.15, speed: 24, cooldown: 4.0, shots: 0, boltSpeed: 0, spread: 0, aim: 0, kind: 'enemy' },
  { color: '#85eac5', hull: .93, shield: 0, defense: 'cloak', radius: 3.45, speed: 19, cooldown: 2.45, shots: 2, boltSpeed: 29, spread: .29, aim: .68, kind: 'orbShot' },
  { color: '#f9d486', hull: 1.12, shield: .16, defense: 'battery', radius: 3.8, speed: 16, cooldown: 2.95, shots: 3, boltSpeed: 27, spread: .27, aim: .58, kind: 'scatterBoss' },
] as const

type Layout = 'chevron' | 'line' | 'echelon' | 'split' | 'escort' | 'weave'
const SCOUT = 0, INTERCEPTOR = 1, GUNSHIP = 2, RAM = 3, SENSOR = 4, ARTILLERY = 5
type FighterId = typeof SCOUT | typeof INTERCEPTOR | typeof GUNSHIP | typeof RAM | typeof SENSOR | typeof ARTILLERY
type Formation = readonly [Layout, FighterId, FighterId, ...FighterId[]]
type StageEncounter = {
  wings: readonly [Formation, Formation, Formation]
  interval: number
  legacy: number
}

/** Ship IDs index RAID_FIGHTERS. Each stage has its own three-wave rotation and reserve. */
const STAGE_ENCOUNTERS: readonly StageEncounter[] = [
  { wings: [['chevron', SCOUT, SCOUT, SCOUT, SCOUT, SCOUT], ['echelon', SCOUT, SCOUT, SCOUT, SCOUT], ['line', SCOUT, SCOUT, SCOUT, SCOUT, SCOUT]], interval: 5.1, legacy: 0 },
  { wings: [['split', SCOUT, INTERCEPTOR, INTERCEPTOR, SCOUT], ['chevron', SCOUT, INTERCEPTOR, INTERCEPTOR, INTERCEPTOR, SCOUT], ['echelon', INTERCEPTOR, SCOUT, INTERCEPTOR, SCOUT, INTERCEPTOR]], interval: 4.7, legacy: 2 },
  { wings: [['echelon', INTERCEPTOR, GUNSHIP, SCOUT, GUNSHIP, INTERCEPTOR], ['escort', SCOUT, GUNSHIP, SCOUT, SCOUT, GUNSHIP, SCOUT], ['line', GUNSHIP, SCOUT, INTERCEPTOR, SCOUT, GUNSHIP]], interval: 4.8, legacy: 3 },
  { wings: [['line', SCOUT, RAM, INTERCEPTOR, RAM, SCOUT], ['chevron', INTERCEPTOR, INTERCEPTOR, RAM, INTERCEPTOR, INTERCEPTOR], ['weave', RAM, SCOUT, INTERCEPTOR, INTERCEPTOR, SCOUT, RAM]], interval: 4.6, legacy: 4 },
  { wings: [['escort', SCOUT, SENSOR, SCOUT, INTERCEPTOR, SENSOR, INTERCEPTOR], ['split', SENSOR, GUNSHIP, GUNSHIP, SENSOR], ['weave', SENSOR, SCOUT, GUNSHIP, GUNSHIP, SCOUT, SENSOR]], interval: 4.8, legacy: 2 },
  { wings: [['line', INTERCEPTOR, ARTILLERY, GUNSHIP, ARTILLERY, INTERCEPTOR], ['echelon', GUNSHIP, ARTILLERY, SCOUT, GUNSHIP, ARTILLERY], ['split', INTERCEPTOR, ARTILLERY, RAM, RAM, ARTILLERY, INTERCEPTOR]], interval: 4.7, legacy: 5 },
  { wings: [['chevron', GUNSHIP, INTERCEPTOR, RAM, INTERCEPTOR, GUNSHIP], ['weave', SCOUT, INTERCEPTOR, SENSOR, SENSOR, INTERCEPTOR, SCOUT], ['escort', RAM, ARTILLERY, RAM, SCOUT, GUNSHIP, SCOUT]], interval: 4.4, legacy: 1 },
  { wings: [['weave', SENSOR, SENSOR, SCOUT, SCOUT, SENSOR, SENSOR], ['split', INTERCEPTOR, SENSOR, ARTILLERY, ARTILLERY, SENSOR, INTERCEPTOR], ['line', SENSOR, SCOUT, GUNSHIP, SCOUT, SENSOR]], interval: 4.2, legacy: 6 },
  { wings: [['echelon', INTERCEPTOR, RAM, GUNSHIP, RAM, INTERCEPTOR, SCOUT], ['line', RAM, RAM, INTERCEPTOR, INTERCEPTOR, RAM, RAM], ['chevron', SENSOR, RAM, ARTILLERY, RAM, SENSOR]], interval: 4.5, legacy: 5 },
  { wings: [['split', RAM, ARTILLERY, GUNSHIP, GUNSHIP, ARTILLERY, RAM], ['escort', INTERCEPTOR, ARTILLERY, INTERCEPTOR, RAM, GUNSHIP, RAM], ['echelon', ARTILLERY, GUNSHIP, INTERCEPTOR, SENSOR, RAM, ARTILLERY]], interval: 4.8, legacy: 3 },
  { wings: [['escort', INTERCEPTOR, GUNSHIP, INTERCEPTOR, SENSOR, ARTILLERY, SENSOR], ['weave', GUNSHIP, SCOUT, RAM, RAM, SCOUT, GUNSHIP], ['chevron', ARTILLERY, GUNSHIP, SENSOR, GUNSHIP, ARTILLERY]], interval: 4.5, legacy: 7 },
  { wings: [['line', GUNSHIP, ARTILLERY, ARTILLERY, GUNSHIP, ARTILLERY, ARTILLERY, GUNSHIP], ['split', GUNSHIP, ARTILLERY, SENSOR, SENSOR, ARTILLERY, GUNSHIP], ['echelon', SENSOR, GUNSHIP, SCOUT, ARTILLERY, GUNSHIP, SENSOR]], interval: 4.6, legacy: 7 },
  { wings: [['chevron', INTERCEPTOR, GUNSHIP, ARTILLERY, RAM, ARTILLERY, GUNSHIP, INTERCEPTOR], ['escort', RAM, GUNSHIP, RAM, INTERCEPTOR, ARTILLERY, INTERCEPTOR], ['split', SENSOR, RAM, INTERCEPTOR, INTERCEPTOR, RAM, SENSOR]], interval: 4.3, legacy: 6 },
  { wings: [['weave', SENSOR, ARTILLERY, INTERCEPTOR, RAM, RAM, INTERCEPTOR, ARTILLERY, SENSOR], ['echelon', ARTILLERY, SENSOR, RAM, GUNSHIP, INTERCEPTOR, SCOUT], ['line', INTERCEPTOR, SENSOR, ARTILLERY, GUNSHIP, ARTILLERY, SENSOR, INTERCEPTOR]], interval: 4.25, legacy: 7 },
  { wings: [['chevron', GUNSHIP, SENSOR, ARTILLERY, RAM, ARTILLERY, SENSOR, GUNSHIP], ['split', RAM, GUNSHIP, ARTILLERY, INTERCEPTOR, INTERCEPTOR, ARTILLERY, GUNSHIP, RAM], ['escort', SENSOR, ARTILLERY, SENSOR, RAM, GUNSHIP, RAM, INTERCEPTOR, INTERCEPTOR]], interval: 4.1, legacy: 7 },
]

export function getRaidStageEncounter(stage: number) {
  return STAGE_ENCOUNTERS[Math.max(0, Math.floor(stage) - 1) % STAGE_ENCOUNTERS.length] ?? STAGE_ENCOUNTERS[0]
}

export function getRaidFighter(variant: number): (typeof RAID_FIGHTERS)[number] | undefined {
  return RAID_FIGHTERS[variant - LEGACY_FIGHTER_COUNT]
}

function getRaidBaseMobHp(wave: number, power: number) {
  return 2 + Math.floor(wave / 2) + Math.floor(power / 4)
}

export function getRaidScoutHp(wave: number, power: number, difficulty: number) {
  return Math.max(1, Math.round(getRaidBaseMobHp(wave, power) * .77 * difficulty))
}

export function getRaidCruiseHullHp(stage: number, wave: number, power: number, kind: MiniBossKind = 'stalker') {
  const base = getRaidBaseMobHp(wave, power)
  const multiplier = kind === 'brood' ? 12 : kind === 'lancer' ? 9.2 : 10.4
  return 38 + base * multiplier + Math.max(0, stage - 1) * 11.5 + wave * 3.4 + power * 4.2
}

export const RAID_MINI_BOSS_HP_SCALE = 2.15
export const RAID_ELITE_FIGHTER_SIZE = 1.36

export function getRaidFighterDurability(variant: number, base: number, difficulty: number, elite = false) {
  const fighter = getRaidFighter(variant)
  const scaledHull = base * difficulty * (elite ? 2.3 : 1)
  return { hp: Math.max(1, Math.round(scaledHull * (fighter?.hull ?? 1))),
    shield: Math.ceil(scaledHull * (fighter?.shield ?? 0)) }
}

const LEGACY_GUN = { cooldown: 2.1, shots: 1, boltSpeed: 29, spread: 0, aim: 1, kind: 'enemy' } as const
const FIGHTER_GAPS = [53, 50, 56, 51, 54, 59] as const
const RAM_WARNING = .68
const RAM_LUNGE_END = 1.56
const RAM_RECOVERY_END = 3.15
const WORLD_DEPTH = 100

const PHASE_WINDUP = .31
const PHASE_END = .65
const PHASE_RETURN = 1.6
const CLOAK_SCAN = .28
const CLOAK_END = 1.26
const CLOAK_RETURN = 1.56
const cloakOpacity = .19

export function getRaidFighterDefenseTime(enemy: Enemy) {
  return (enemy.fighterDefenseAge ?? 0) - .84 - (enemy.trainSlot % 8) * .12
}

export function advanceRaidFighterDefense(enemy: Enemy, target: Vec, dt: number) {
  if (enemy.fighterShieldFlash) enemy.fighterShieldFlash = Math.max(0, enemy.fighterShieldFlash - dt)
  const entryDepth = Math.max(2, Math.min(8, target.y - 11))
  if (enemy.cruiseManeuver === 'crossfire' || (enemy.fighterDefenseAge === undefined && enemy.y < entryDepth)) return
  const role = getRaidFighter(enemy.variant)?.defense
  if (role !== 'phase' && role !== 'cloak') return
  enemy.fighterDefenseAge = (enemy.fighterDefenseAge ?? 0) + dt
  if (getRaidFighterDefenseTime(enemy) >= (role === 'phase' ? 5.6 : 7.1)) {
    enemy.fighterDefenseAge = 0
    enemy.fighterPhaseSide = undefined
  }
  const time = getRaidFighterDefenseTime(enemy)
  if (role === 'phase' && enemy.fighterPhaseSide === undefined && time >= 0) {
    enemy.fighterPhaseSide = enemy.x < 17 ? 1 : enemy.x > 83 ? -1 : enemy.x < target.x ? -1 : 1
  }
  if (role === 'phase' ? isRaidFighterPhased(enemy) : time >= 0 && time < CLOAK_RETURN) enemy.tacticHoldFire = true
}

export function isRaidFighterPhased(enemy: Enemy) {
  if (!enemy.fighterPhaseSide) return false
  const time = getRaidFighterDefenseTime(enemy)
  return time >= PHASE_WINDUP && time < PHASE_END
}

export function getRaidFighterPhaseShift(enemy: Enemy) {
  if (!enemy.fighterPhaseSide) return 0
  const time = getRaidFighterDefenseTime(enemy)
  if (time <= PHASE_WINDUP || time >= PHASE_RETURN) return 0
  const extent = time < PHASE_END ? (time - PHASE_WINDUP) / (PHASE_END - PHASE_WINDUP)
    : (PHASE_RETURN - time) / (PHASE_RETURN - PHASE_END)
  return enemy.fighterPhaseSide * 22 * extent * extent * (3 - 2 * extent)
}

export function getRaidFighterOpacity(enemy: Enemy, reducedMotion = false) {
  if (isRaidFighterPhased(enemy)) return reducedMotion ? .75 : .5
  if (enemy.fighterDefenseAge === undefined || getRaidFighter(enemy.variant)?.defense !== 'cloak') return 1
  const time = getRaidFighterDefenseTime(enemy)
  if (time < 0 || time >= CLOAK_RETURN) return 1
  const fade = time < CLOAK_SCAN ? time / CLOAK_SCAN : time < CLOAK_END ? 1 : (CLOAK_RETURN - time) / (CLOAK_RETURN - CLOAK_END)
  return Math.max((enemy.hitFlash ?? 0) > 0 ? .62 : 0, 1 - fade * (1 - (reducedMotion ? .4 : cloakOpacity)))
}

export function absorbRaidFighterShield(enemy: Enemy, damage: number) {
  if (!enemy.fighterShield) return damage
  const absorbed = Math.min(enemy.fighterShield, damage)
  enemy.fighterShield -= absorbed
  enemy.fighterShieldFlash = enemy.fighterShield > 0 ? .18 : .34
  return damage - absorbed
}

export const RAID_FIGHTER_DEBUT_STAGES = RAID_FIGHTERS.map((_, id) =>
  STAGE_ENCOUNTERS.findIndex(stage => stage.wings.some(wing => wing.includes(id as FighterId))) + 1)

export function getRaidWingSlot(stage: number, serial: number, slot: number) {
  const wing = getRaidStageEncounter(stage).wings[serial % 3]
  const layout = wing[0]
  const count = wing.length - 1
  const mirror = (serial + stage) % 2 === 0 ? 1 : -1
  const rank = slot - (count - 1) / 2
  const half = Math.ceil(count / 2)
  const flank = slot < half ? -1 : 1
  const flankRank = slot % half
  let x = 50 + rank * (layout === 'line' ? 13 : 11.4)
  let y = -6
  if (layout === 'chevron') y -= Math.abs(rank) * 4.2
  else if (layout === 'echelon') y -= slot * 3.8
  else if (layout === 'split') { x = 50 + flank * (19 + flankRank * 7); y -= flankRank * 3.4 }
  else if (layout === 'escort') { x = 50 + (slot % 3 - 1) * 14; y -= Math.floor(slot / 3) * 12 + (slot % 3 === 1 ? 3 : 0) }
  else if (layout === 'weave') { x = 50 + flank * (17 + flankRank * 7.5); y -= (flankRank + (flank === 1 ? .5 : 0)) * 4.5 }
  return {
    variant: LEGACY_FIGHTER_COUNT + (wing[slot + 1] as number),
    x: 50 + (x - 50) * mirror,
    y,
    motion: layout === 'weave' ? 2 : layout === 'split' ? 1 : 0,
    speed: 16 + Math.min(stage, 15) * .27,
    phase: serial * .88 + stage * .42,
  }
}

export function getRaidWingSize(stage: number, serial: number, liveEnemies: number) {
  return Math.min(getRaidStageEncounter(stage).wings[serial % 3].length - 1, Math.max(0, RAID_STAGE_ENEMY_LIMIT - liveEnemies))
}

export function getRaidReserveVariant(stage: number, serial: number) {
  const profile = getRaidStageEncounter(stage)
  const wing = profile.wings[serial % 3]
  return serial % 4 === 3 ? profile.legacy : LEGACY_FIGHTER_COUNT + (wing[1 + serial % (wing.length - 1)] as number)
}

export function getRaidFighterPathX(enemy: Enemy, target?: Vec) {
  const motion = enemy.formationMotion
  const age = enemy.formationAge ?? 0
  const role = enemy.variant - LEGACY_FIGHTER_COUNT
  const side = enemy.originX < 50 ? -1 : 1
  const isAgile = role === INTERCEPTOR || role === SENSOR
  const roleWeave = isAgile ? Math.sin(age * 2.1 + enemy.phase + enemy.trainSlot * .55) : 0
  // The wing approaches together, then individual pilots break formation.
  const release = Math.min(1, Math.max(0, (enemy.y - 16) / 22))
  const offset = roleWeave * release * 6
  let base: number
  if (motion === 0) base = enemy.originX + Math.sin(age * 1.25 + enemy.phase) * 5 + offset
  else if (motion === 1) base = enemy.originX - side * (1 - Math.cos(age * .92)) * 4 + offset
  else if (motion === 2) base = enemy.originX - side * Math.sin(age * 1.18) * 9 + offset
  else if (isAgile) base = enemy.originX + roleWeave * 13
  else base = enemy.originX + Math.sin(age * 1.1 + enemy.phase) * (role === RAM ? 3 : 6)

  // Ram ships lean into the pilot's lane; interceptors make a smaller pursuit.
  // Artillery and heavy gunships hold steadier lanes; sensors sweep wider.
  const aimX = enemy.fighterAimX ?? target?.x
  const targetDelta = aimX !== undefined && Number.isFinite(aimX) ? Math.max(-24, Math.min(24, aimX - enemy.originX)) : 0
  const pursuit = role === RAM ? targetDelta * .28 : role === INTERCEPTOR ? targetDelta * .14 : 0
  const personality = role === SENSOR ? Math.sin(age * 1.35 + enemy.phase) * 2 : role === SCOUT ? Math.sin(age * 2.7 + enemy.phase) * 1.1 : 0
  const heavyScale = role === GUNSHIP || role === ARTILLERY ? .75 : 1
  return Math.max(4, Math.min(96, enemy.originX + (base - enemy.originX) * heavyScale + (pursuit + personality) * release))
}

export function isRaidScout(enemy: Enemy) {
  return !enemy.isBoss && !enemy.isMiniBoss && !enemy.eliteFighter && enemy.variant === LEGACY_FIGHTER_COUNT + SCOUT
}

function isRaidFighterOnscreen(enemy: Enemy) {
  return enemy.y >= 2 && enemy.y <= WORLD_DEPTH
}

/** Overlapping wings share the field; sustained gunfire slows as more ships arrive. */
export function getRaidFighterVolleyScale(enemies: readonly Enemy[]) {
  let gunners = 0
  for (const enemy of enemies) {
    if (enemy.hp <= 0 || enemy.isBoss || enemy.isMiniBoss || enemy.cruiseManeuver === 'crossfire'
      || !isRaidFighterOnscreen(enemy) || isRaidScout(enemy) || getRaidFighter(enemy.variant)?.shots === 0) continue
    gunners++
  }
  return 1 + Math.min(.48, Math.max(0, gunners - 4) * .08)
}

function canRaidFighterFire(enemy: Enemy, target: Vec) {
  const dx = target.x - enemy.x
  const dy = target.y - enemy.y
  return (isRaidScout(enemy) || dy >= 6) && dx * dx + dy * dy >= 9.5 ** 2
}

function getRaidFighterFireAngle(enemy: Enemy, target: Vec, aim: number) {
  const dy = target.y - enemy.y
  return isRaidScout(enemy) ? Math.atan2(target.x - enemy.x, dy)
    : Math.atan2((target.x - enemy.x) * aim, Math.max(13, dy))
}

export function fireRaidFighter(enemy: Enemy, target: Vec, available: number, emit: (shot: Omit<Shot, 'id'>) => void) {
  const fighter = getRaidFighter(enemy.variant) ?? LEGACY_GUN
  if (!fighter.shots || available < fighter.shots || !isRaidFighterOnscreen(enemy) || !canRaidFighterFire(enemy, target)) return false
  const aim = getRaidFighterFireAngle(enemy, target, fighter.aim)
  const scout = isRaidScout(enemy)
  for (let i = 0; i < fighter.shots; i++) {
    const side = i - (fighter.shots - 1) / 2
    const angle = aim + side * fighter.spread
    emit({ x: enemy.x + (scout ? Math.sin(angle) * 2.5 : side * 5),
      y: enemy.y + (scout ? Math.cos(angle) * 2.5 : 2.5), vx: Math.sin(angle) * fighter.boltSpeed,
      vy: Math.cos(angle) * fighter.boltSpeed, radius: 1.22, damage: 1, kind: fighter.kind })
  }
  return true
}

export const FIGHTER_FIRE_WARNING = .32
export const FIGHTER_FIRE_FLASH = .13

export function advanceRaidFighterFire(enemy: Enemy, target: Vec, dt: number, cadence: number, available: number,
  emit: (shot: Omit<Shot, 'id'>) => void) {
  const fighter = getRaidFighter(enemy.variant) ?? LEGACY_GUN
  if (!fighter.shots) return
  if (enemy.tacticHoldFire || !isRaidFighterOnscreen(enemy)) {
    enemy.fireCooldown = Math.max(FIGHTER_FIRE_WARNING, enemy.fireCooldown)
    return
  }
  const scout = isRaidScout(enemy)
  // Start the tail-gun warning before the scout clears the safe firing distance.
  if (scout) {
    const rear = target.y < enemy.y - 2
    if (rear && !enemy.fighterRearGun) enemy.fireCooldown = Math.min(FIGHTER_FIRE_WARNING, enemy.fireCooldown)
    enemy.fighterRearGun = rear
    if (!enemy.fighterShotFlash) enemy.fighterShotAngle = getRaidFighterFireAngle(enemy, target, fighter.aim)
  }
  const canFire = canRaidFighterFire(enemy, target)
  if (!canFire && !enemy.fighterRearGun) {
    enemy.fireCooldown = Math.max(FIGHTER_FIRE_WARNING, enemy.fireCooldown)
    return
  }
  enemy.fireCooldown = Math.max(canFire ? 0 : .025, enemy.fireCooldown - dt)
  if (enemy.fireCooldown > 0) return
  if (fireRaidFighter(enemy, target, available, emit)) {
    if (scout) enemy.fighterShotAngle = getRaidFighterFireAngle(enemy, target, fighter.aim)
    enemy.fireCooldown = fighter.cooldown * cadence
    enemy.fighterShotFlash = FIGHTER_FIRE_FLASH
  } else {
    enemy.fireCooldown = FIGHTER_FIRE_WARNING
  }
}

/** These frames are shared by the Pixi foreground and Canvas fallback. */
export function getRaidFighterCharge(enemy: Enemy) {
  if (enemy.cruiseManeuver === 'crossfire') return enemy.chargeTimer > 0 ? Math.max(.25, 1 - enemy.chargeTimer) : 0
  if (enemy.fighterRamAge !== undefined) return enemy.fighterRamAge < RAM_WARNING ? .25 + .75 * enemy.fighterRamAge / RAM_WARNING : 0
  if (!isRaidFighterOnscreen(enemy) || enemy.fireCooldown <= 0 || enemy.fireCooldown >= FIGHTER_FIRE_WARNING
    || !(getRaidFighter(enemy.variant) ?? LEGACY_GUN).shots) return 0
  return 1 - enemy.fireCooldown / FIGHTER_FIRE_WARNING
}

/** Lock the interceptor's attack lane for its initial approach. */
export function commitRaidFighterManeuver(enemy: Enemy, target: Vec) {
  if (enemy.variant === LEGACY_FIGHTER_COUNT + INTERCEPTOR && enemy.y >= 24 && enemy.fighterAimX === undefined) {
    enemy.fighterAimX = Math.max(8, Math.min(92, target.x))
  }
}

export function advanceRaidFighterY(enemy: Enemy, target: Vec, dt: number) {
  const speed = enemy.vy * (enemy.tacticSpeed ?? 1)
  if (isRaidScout(enemy)) return enemy.y + speed * dt

  const role = enemy.variant - LEGACY_FIGHTER_COUNT
  // Hold the same depth as cruise elites and back away if the pilot advances.
  const lane = Math.min(40, Math.max(18, target.y - (FIGHTER_GAPS[role] ?? 54)
    + (enemy.trainSlot % 3 - 1) * 4 + Math.sin((enemy.formationAge ?? 0) * 1.4 + enemy.phase) * 2.6))
  const frontLimit = Math.max(3, target.y - 22)
  let destination = Math.min(lane, frontLimit)
  let forwardSpeed = speed
  let response = 2.75
  if (role === RAM && enemy.cruiseManeuver !== 'crossfire') {
    if (enemy.fighterRamAge === undefined && enemy.y >= destination - 4 && enemy.y >= 2) {
      enemy.fighterRamAge = 0
      enemy.fighterAimX = Math.max(7, Math.min(93, target.x))
      enemy.fighterRamTargetY = target.y - 4
    }
    if (enemy.fighterRamAge !== undefined) {
      enemy.fighterRamAge += dt
      if (enemy.fighterRamAge < RAM_WARNING) {
        destination = Math.min(enemy.y, frontLimit)
      } else if (enemy.fighterRamAge < RAM_LUNGE_END) {
        destination = Math.max(3, Math.min(enemy.fighterRamTargetY ?? destination, target.y - 4))
        forwardSpeed = 78
        response = 10
      } else if (enemy.fighterRamAge >= RAM_RECOVERY_END) {
        enemy.fighterRamAge = undefined
        enemy.fighterRamTargetY = undefined
        enemy.fighterAimX = undefined
      }
    }
  }
  const closingSpeed = Math.max(-enemy.vy * 1.85, Math.min(forwardSpeed, (destination - enemy.y) * response))
  return enemy.y + closingSpeed * dt
}

export function getRaidRamAttackLane(enemy: Enemy) {
  return enemy.fighterRamAge !== undefined && enemy.fighterRamAge < RAM_LUNGE_END ? enemy.fighterAimX : undefined
}
