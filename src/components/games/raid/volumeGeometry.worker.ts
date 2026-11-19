export {}
declare const self: {
  onmessage: ((event: MessageEvent<{ id: number; pixels: Uint8ClampedArray; resolution: number; aspectX: number; aspectY: number }>) => void) | null
  postMessage(message: unknown, transfer: Transferable[]): void
}
self.onmessage = event => {
  const { id, pixels, resolution } = event.data
  const depth = new Float32Array(resolution * resolution)
  for (let i = 0; i < depth.length; i++) depth[i] = pixels[i * 4 + 3] >= 80 ? resolution : 0
  for (let y = 1; y < resolution - 1; y++) for (let x = 1; x < resolution - 1; x++) {
    const i = y * resolution + x
    depth[i] = Math.min(depth[i], depth[i - 1] + 1, depth[i - resolution] + 1)
  }
  for (let y = resolution - 2; y > 0; y--) for (let x = resolution - 2; x > 0; x--) {
    const i = y * resolution + x
    depth[i] = Math.min(depth[i], depth[i + 1] + 1, depth[i + resolution] + 1)
  }
  const occupied = (x: number, y: number) => x >= 0 && y >= 0 && x < resolution - 1 && y < resolution - 1 &&
    [0, 1, resolution, resolution + 1].every(offset => depth[y * resolution + x + offset] > 0)
  const positions: number[] = [], uvs: number[] = []
  const { aspectX, aspectY } = event.data
  const vertex = (x: number, y: number, side: number) => {
    const u = x / (resolution - 1), v = y / (resolution - 1)
    const thickness = .012 + Math.min(.14, depth[y * resolution + x] * .012)
    positions.push((u - .5) * aspectX, (.5 - v) * aspectY, side * thickness)
    uvs.push(u, 1 - v)
  }
  for (let y = 0; y < resolution - 1; y++) for (let x = 0; x < resolution - 1; x++) {
    if (!occupied(x, y)) continue
    for (const side of [1, -1]) {
      const corners = side > 0 ? [[0, 0], [0, 1], [1, 1], [0, 0], [1, 1], [1, 0]]
        : [[0, 0], [1, 0], [1, 1], [0, 0], [1, 1], [0, 1]]
      for (const [dx, dy] of corners) vertex(x + dx, y + dy, side)
    }
    for (const [dx, dy, ax, ay, bx, by] of [[-1, 0, 0, 0, 0, 1], [1, 0, 1, 1, 1, 0],
      [0, -1, 1, 0, 0, 0], [0, 1, 0, 1, 1, 1]]) {
      if (occupied(x + dx, y + dy)) continue
      for (const [px, py, side] of [[ax, ay, 1], [ax, ay, -1], [bx, by, -1],
        [ax, ay, 1], [bx, by, -1], [bx, by, 1]]) vertex(x + px, y + py, side)
    }
  }

  const position = new Float32Array(positions)
  const uv = new Float32Array(uvs)
  self.postMessage({ id, position, uv }, [position.buffer, uv.buffer])
}
