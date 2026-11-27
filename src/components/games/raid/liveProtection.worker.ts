import { LANDSCAPE_VIEW_YAW } from './raidView'
import { projectProtection, PROTECTION_BANKS, PROTECTION_STRIDE } from './liveProtectionGeometry'

export {}
declare const self: {
  onmessage: ((event: MessageEvent<{ id: number; variants: Float32Array[];
    indices: Uint32Array; registration: number[]; bankRange: number }>) => void) | null
  postMessage(message: unknown, transfer: Transferable[]): void
}
self.onmessage = event => {
  const { id,variants,indices,registration,bankRange } = event.data
  const frames = new Float32Array(2*variants.length*PROTECTION_BANKS*PROTECTION_STRIDE)
  for (let view = 0; view < 2; view++) for (let pose = 0; pose < variants.length; pose++) {
    for (let bank = 0; bank < PROTECTION_BANKS; bank++) {
      const roll = (2 * bank / (PROTECTION_BANKS - 1) - 1) * bankRange * 150 * Math.PI / 180
      const angle = (view ? LANDSCAPE_VIEW_YAW : 0) + roll
      frames.set(projectProtection(variants[pose],indices,registration,angle),
        ((view*variants.length+pose)*PROTECTION_BANKS+bank)*PROTECTION_STRIDE)
    }
  }
  self.postMessage({ id,frames },[frames.buffer])
}
