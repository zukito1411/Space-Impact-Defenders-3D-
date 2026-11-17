/** WebGPU-first renderer policy for the independent 3D game.
 *
 * Pixi already draws the raid in one GPU pass. Using its WebGPU backend when
 * supported avoids a second Three.js canvas/context, extra frame scheduling
 * and expensive cross-GPU texture copies. WebGL remains the stable fallback.
 *
 * Backend choice applies the next time a raid renderer is constructed.
 */
export type RaidRendererPreference = 'auto' | 'webgpu' | 'webgl'
export type RaidRenderBackend = 'webgpu' | 'webgl'

export const RAID_RENDERER_STORAGE_KEY = 'space-impact-3d-renderer-v1'
const GPU_FAILED_THIS_SESSION_KEY = 'space-impact-3d-webgpu-failed-v1'

export function getRaidRendererPreference(): RaidRendererPreference {
  if (typeof window === 'undefined') return 'auto'
  try {
    const value = window.localStorage.getItem(RAID_RENDERER_STORAGE_KEY)
    return value === 'webgpu' || value === 'webgl' ? value : 'auto'
  } catch {
    return 'auto'
  }
}

export function setRaidRendererPreference(value: RaidRendererPreference) {
  if (typeof window === 'undefined') return
  try {
    if (value === 'auto') window.localStorage.removeItem(RAID_RENDERER_STORAGE_KEY)
    else window.localStorage.setItem(RAID_RENDERER_STORAGE_KEY, value)
    // An explicit user choice should be tried again, even if a previous
    // backend crashed earlier in the same tab.
    if (value !== 'auto') window.sessionStorage.removeItem(GPU_FAILED_THIS_SESSION_KEY)
  } catch { /* Private-mode storage may be blocked; preserve the game. */ }
}

export function getWebGpuCapability(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false
  // WebGPU requires a secure context (localhost, HTTPS, or a trusted WebView).
  if (!window.isSecureContext) return false
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter?: unknown } }).gpu
  return typeof gpu?.requestAdapter === 'function'
}

export function chooseRaidRenderBackend(
  preference: RaidRendererPreference,
  webGpuAvailable: boolean,
  failedThisSession = false,
): RaidRenderBackend {
  if (!webGpuAvailable || preference === 'webgl') return 'webgl'
  if (preference === 'webgpu') return 'webgpu'
  return failedThisSession ? 'webgl' : 'webgpu'
}

export function getPreferredRaidRenderBackend(): RaidRenderBackend {
  let failedThisSession = false
  try {
    failedThisSession = window.sessionStorage.getItem(GPU_FAILED_THIS_SESSION_KEY) === '1'
  } catch { /* No persistent state is required to render. */ }
  return chooseRaidRenderBackend(getRaidRendererPreference(), getWebGpuCapability(), failedThisSession)
}

export function rememberWebGpuFailure() {
  if (typeof window === 'undefined') return
  try { window.sessionStorage.setItem(GPU_FAILED_THIS_SESSION_KEY, '1') }
  catch { /* A failed backend must never crash the game. */ }
}
