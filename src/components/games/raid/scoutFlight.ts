import type { MesiahScoutUnit, Vec } from './types'

const ARRIVAL_SECONDS = 0.9
const DEPARTURE_SECONDS = 0.8

function turnToward(from: number, to: number, blend: number) {
  return from + Math.atan2(Math.sin(to - from), Math.cos(to - from)) * blend
}

/** Returns true while the escort is in transit or hidden; combat starts in formation. */
export function updateScoutFlight(scout: MesiahScoutUnit, enabled: boolean, home: Vec, dt: number, landscape: boolean) {
  const phase = scout.flightPhase ?? (scout.active ? 'active' : 'idle')
  if (enabled && (phase === 'idle' || phase === 'departing')) {
    // Logical rear is below portrait and left in landscape, matching stage launches.
    if (phase === 'idle') {
      scout.x = home.x + scout.side * (landscape ? 2 : 4)
      scout.y = 114
      scout.rotation = 0
    }
    scout.flightPhase = 'arriving'
    scout.flightAge = 0
    scout.flightStartX = scout.x
    scout.flightStartY = scout.y
    scout.flightStartRotation = scout.rotation
  } else if (!enabled && (phase === 'active' || phase === 'arriving')) {
    scout.flightPhase = 'departing'
    scout.flightAge = 0
    scout.flightStartX = scout.x
    scout.flightStartY = scout.y
    scout.flightStartRotation = scout.rotation
  } else {
    scout.flightPhase = phase
  }

  if (scout.flightPhase === 'idle') {
    scout.active = false
    scout.canFire = false
    scout.targetId = null
    return true
  }
  scout.active = true
  if (scout.flightPhase === 'active') return false

  scout.canFire = false
  scout.targetId = null
  scout.flightAge = (scout.flightAge ?? 0) + Math.max(0, dt)
  const arriving = scout.flightPhase === 'arriving'
  const delay = arriving ? (scout.side > 0 ? 0.1 : 0) + scout.stack * 0.08 : 0
  const t = Math.max(0, Math.min(1, (scout.flightAge - delay) / (arriving ? ARRIVAL_SECONDS : DEPARTURE_SECONDS)))
  const blend = arriving ? 1 - (1 - t) ** 3 : t * t
  const startX = scout.flightStartX ?? scout.x
  const startY = scout.flightStartY ?? scout.y
  const endX = arriving ? home.x : startX + scout.side * 8
  const endY = arriving ? home.y : -18
  scout.x = startX + (endX - startX) * blend
  scout.y = startY + (endY - startY) * blend
  const heading = Math.atan2(endY - startY, endX - startX) + Math.PI / 2
  const rotation = turnToward(scout.flightStartRotation ?? 0, heading, Math.min(1, t * 5))
  scout.rotation = arriving ? turnToward(rotation, 0, t * t) : rotation

  if (t >= 1) {
    scout.flightPhase = arriving ? 'active' : 'idle'
    scout.active = arriving
    scout.rotation = 0
  }
  return true
}
