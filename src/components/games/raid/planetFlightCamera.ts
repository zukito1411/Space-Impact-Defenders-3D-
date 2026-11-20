import { LANDSCAPE_VIEW_YAW, raidCameraFocal } from './raidView'

// Ground UVs, terrain vertices and vent attachments use this same world space.
// X is the flight direction, Y is altitude and Z is distance across the ground.
export const PLANET_FLIGHT_ALTITUDE = 1.6
export const PLANET_FLIGHT_TEXTURE_SCALE = .42
// An integer number of material repeats also makes long flights wrap seamlessly.
export const PLANET_FLIGHT_PERIOD = 7 / PLANET_FLIGHT_TEXTURE_SCALE
export const PLANET_FLIGHT_SPEED = .055
export const PLANET_FLIGHT_VIEW = [Math.cos(LANDSCAPE_VIEW_YAW), -Math.sin(LANDSCAPE_VIEW_YAW)] as const
export const planetFlightTravel = (seconds: number) => seconds * PLANET_FLIGHT_SPEED % PLANET_FLIGHT_PERIOD
export const planetFlightX = (x: number, travel: number) =>
  ((x - travel + PLANET_FLIGHT_PERIOD / 2) % PLANET_FLIGHT_PERIOD + PLANET_FLIGHT_PERIOD) % PLANET_FLIGHT_PERIOD - PLANET_FLIGHT_PERIOD / 2

export type PlanetFlightPoint = { x: number; y: number; scale: number }
export function projectPlanetFlightPoint(x: number, altitude: number, distance: number,
  width: number, height: number, travel: number, out: PlanetFlightPoint) {
  const [c, s] = PLANET_FLIGHT_VIEW, down = PLANET_FLIGHT_ALTITUDE - altitude
  const depth = s * distance + c * down, focal = raidCameraFocal(width)
  out.scale = focal / Math.max(.025, depth)
  out.x = width / 2 + planetFlightX(x, travel) * out.scale
  out.y = height / 2 - (c * distance - s * down) * out.scale
  return out
}
