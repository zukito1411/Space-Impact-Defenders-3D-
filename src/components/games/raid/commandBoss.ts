import { getGenericBossArt } from './bossCatalog'
import { PLAYER_MAX_RANK } from './constants'
import type { Enemy, RaidDifficulty, Shot, Vec } from './types'

export type CommandPattern = 'fan' | 'snipe' | 'iris' | 'reverseIris' | 'pincer' | 'sweep' | 'curtain' | 'hydra'
  | 'beam' | 'twinBeam' | 'fork' | 'shears' | 'broadside' | 'salvo' | 'ladder' | 'spiral'
export type CommandManeuver = 'cloak' | 'phaseShift'

export type CommandBossProfile = {
  stage: number; sequence: readonly CommandPattern[]; warning: number; recovery: number
  speed: number; hp: number; movement: 'broadside' | 'orbit' | 'flank' | 'sweep' | 'fortress' | 'hunt'
  amplitude: number; bursts: number
  signature: { rounds: number; interval: number }
  maneuver?: CommandManeuver
}

/** The first pattern is the signature attack. Every other pattern also runs in each HP phase. */
export const COMMAND_BOSS_PROFILES: readonly CommandBossProfile[] = [
  { stage: 1, sequence: ['fan', 'snipe'], warning: 1.02, recovery: 1.05, speed: 38, hp: 1.08, movement: 'broadside', amplitude: 22, bursts: 1, signature: { rounds: 2, interval: .42 } },
  { stage: 2, sequence: ['iris', 'snipe', 'reverseIris'], warning: 1.04, recovery: 1.02, speed: 37, hp: 1.08, movement: 'orbit', amplitude: 22, bursts: 1, signature: { rounds: 3, interval: .38 } },
  { stage: 3, sequence: ['shears', 'snipe', 'pincer'], warning: 1, recovery: 1.02, speed: 42, hp: 1.1, movement: 'flank', amplitude: 29, bursts: 1, signature: { rounds: 4, interval: .36 } },
  { stage: 4, sequence: ['sweep', 'snipe', 'fan'], warning: 1, recovery: 1, speed: 42, hp: 1.1, movement: 'sweep', amplitude: 29, bursts: 1, signature: { rounds: 4, interval: .39 }, maneuver: 'phaseShift' },
  { stage: 6, sequence: ['curtain', 'beam', 'snipe'], warning: 1.1, recovery: 1.08, speed: 43, hp: 1.12, movement: 'fortress', amplitude: 17, bursts: 1, signature: { rounds: 4, interval: .46 } },
  { stage: 7, sequence: ['broadside', 'curtain', 'snipe', 'fan'], warning: .98, recovery: .94, speed: 44, hp: 1.12, movement: 'broadside', amplitude: 27, bursts: 1, signature: { rounds: 5, interval: .34 } },
  { stage: 8, sequence: ['reverseIris', 'curtain', 'iris'], warning: 1.02, recovery: .96, speed: 44, hp: 1.14, movement: 'orbit', amplitude: 24, bursts: 2, signature: { rounds: 4, interval: .37 } },
  { stage: 9, sequence: ['salvo', 'sweep', 'snipe', 'pincer'], warning: .98, recovery: .92, speed: 46, hp: 1.14, movement: 'flank', amplitude: 30, bursts: 2, signature: { rounds: 5, interval: .31 }, maneuver: 'cloak' },
  { stage: 11, sequence: ['hydra', 'pincer', 'shears', 'snipe'], warning: 1.02, recovery: .94, speed: 47, hp: 1.16, movement: 'hunt', amplitude: 25, bursts: 2, signature: { rounds: 5, interval: .32 } },
  { stage: 12, sequence: ['ladder', 'twinBeam', 'beam', 'curtain'], warning: 1.12, recovery: 1.02, speed: 46, hp: 1.16, movement: 'fortress', amplitude: 20, bursts: 2, signature: { rounds: 5, interval: .42 } },
  { stage: 13, sequence: ['fork', 'curtain', 'broadside', 'snipe'], warning: 1.02, recovery: .94, speed: 49, hp: 1.18, movement: 'broadside', amplitude: 27, bursts: 2, signature: { rounds: 4, interval: .42 }, maneuver: 'cloak' },
  { stage: 14, sequence: ['spiral', 'reverseIris', 'ladder', 'fork'], warning: 1.04, recovery: .98, speed: 48, hp: 1.18, movement: 'orbit', amplitude: 26, bursts: 2, signature: { rounds: 5, interval: .39 }, maneuver: 'phaseShift' },
]
const PROFILES_BY_STAGE = new Map(COMMAND_BOSS_PROFILES.map(profile => [profile.stage, profile]))
const TACTICS: Record<RaidDifficulty, { warning: number; speed: number; recovery: number }> = {
  easy: { warning: 1.2, speed: .88, recovery: 1.14 },
  normal: { warning: 1, speed: 1, recovery: 1 },
  hard: { warning: .94, speed: 1.06, recovery: .93 },
  expert: { warning: .9, speed: 1.1, recovery: .88 },
}
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value))
export const COMMAND_SHOT_LIMIT = 120 // below the co-op packet's 140-shot limit; same on every graphics quality.
export const COMMAND_VOLLEY_LIMIT = 12
export const COMMAND_MAX_SHOT_SPEED = 59
export const COMMAND_MAX_STRAFE_SPEED = 44
export const COMMAND_MAX_PHASE_SPEED = 180
export const COMMAND_MAX_VERTICAL_SPEED = 11
export const getCommandWarningFloor = (beam: boolean) => beam ? .94 : .64
export const COMMAND_WARNING = 1, COMMAND_FIRED = 2, COMMAND_PHASE = 4
export const COMMAND_PHASE_HP = { pressure: .65, critical: .30 } as const
export const commandVolleyPreviewIndex = (pattern?: CommandPattern) => pattern === 'hydra' || pattern === 'broadside' ? -1 : 0
export const isCommandBeam = (pattern?: CommandPattern) => pattern === 'beam' || pattern === 'twinBeam'
export function getCommandBossProfile(enemy: Pick<Enemy, 'isBoss' | 'bossKind' | 'bossArtStage'>) {
  if (!enemy.isBoss) return undefined
  const art = getGenericBossArt(enemy.bossKind ?? 'carrier', enemy.bossArtStage)
  return art ? PROFILES_BY_STAGE.get(art.stage) : undefined
}
/** Freeze at spawn: account for rank without scaling HP with damage dealt mid-fight. Existing difficulty/co-op multipliers remain. */
export function getCommandBossHpScale(kind: Enemy['bossKind'], stage: number, rank = 1, partnerRank?: number, difficulty: RaidDifficulty = 'normal') {
  const art = getGenericBossArt(kind, stage)
  const profile = art && PROFILES_BY_STAGE.get(art.stage)
  if (!profile) return 1
  const pilotRank = clamp(Number.isFinite(rank) ? rank : 1, 1, PLAYER_MAX_RANK)
  const meanRank = partnerRank !== undefined && Number.isFinite(partnerRank)
    ? (pilotRank + clamp(partnerRank, 1, PLAYER_MAX_RANK)) / 2
    : pilotRank
  const levels = meanRank - 1
  const rankPressure = .06 * levels + .002 * levels * levels
  return profile.hp * (1 + rankPressure * (difficulty === 'easy' ? .5 : 1))
}

