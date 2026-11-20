import { PLANET_FLIGHT_PERIOD, PLANET_FLIGHT_VIEW } from './planetFlightCamera'
import { atmosphereNoise, type PlanetAtmosphereKind } from './planetAtmosphereArt'

export type PlanetTerrainPeak = { x: number; distance: number; height: number; radiusX: number; radiusZ: number; seed: number }
export function createPlanetTerrainPeaks(kind: PlanetAtmosphereKind): PlanetTerrainPeak[] {
  const wet = kind === 'pelagic'
  return Array.from({ length: 24 }, (_, i) => {
    const band = Math.floor(i / 8), seed = i * 2.399 + .83
    return { x: (-3.5 + i % 8) * PLANET_FLIGHT_PERIOD / 8 + band * .63, distance: [1.75, 2.25, 3.3][band] + Math.sin(seed) * .08,
      height: (wet ? [.16, .28, .32] : [.21, .4, .42])[band] * (.86 + .14 * Math.sin(seed * 3)),
      radiusX: [.42, .58, .75][band] * (1 + .17 * Math.cos(seed)),
      radiusZ: [.32, .43, .6][band], seed }
  })
}

/** A continuous height field per island. Irregular erosion and a recessed
 * crater change the silhouette as the camera passes; these are not billboards. */
export function samplePlanetMountain(x: number, z: number, peak: PlanetTerrainPeak, wet: boolean) {
  const r = Math.hypot(x, z)
  if (r >= 1) return 0
  const angle = Math.atan2(z, x)
  const erosion = atmosphereNoise(x * 6 + peak.seed, z * 6, 823) - .45
  const ribs = Math.sin(angle * 5 + r * 6 + peak.seed) * .028
    + Math.sin(angle * 11 - r * 9 + peak.seed * 2) * .012
  const edge = Math.max(0, 1 - r * r)
  let profile = Math.pow(edge, wet ? 2.2 : 1.65)
  if (!wet) profile -= Math.exp(-((r / .16) ** 4)) * .29
  else profile *= .84 + Math.sin(x * 5 + peak.seed) * .12
  return Math.max(0, profile + (erosion * .24 + ribs) * edge * Math.min(1, r * 9)) * peak.height
}

/** Static, sorted triangles share one GPU buffer. Translation in the flight
 * direction never changes their depth order, so no extra depth pass is needed. */
export function buildPlanetTerrain(kind: PlanetAtmosphereKind, peaks: readonly PlanetTerrainPeak[]) {
  const columns = 40, rows = 32, perPeak = (columns + 1) * (rows + 1)
  const count = peaks.length * perPeak, positions = new Float32Array(count * 3)
  const centers = new Float32Array(count * 2), normals = new Float32Array(count * 3)
  const details = new Float32Array(count * 2), triangles: { a: number; b: number; c: number; depth: number }[] = []
  const wet = kind === 'pelagic'
  for (let p = 0; p < peaks.length; p++) {
    const peak = peaks[p]
    for (let row = 0; row <= rows; row++) for (let col = 0; col <= columns; col++) {
      const x = col / columns * 2 - 1, z = row / rows * 2 - 1
      const i = p * perPeak + row * (columns + 1) + col
      const height = samplePlanetMountain(x, z, peak, wet), e = .002
      const dx = (samplePlanetMountain(x + e, z, peak, wet) - samplePlanetMountain(x - e, z, peak, wet)) / (2 * e * peak.radiusX)
      const dz = (samplePlanetMountain(x, z + e, peak, wet) - samplePlanetMountain(x, z - e, peak, wet)) / (2 * e * peak.radiusZ)
      const length = Math.hypot(dx, 1, dz)
      positions.set([x * peak.radiusX, height, z * peak.radiusZ], i * 3)
      centers.set([peak.x, peak.distance], i * 2)
      normals.set([-dx / length, 1 / length, -dz / length], i * 3)
      details.set([x, z], i * 2)
      if (row < rows && col < columns) {
        for (const indices of [[i, i + 1, i + columns + 2], [i, i + columns + 2, i + columns + 1]]) {
          const [a, b, c] = indices
          triangles.push({ a, b, c, depth: 0 })
        }
      }
    }
  }
  // All vertex heights are now available, including the following grid row.
  for (const triangle of triangles) triangle.depth = [triangle.a, triangle.b, triangle.c].reduce((sum, v) =>
    sum + PLANET_FLIGHT_VIEW[1] * (positions[v * 3 + 2] + centers[v * 2 + 1]) - PLANET_FLIGHT_VIEW[0] * positions[v * 3 + 1], 0)
  triangles.sort((a, b) => b.depth - a.depth)
  const indices = new Uint16Array(triangles.length * 3)
  triangles.forEach((triangle, i) => indices.set([triangle.a, triangle.b, triangle.c], i * 3))
  return { positions, centers, normals, details, indices }
}
