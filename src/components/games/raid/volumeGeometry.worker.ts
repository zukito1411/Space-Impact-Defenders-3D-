export {}
declare const self: {
  onmessage: ((event: MessageEvent<{ id: number; pixels: Uint8ClampedArray; resolution: number; aspectX: number; aspectY: number; profile?: 'art' | 'fighter' | 'organic' | 'capital' }>) => void) | null
  postMessage(message: unknown, transfer: Transferable[]): void
}
self.onmessage = event => {
  const { id, pixels, resolution, profile } = event.data
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
    (profile === 'organic' || profile === 'capital'
      ? [0, 1, resolution, resolution + 1].some(offset => depth[y * resolution + x + offset] > 0)
      : [0, 1, resolution, resolution + 1].every(offset => depth[y * resolution + x + offset] > 0))
  const positions: number[] = [], uvs: number[] = [], indices: number[] = []
  const shared = new Map<number, number>()
  const { aspectX, aspectY } = event.data
  const vertex = (x: number, y: number, side: number) => {
    const u = x / (resolution - 1), v = y / (resolution - 1)
    {
      const tag = (side > 0 ? resolution * resolution : 0) + y * resolution + x
      const existing = shared.get(tag)
      if (existing !== undefined) { indices.push(existing); return }
      shared.set(tag,positions.length/3)
      indices.push(positions.length/3)
    }
    let thickness = .012 + Math.min(.14, depth[y * resolution + x] * .012)
    if (profile === 'fighter') {
      const edge = Math.min(1,depth[y*resolution+x]/5)
      const spine = Math.exp(-(((u-.5)/.15)**2))
      const canopy = Math.exp(-(((u-.5)/.1)**2)-(((v-.4)/.16)**2))
      thickness = .012 + Math.min(.095,depth[y*resolution+x]*.010)*(.45+.55*spine)
        + (side > 0 ? .025*canopy*edge : 0)
      if (side < 0) thickness *= .62
    }
    if (profile === 'organic' || profile === 'capital') {
      const edge = Math.min(1, depth[y * resolution + x] / (resolution * .075))
      const spine = Math.exp(-(((u - .5) / .28) ** 2))
      const pixel = (y * resolution + x) * 4
      const luminance = (pixels[pixel] * .2126 + pixels[pixel + 1] * .7152 + pixels[pixel + 2] * .0722) / 255
      if (profile === 'organic') {
        // Rounded carapace, thinner limbs and raised painted shell ridges.
        thickness = .008 + Math.sqrt(edge) * (.036 + .092 * spine)
          + luminance * edge * .012
      } else {
        // Broad armor decks and a deeper central bridge; thin cutouts stay open.
        const bridge = Math.exp(-(((u - .5) / .13) ** 2) - (((v - .35) / .24) ** 2))
        thickness = .012 + edge * (.055 + .048 * spine + .042 * bridge)
          + edge * luminance * .014
      }
      if (side < 0) thickness *= .58
    }
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
  const index = positions.length / 3 > 65535 ? new Uint32Array(indices) : new Uint16Array(indices)
  self.postMessage({ id, position, uv, index }, [position.buffer, uv.buffer, index.buffer])
}