export type CommandShot = Omit<Shot, 'id'>
/** Fixed reusable recipe storage, shared by warning rendering and authoritative release. */
export function createCommandVolley(): CommandShot[] {
  return Array.from({ length: COMMAND_VOLLEY_LIMIT }, () => ({ x: 0, y: 0, vx: 0, vy: 0, radius: 1.5, damage: 1, kind: 'boss', life: 4.8, maxLife: 4.8 }))
}
export function writeCommandVolley(enemy: Enemy, out: CommandShot[], burstIndex = enemy.bossBurstIndex ?? 0) {
  const pattern = enemy.bossAttackPattern
  if (!pattern) return 0
  const x = enemy.bossAttackX ?? enemy.x, y = enemy.bossAttackY ?? enemy.y
  const aimX = enemy.bossAimX ?? 50, aimY = enemy.bossAimY ?? 80
  const speed = enemy.bossShotSpeed ?? 32, phase = enemy.bossCombatPhase ?? 0
  const serial = enemy.bossAttackSerial ?? 0, side = serial % 2 ? 1 : -1
  const heading = Math.atan2(Math.max(24, aimY - y), aimX - x)
  let count = 0
  const add = (sx: number, sy: number, vx: number, vy: number, kind: Shot['kind'], radius = 1.5, life = 4.8) => {
    if (count >= out.length) return
    const shot = out[count++]
    shot.x = clamp(sx, 5, 95); shot.y = sy; shot.vx = vx; shot.vy = vy
    shot.kind = kind; shot.radius = radius; shot.damage = 1; shot.life = shot.maxLife = life
    shot.angle = undefined; shot.spin = undefined
  }
  const leavesCorridor = pattern === 'fork' || pattern === 'sweep' || pattern === 'shears'
  const aimed = (sx: number, sy: number, angle: number, kind: Shot['kind'], rate = speed, radius = 1.5) => {
    const vx = Math.cos(angle) * Math.min(COMMAND_MAX_SHOT_SPEED, rate)
    const vy = Math.sin(angle) * Math.min(COMMAND_MAX_SHOT_SPEED, rate)
    if (leavesCorridor && vy > 0 && enemy.bossGapX !== undefined) {
      // Reserve a pilot-width corridor through the crossings near the committed altitude.
      const start = clamp(sx, 5, 95) + vx / vy * (aimY - sy - 8)
      const end = clamp(sx, 5, 95) + vx / vy * (aimY - sy + 8)
      if (Math.min(start, end) < enemy.bossGapX + 10 && Math.max(start, end) > enemy.bossGapX - 10) return
    }
    add(sx, sy, vx, vy, kind, radius)
  }
  const fan = (kind: Shot['kind']) => {
    for (let i = -2; i <= 2; i++) aimed(x, y + 6, heading + i * .24 + side * burstIndex * .09, kind, speed, 1.65)
  }
  if (pattern === 'fan' || pattern === 'fork') {
    fan(pattern === 'fork' ? 'superShot' : 'boss')
    if (pattern === 'fork') for (const sign of [-1, 1]) for (let i = 0; i < 2; i++) {
      aimed(x + sign * 11, y + 4, Math.PI / 2 + sign * (.42 + i * .28), 'orbShot', speed * .85)
    }
  } else if (pattern === 'snipe') {
    for (let i = -1; i <= 1; i++) aimed(x, y + 6, heading + i * .12 + side * burstIndex * .085, 'needle', speed + 3, 1.35)
  } else if (pattern === 'iris' || pattern === 'reverseIris' || pattern === 'spiral') {
    const total = pattern === 'spiral' ? 9 : phase >= 1 ? 12 : 10
    const direction = pattern === 'reverseIris' ? -1 : 1
    const rotation = serial * .37 + direction * burstIndex * (pattern === 'spiral' ? .41 : .14)
    // A missing sector preserves a broad dodge route; this is never a solid bullet wall.
    const gapHeading = heading + side * (pattern === 'spiral' ? .22 + Math.min(.17, burstIndex * .055) : .22)
    for (let i = 0; i < total; i++) {
      const angle = i / total * Math.PI * 2 + rotation
      const diff = Math.atan2(Math.sin(angle - gapHeading), Math.cos(angle - gapHeading))
      if (Math.abs(diff) < .55) continue
      aimed(x, y + 3, angle, 'orbShot', speed * .88, 1.4)
    }
  } else if (pattern === 'pincer') {
    for (const sign of [-1, 1]) {
      const sx = x + sign * 12
      const angle = Math.atan2(Math.max(24, aimY - y), aimX - sx)
      aimed(sx, y + 5, angle + sign * (.2 - burstIndex * .045), 'needle', speed + 1, 1.4)
      aimed(x + sign * 6, y + 7, heading - sign * .22 + side * burstIndex * .1, 'blade', speed * .94, 1.7)
    }
  } else if (pattern === 'sweep') {
    const sweep = side * (burstIndex - ((enemy.bossBurstCount ?? 1) - 1) / 2) * .22
    for (let i = -1; i <= 1; i++) aimed(x + i * 9, y + 6, heading + i * .2 + sweep, 'blade', speed, 1.65)
  } else if (pattern === 'shears') {
    for (const sign of [-1, 1]) {
      const launchX = x + sign * 15
      const angle = Math.atan2(Math.max(28, aimY - y), aimX - sign * (14 + burstIndex * 5) - launchX)
      aimed(launchX, y + 5, angle, 'blade', speed, 1.55)
      aimed(launchX, y + 5, angle - sign * .16, 'needle', speed * .9, 1.2)
    }
  } else if (pattern === 'broadside') {
    for (const sign of [-1, 1]) {
      if (burstIndex >= 0 && sign !== side * (burstIndex % 2 ? -1 : 1)) continue
      const launchX = x + sign * 14
      const angle = Math.atan2(Math.max(24, aimY - y), aimX - launchX) - sign * .15
      for (const spread of [-.24, 0, .24]) {
        aimed(launchX, y + 5, angle + spread, 'boss', speed, 1.65)
      }
    }
  } else if (pattern === 'salvo') {
    if (burstIndex % 2 === 0) {
      for (const offset of [-.14, 0, .14]) aimed(x, y + 6, heading + offset + side * burstIndex * .035, 'needle', speed + 5, 1.25)
    } else {
      for (const offset of [-.5, -.27, .27, .5]) aimed(x, y + 6, heading + offset, 'blade', speed * .84, 1.65)
    }
  } else if (pattern === 'ladder') {
    // Alternate the rungs around a single corridor that stays clear across the chain.
    const gap = enemy.bossGapX ?? 50
    for (let lane = 11; lane < 100; lane += 12) {
      const lx = lane + (burstIndex % 2 ? 4 : -4)
      if (Math.abs(lx - gap) < 16) continue
      add(lx, y + 7, 0, speed * .87, 'scatterBoss', 1.45)
    }
  } else if (pattern === 'curtain') {
    const gap = enemy.bossGapX ?? 50, gapRadius = 16
    for (let i = 0; i < 9; i++) {
      const lane = 8 + i * 10.5
      if (Math.abs(lane - gap) < gapRadius) continue
      add(lane, y + 7, 0, speed * .9, 'scatterBoss', 1.45)
    }
  } else if (pattern === 'hydra') {
    // Left, right, then the void head. A negative index previews all three committed lanes.
    const head = burstIndex % 3 === 0 ? -1 : burstIndex % 3 === 1 ? 1 : 0
    for (let i = -1; i <= 1; i++) {
      if (burstIndex >= 0 && i !== head) continue
      const headStep = i < 0 ? 0 : i > 0 ? 1 : 2
      const sx = x + i * 14, target = aimX + i * (6 + headStep * 2)
      aimed(sx, y + 7, Math.atan2(Math.max(24, aimY - y), target - sx), i === 0 ? 'voidShot' : 'orbShot', speed + (i === 0 ? 2 : -1), i === 0 ? 1.9 : 1.5)
    }
  } else if (isCommandBeam(pattern)) {
    const center = clamp(aimX, 26, 74)
    if (pattern === 'twinBeam') for (const sign of [-1, 1]) add(center + sign * 14, y + 6, 0, 0, 'beam', 2.05, .68)
    else add(clamp(aimX, 12, 88), y + 6, 0, 0, 'beam', 2.15, .68)
  }
  // If a sweep would cross the corridor with every barrel, fall back to a
  // single strike in the marked pilot lane. The warning uses this same recipe.
  if (!count && leavesCorridor) add(aimX, y + 7, 0, speed, pattern === 'fork' ? 'superShot' : 'blade')
  return count
}
const releaseScratch = createCommandVolley()
function mixCommandAttack(value: number) {
  const shifted = Math.imul(value ^ (value >>> 16), 0x45d9f3b)
  return (shifted ^ (shifted >>> 16)) >>> 0
}
function beginAttack(enemy: Enemy, profile: CommandBossProfile, targets: readonly Vec[], difficulty: RaidDifficulty, elapsed = 0, guidedOpening = false) {
  const serial = (enemy.bossAttackSerial ?? -1) + 1
  const target = targets[serial % targets.length]
  const hpRatio = enemy.hp / Math.max(1, enemy.maxHp)
  const phase = hpRatio <= COMMAND_PHASE_HP.critical ? 2 : hpRatio <= COMMAND_PHASE_HP.pressure ? 1 : 0
  const changed = phase > (enemy.bossCombatPhase ?? 0)
  const count = profile.sequence.length
  // A different start slot and traversal direction each cycle preserve the hull's whole repertoire.
  const cycle = Math.floor(serial / count)
  const mixed = mixCommandAttack(cycle + profile.stage * 41 + (enemy.id ?? 0) * 13)
  const step = serial % count
  const offset = cycle === 0 ? 0 : mixed % count
  const reverse = Boolean(mixed & 256)
  const index = cycle === 0 ? (reverse && step > 0 ? count - step : step)
    : (offset + (reverse ? count - step : step)) % count
  const firstInterception = guidedOpening && profile.stage === 1 && serial === 0
  const pattern = firstInterception ? 'beam' : profile.sequence[index]
  const tune = TACTICS[difficulty]
  const afterPhaseShift = enemy.bossManeuver === 'phaseShift'
  enemy.bossManeuver = undefined
  enemy.bossManeuverStartAge = undefined
  enemy.bossManeuverFromX = undefined
  enemy.bossManeuverToX = undefined
  if (changed) enemy.bossPhaseStartedAge = enemy.bossEncounterAge
  enemy.bossLastVolleyAge = undefined
  enemy.bossCombatPhase = phase
  enemy.bossAttackSerial = serial
  enemy.bossAttackPattern = pattern
  enemy.bossAttackState = 'warning'
  enemy.bossAimX = clamp(target.x, 8, 92); enemy.bossAimY = clamp(target.y, 48, 94)
  enemy.bossAttackX = enemy.x; enemy.bossAttackY = enemy.y
  const escapeSide = enemy.bossAimX < 34 ? 1 : enemy.bossAimX > 66 ? -1 : serial % 2 ? 1 : -1
  enemy.bossGapX = enemy.bossAimX + escapeSide * 18
  enemy.bossWarningSeconds = Math.max(getCommandWarningFloor(isCommandBeam(pattern)), profile.warning * tune.warning * (1 - phase * .065)
    - (difficulty === 'easy' ? 0 : .14) - (afterPhaseShift ? .16 : 0))
  if (firstInterception) enemy.bossWarningSeconds = Math.max(2.45, enemy.bossWarningSeconds)
  enemy.bossAttackTimer = enemy.bossWarningSeconds - elapsed
  enemy.bossShotSpeed = Math.min(COMMAND_MAX_SHOT_SPEED, (profile.speed + phase * 2.5) * tune.speed)
  enemy.bossBurstIndex = 0
  const followUp = difficulty !== 'easy' && phase === 0 && profile.bursts === 1 &&
    (pattern === 'fan' || pattern === 'snipe' || pattern === 'pincer' || pattern === 'sweep') && mixed % 3 !== 0 ? 1 : 0
  const signature = pattern === profile.sequence[0]
  const rounds = signature ? profile.signature.rounds : profile.bursts + followUp
  enemy.bossBurstCount = isCommandBeam(pattern) ? 1
    : Math.min(signature ? 6 : 3, Math.max(1, rounds + phase - (difficulty === 'easy' && rounds >= 3 ? 1 : 0)))
  enemy.bossBurstInterval = signature
    ? Math.max(.24, profile.signature.interval * (difficulty === 'easy' ? 1.17 : 1) - phase * .025)
    : (difficulty === 'easy' ? .35 : .29) - phase * .018
  enemy.bossRecoverySeconds = Math.max(.48, profile.recovery * tune.recovery * (1 - phase * .11) - (difficulty === 'easy' ? .12 : .23))
  if (firstInterception) enemy.bossRecoverySeconds = 2.85
  return COMMAND_WARNING | (changed ? COMMAND_PHASE : 0)
}
export const COMMAND_CLOAK_SCAN_SECONDS = .44
export const COMMAND_CLOAK_REVEAL_AT = COMMAND_CLOAK_SCAN_SECONDS + 1.18
export const COMMAND_CLOAK_SECONDS = COMMAND_CLOAK_REVEAL_AT + .34
export const COMMAND_PHASE_SHIFT_SECONDS = .52
const COMMAND_PHASE_RECOVERY_SECONDS = .66

