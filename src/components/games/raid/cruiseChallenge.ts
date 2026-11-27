import type { Vec } from './types'

export type CruiseChallengeKind = 'relay' | 'salvage'
export type CruiseChallenge = {
  stage: number
  kind: CruiseChallengeKind
  age: number
  gate: number
  gateAge: number
  signal: number
  outcome?: 'complete' | 'missed'
  outcomeAge?: number
}

export const CHALLENGE_NOTICE_SECONDS = 1.4
export const RELAY_GATE_COUNT = 3
export const RELAY_GATE_SECONDS = 5.6
export const SALVAGE_SECONDS = 10
export const SALVAGE_LOCK_SECONDS = 2.4

const relayRoutes = [
  [30, 68, 44],
  [50, 23, 76],
  [74, 42, 67],
  [33, 58, 26],
] as const

const campaignChallenges: readonly (readonly [CruiseChallengeKind, number])[] = [
  ['relay', 24], ['salvage', 31], ['relay', 34], ['salvage', 27], ['salvage', 33],
  ['relay', 26], ['salvage', 30], ['relay', 36], ['salvage', 29], ['relay', 32],
  ['relay', 35], ['salvage', 28], ['relay', 38], ['salvage', 35],
]

export function getCruiseChallengeStartAge(stage: number) {
  return campaignChallenges[stage - 2]?.[1] ?? 23 + (stage * 7 % 13)
}

export function createCruiseChallenge(stage: number): CruiseChallenge {
  const kind = campaignChallenges[stage - 2]?.[0] ?? (stage % 2 === 0 ? 'relay' : 'salvage')
  return { stage, kind, age: 0, gate: 0, gateAge: 0, signal: 0 }
}

export function getCruiseChallengeTarget(challenge: CruiseChallenge) {
  if (challenge.kind === 'relay') {
    const route = relayRoutes[Math.floor(challenge.stage / 2) % relayRoutes.length]
    const x = route[challenge.gate] ?? route[RELAY_GATE_COUNT - 1]
    return { x, y: 56 + 37 * Math.min(1, challenge.gateAge / RELAY_GATE_SECONDS), radius: 8 }
  }
  const age = Math.max(0, challenge.age - CHALLENGE_NOTICE_SECONDS)
  const side = challenge.stage % 4 === 1 ? 1 : -1
  return { x: 50 + side * (20 + Math.sin(age * .85) * 11), y: 73 + Math.sin(.4 + age * .71) * 6, radius: 10 }
}

export function advanceCruiseChallenge<T extends Vec & { hp: number }>(challenge: CruiseChallenge, dt: number, pilots: readonly T[]): T | undefined {
  challenge.age += dt
  if (challenge.outcome || challenge.age < CHALLENGE_NOTICE_SECONDS) return

  const activeDt = Math.min(dt, challenge.age - CHALLENGE_NOTICE_SECONDS)
  const { x, y, radius } = getCruiseChallengeTarget(challenge)
  const pilot = pilots.find(pilot => pilot.hp > 0 && (pilot.x - x) ** 2 + (pilot.y - y) ** 2 <= radius ** 2)
  if (challenge.kind === 'relay') {
    if (pilot) {
      challenge.gate++
      challenge.gateAge = 0
      if (challenge.gate < RELAY_GATE_COUNT) return
    } else {
      challenge.gateAge += activeDt
      if (challenge.gateAge < RELAY_GATE_SECONDS) return
    }
  } else {
    challenge.signal = pilot ? Math.min(SALVAGE_LOCK_SECONDS, challenge.signal + activeDt)
      : Math.max(0, challenge.signal - activeDt * .7)
    if (challenge.signal < SALVAGE_LOCK_SECONDS) {
      if (challenge.age < CHALLENGE_NOTICE_SECONDS + SALVAGE_SECONDS) return
      challenge.outcome = 'missed'
      challenge.outcomeAge = challenge.age
      return
    }
  }

  challenge.outcome = pilot ? 'complete' : 'missed'
  challenge.outcomeAge = challenge.age
  return pilot
}
