export {}
declare const self: {
  onmessage: ((event: MessageEvent<{ id: number; pixels: Uint8ClampedArray; radius: number; aspect: number }>) => void) | null
  postMessage(message: unknown, transfer: Transferable[]): void
}
const longitudes = Float32Array.from({ length: 1024 }, (_, x) => Math.sin(x/1024*Math.PI*2))
self.onmessage = event => {
  const { id, pixels, radius, aspect } = event.data
  // Extend opaque pigment into the transparent margin before spherical sampling.
  // Original paintings have soft, non-circular alpha bounds; copying alpha-zero
  // RGB as opaque creates black longitude bands on the physical sphere.
  const nearest = new Int32Array(512*512).fill(-1)
  const queue = new Int32Array(512*512)
  let head = 0, tail = 0
  for (let i = 0; i < nearest.length; i++) {
    if (pixels[i*4+3] > 240) { nearest[i] = i; queue[tail++] = i }
  }
  while (head < tail) {
    const i = queue[head++], x = i%512
    for (const j of [x > 0 ? i-1 : -1, x < 511 ? i+1 : -1, i-512, i+512]) {
      if (j >= 0 && j < nearest.length && nearest[j] < 0) {
        nearest[j] = nearest[i]; queue[tail++] = j
      }
    }
  }
  const output = new Uint8ClampedArray(1024*512*4)
  for (let y = 0; y < 512; y++) {
    const latitude = (y/511-.5)*Math.PI
    const band = Math.cos(latitude)*radius*512
    const py = Math.max(0,Math.min(511,Math.round(255.5+Math.sin(latitude)*radius*512*aspect)))
    for (let x = 0; x < 1024; x++) {
      const px = Math.max(0,Math.min(511,Math.round(255.5+longitudes[x]*band)))
      const a = Math.max(0,nearest[py*512+px])*4, b = (y*1024+x)*4
      output[b] = pixels[a]; output[b+1] = pixels[a+1]; output[b+2] = pixels[a+2]; output[b+3] = 255
    }
  }
  self.postMessage({ id, pixels: output }, [output.buffer])
}