export function getCommandManeuverAge(enemy: Enemy) {
  return (enemy.bossEncounterAge ?? 0) - (enemy.bossManeuverStartAge ?? 0)
}

function smoothStep(progress: number) {
  const t = clamp(progress, 0, 1)
  return t * t * (3 - 2 * t)
}

export function sampleCommandBossCloak(enemy: Enemy) {
  if (enemy.hp <= 0 || enemy.bossManeuver !== 'cloak' || enemy.bossAttackState !== 'recovery') return 0
  const age = getCommandManeuverAge(enemy)
  return smoothStep(Math.min((age - .1) / (COMMAND_CLOAK_SCAN_SECONDS - .1),
    (COMMAND_CLOAK_SECONDS - age) / (COMMAND_CLOAK_SECONDS - COMMAND_CLOAK_REVEAL_AT)))
}

export function sampleCommandPhaseShiftX(enemy: Enemy, age: number) {
  const from = enemy.bossManeuverFromX ?? enemy.x
  const to = enemy.bossManeuverToX ?? enemy.x
  return from + (to - from) * smoothStep(age / COMMAND_PHASE_SHIFT_SECONDS)
}

function beginRecovery(enemy: Enemy, profile: CommandBossProfile, overshoot: number) {
  enemy.bossAttackState = 'recovery'
  const recovery = enemy.bossRecoverySeconds ?? 1
  const serial = enemy.bossAttackSerial ?? 0
  if (!profile.maneuver || !enemy.bossCombatPhase || serial - (enemy.bossLastManeuverSerial ?? -3) < 3) {
    enemy.bossAttackTimer = recovery - overshoot
    return
  }
  const lane = enemy.bossAimX ?? 50
  enemy.bossManeuver = profile.maneuver
  enemy.bossManeuverStartAge = (enemy.bossEncounterAge ?? 0) - overshoot
  enemy.bossLastManeuverSerial = serial
  enemy.bossManeuverFromX = enemy.x
  const flank = clamp(lane + (enemy.x < lane ? 28 : -28), 18, 82)
  const opposite = enemy.x < 50 ? 78 : 22
  enemy.bossManeuverToX = profile.maneuver === 'phaseShift' || Math.abs(flank - enemy.x) < 18 ? opposite : flank
  // A dash leads into a fresh warning. Cloaking has a separate, longer exposure window.
  enemy.bossAttackTimer = (profile.maneuver === 'phaseShift'
    ? COMMAND_PHASE_RECOVERY_SECONDS : COMMAND_CLOAK_SECONDS + .24) - overshoot
}

