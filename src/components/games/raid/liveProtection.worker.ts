import { projectProtection, PROTECTION_BANKS, PROTECTION_STRIDE } from './liveProtectionGeometry'

export {}
declare const self: {
  onmessage: ((event: MessageEvent<{ id: number; variants: Float32Array[];
    indices: Uint32Array; registration: number[] }>) => void) | null
  postMessage(message: unknown, transfer: Transferable[]): void
}
self.onmessage = event => {
  const { id,variants,indices,registration } = event.data
  const frames = new Float32Array(2*variants.length*PROTECTION_BANKS*PROTECTION_STRIDE)
  for (let view = 0; view < 2; view++) for (let pose = 0; pose < variants.length; pose++) {
    for (let bank = 0; bank < PROTECTION_BANKS; bank++) {
      const angle = ((view ? -56 : 0)+bank-21)*Math.PI/180
      frames.set(projectProtection(variants[pose],indices,registration,angle),
        ((view*variants.length+pose)*PROTECTION_BANKS+bank)*PROTECTION_STRIDE)
    }
  }
  self.postMessage({ id,frames },[frames.buffer])
}
