import assert from 'node:assert/strict'
import {
  RAID_RENDERER_STORAGE_KEY,
  chooseRaidRenderBackend,
  getPreferredRaidRenderBackend,
  getRaidRendererPreference,
  getWebGpuCapability,
  rememberWebGpuFailure,
  setRaidRendererPreference,
} from '../src/components/games/raid/renderBackend.ts'

const makeStorage = () => {
  const data = new Map()
  return {
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: key => data.delete(key),
  }
}
const localStorage = makeStorage()
const sessionStorage = makeStorage()
globalThis.window = { isSecureContext: true, localStorage, sessionStorage }
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: { gpu: { requestAdapter: async () => ({}) } },
})

assert.equal(chooseRaidRenderBackend('auto', true), 'webgpu')
assert.equal(chooseRaidRenderBackend('auto', false), 'webgl')
assert.equal(chooseRaidRenderBackend('auto', true, true), 'webgl')
assert.equal(chooseRaidRenderBackend('webgpu', true, true), 'webgpu')
assert.equal(chooseRaidRenderBackend('webgpu', false), 'webgl')
assert.equal(chooseRaidRenderBackend('webgl', true), 'webgl')
assert.equal(getWebGpuCapability(), true)
assert.equal(getRaidRendererPreference(), 'auto')
assert.equal(getPreferredRaidRenderBackend(), 'webgpu')

rememberWebGpuFailure()
assert.equal(getPreferredRaidRenderBackend(), 'webgl')
setRaidRendererPreference('webgpu')
assert.equal(localStorage.getItem(RAID_RENDERER_STORAGE_KEY), 'webgpu')
assert.equal(getPreferredRaidRenderBackend(), 'webgpu')

setRaidRendererPreference('webgl')
assert.equal(getPreferredRaidRenderBackend(), 'webgl')
setRaidRendererPreference('auto')
assert.equal(localStorage.getItem(RAID_RENDERER_STORAGE_KEY), null)
assert.equal(getPreferredRaidRenderBackend(), 'webgpu')

window.isSecureContext = false
assert.equal(getWebGpuCapability(), false)
assert.equal(getPreferredRaidRenderBackend(), 'webgl')
window.isSecureContext = true
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {} })
assert.equal(getPreferredRaidRenderBackend(), 'webgl')

console.log('WebGPU availability, explicit overrides, fallback and storage tests passed')