function moveDuringRecovery(enemy: Enemy, profile: CommandBossProfile, target: Vec, dt: number) {
  if (enemy.bossManeuver === 'phaseShift') {
    enemy.x = sampleCommandPhaseShiftX(enemy, getCommandManeuverAge(enemy))
    return
  }
  if (enemy.bossManeuver === 'cloak' && enemy.bossManeuverToX !== undefined) {
    const age = getCommandManeuverAge(enemy)
    const moveSeconds = clamp(age - COMMAND_CLOAK_SCAN_SECONDS, 0, dt)
    enemy.x += clamp(enemy.bossManeuverToX - enemy.x, -36 * moveSeconds, 36 * moveSeconds)
    return
  }
  const age = enemy.bossEncounterAge ?? 0, serial = enemy.bossAttackSerial ?? 0
  const maneuver = mixCommandAttack(serial + profile.stage * 97 + (enemy.id ?? 0) * 17)
  const side = (maneuver & 4) ? 1 : -1
  const amplitudeScale = .77 + (maneuver % 13) * .032
  let targetX = 50 + Math.sin(age * .65) * profile.amplitude
  let targetY = 20 + Math.sin(age * .8) * 2
  if (profile.movement === 'flank') { targetX = 50 + side * profile.amplitude; targetY = 26 }
  else if (profile.movement === 'sweep') { targetX = 50 - side * profile.amplitude; targetY = 23 }
  else if (profile.movement === 'orbit') { targetX = 50 + Math.sin(age * 1.15) * profile.amplitude; targetY = 20 + Math.cos(age * 1.15) * 4 }
  else if (profile.movement === 'fortress') { targetX = 50 + side * profile.amplitude; targetY = 19 }
  else if (profile.movement === 'hunt') { targetX = clamp((enemy.bossAimX ?? 50) + side * 12, 22, 78); targetY = 24 }
  targetX = 50 + (targetX - 50) * amplitudeScale + (target.x - 50) * .16
  targetY += (maneuver % 5) - 2
  const speed = profile.movement === 'flank' || profile.movement === 'sweep' ? COMMAND_MAX_STRAFE_SPEED : 36
  enemy.x = clamp(enemy.x + clamp(targetX - enemy.x, -speed * dt, speed * dt), 18, 82)
  enemy.y = clamp(enemy.y + clamp(targetY - enemy.y, -COMMAND_MAX_VERTICAL_SPEED * dt, COMMAND_MAX_VERTICAL_SPEED * dt), 16, 28)
}
/** Host-only, simulation-dt clock. Attack parameters and aims latch before the warning, including phase changes. */
export function advanceCommandBoss(enemy: Enemy, dt: number, targets: readonly Vec[], difficulty: RaidDifficulty,
  availableShots: number, emit: (shot: CommandShot) => void, guidedOpening = false) {
  const profile = getCommandBossProfile(enemy)
  if (!profile || enemy.hp <= 0 || targets.length === 0 || !Number.isFinite(dt) || dt <= 0) return 0
  // Entry protection is not a free opening shot. Pauses never advance this clock.
  if (enemy.y < 16 || enemy.shieldTime > 0) return 0
  const delta = Math.min(dt, .1)
  enemy.bossEncounterAge = (enemy.bossEncounterAge ?? 0) + delta
  if (!enemy.bossAttackState) return beginAttack(enemy, profile, targets, difficulty, 0, guidedOpening)
  const state = enemy.bossAttackState
  if (state === 'recovery' && !(guidedOpening && enemy.bossAttackSerial === 0)) moveDuringRecovery(enemy, profile, targets[((enemy.bossAttackSerial ?? 0) + 1) % targets.length], delta)
  enemy.bossAttackTimer = (enemy.bossAttackTimer ?? 0) - delta
  if (enemy.bossAttackTimer > 1e-8) return 0
  const overshoot = Math.min(delta, Math.max(0, -enemy.bossAttackTimer))
  if (state === 'recovery') return beginAttack(enemy, profile, targets, difficulty, overshoot, guidedOpening)
  const count = writeCommandVolley(enemy, releaseScratch)
  if (count > availableShots) {
    // Skip the entire volley instead of dropping an arbitrary safe gap or retrying without warning.
    enemy.bossAttackState = 'recovery'; enemy.bossAttackTimer = .8
    return 0
  }
  for (let i = 0; i < count; i++) emit(releaseScratch[i])
  if (count > 0) enemy.bossLastVolleyAge = enemy.bossEncounterAge
  enemy.bossBurstIndex = (enemy.bossBurstIndex ?? 0) + 1
  if (enemy.bossBurstIndex < (enemy.bossBurstCount ?? 1)) {
    enemy.bossAttackState = 'burst'
    enemy.bossAttackTimer = (enemy.bossBurstInterval ?? .29) - overshoot
  } else {
    beginRecovery(enemy, profile, overshoot)
  }
  return count ? COMMAND_FIRED : 0
}
export function interruptCommandBoss(enemy: Enemy) {
  if (!getCommandBossProfile(enemy) || enemy.bossEncounterAge === undefined) return
  enemy.bossLastVolleyAge = undefined
  enemy.bossAttackState = 'recovery'; enemy.bossAttackTimer = .9; enemy.bossBurstIndex = 0
  enemy.bossManeuver = undefined
  enemy.bossManeuverStartAge = undefined
  enemy.bossManeuverFromX = undefined
  enemy.bossManeuverToX = undefined
}
