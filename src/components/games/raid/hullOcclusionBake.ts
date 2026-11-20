/** Loading-worker cavity bake. Buffers retain every original vertex and UV. */
export function bakeHullOcclusion(points: Float32Array, indices: Uint32Array | null) {
  const count = points.length / 3, values = new Float32Array(count).fill(1)
  const resolution = 128, edge = resolution - 1
  const radii = [2,4,8,16], directions = Array.from({ length: 8 }, (_, i) => [Math.cos(i * Math.PI / 4),Math.sin(i * Math.PI / 4)])
  let left = Infinity, bottom = Infinity, right = -Infinity, top = -Infinity
  for (let i = 0; i < count; i++) {
    left = Math.min(left,points[i*3]); right = Math.max(right,points[i*3])
    bottom = Math.min(bottom,points[i*3+1]); top = Math.max(top,points[i*3+1])
  }
    const span = Math.max(right - left, top - bottom, .0001), scale = edge / span
    const height = new Float32Array(resolution * resolution).fill(-Infinity)
    const triangleCount = indices?.length ?? count
    for (let i = 0; i + 2 < triangleCount; i += 3) {
      const a = (indices?.[i] ?? i) * 3, b = (indices?.[i + 1] ?? i + 1) * 3
      const c = (indices?.[i + 2] ?? i + 2) * 3
      const ax = (points[a] - left) * scale, ay = (points[a + 1] - bottom) * scale
      const bx = (points[b] - left) * scale, by = (points[b + 1] - bottom) * scale
      const cx = (points[c] - left) * scale, cy = (points[c + 1] - bottom) * scale
      const area = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
      if (Math.abs(area) < .00001) continue
      for (let y = Math.max(0, Math.floor(Math.min(ay, by, cy))); y <= Math.min(edge, Math.ceil(Math.max(ay, by, cy))); y++) {
        for (let x = Math.max(0, Math.floor(Math.min(ax, bx, cx))); x <= Math.min(edge, Math.ceil(Math.max(ax, bx, cx))); x++) {
          const u = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / area
          const v = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / area, w = 1 - u - v
          if (Math.min(u, v, w) < -.001) continue
          const cell = y * resolution + x
          height[cell] = Math.max(height[cell], u * points[a + 2] + v * points[b + 2] + w * points[c + 2])
        }
      }
    }
    for (let i = 0; i < count; i++) {
      const x = (points[i * 3] - left) * scale, y = (points[i * 3 + 1] - bottom) * scale, z = points[i * 3 + 2]
      let coverage = 0
      for (let direction = 0; direction < 8; direction++) {
        const [dx,dy] = directions[direction]
        let horizon = 0
        for (const radius of radii) {
          const sx = Math.round(x + dx * radius), sy = Math.round(y + dy * radius)
          if (sx < 0 || sy < 0 || sx > edge || sy > edge) continue
          const rise = height[sy * resolution + sx] - z - span * .004
          if (rise > 0) horizon = Math.max(horizon, Math.atan2(rise, radius / scale))
        }
        coverage += horizon / (Math.PI * .5)
      }
      values[i] = Math.max(.58, 1 - coverage * .075)
    }
  return values
}
