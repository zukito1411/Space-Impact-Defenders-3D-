import { PixiRaidBackground, DEFAULT_RAID_PALETTE } from '../src/components/games/raid/background'
import { createRaidVisibilityBounds } from '../src/components/games/raid/visibility'

/**
 * Exercise the real Stage 1 PixiRaidBackground composition, not only an
 * isolated View3D. The initial 3D release rendered an empty space view
 * because it turned every existing art layer invisible.
 */
type SmokeResult = {
  success: boolean
  initialized: boolean
  renderSucceeded: boolean
  sceneActive: boolean
  skyVisible: boolean
  illustratedLayers: number
  backend: string
  message?: string
}
const win = window as Window & { space3dPlayfieldSmoke?: SmokeResult }
const host = document.getElementById('raid-background-host') as HTMLDivElement
const width = 480
const height = 720
async function main() {
  let background: PixiRaidBackground | null = null
  try {
    window.localStorage.setItem('space-impact-3d-renderer-v1', 'webgl')
    background = new PixiRaidBackground()
    const initialized = await background.init(host)
    if (!initialized) throw Error('Actual 3D raid background initialization failed')
    const bounds = createRaidVisibilityBounds(width, height, 100, 100)
    let renderSucceeded = true
    for (let frame = 0; frame < 5; frame++) {
      const time = 1000 + frame * 16.67
      renderSucceeded = background.render({
        width, height, dpr: 1, quality: 'high', time,
        stageTheme: 1, stageNumber: 1, stageAge: 12,
        raidMode: 'campaign', entryRemaining: 0, clearRemaining: 0,
        palette: DEFAULT_RAID_PALETTE, stageRush: .35, bossIntensity: 0,
        devilCorruption: 0, runToken: 1, landscape: false,
      }) && renderSucceeded
      background.renderForeground({
        width, height, dpr: 1, visualScale: 1, time, bounds,
        guestView: false, measureGpu: false,
        drawAdvancedShotFx: true, drawRipples: true,
        maxSparks: 96, maxRipples: 8,
        enemies: [], shots: [], guestShots: [], enemyShots: [],
        sparks: [], ripples: [],
      })
    }
    const stats = background.getRaidGpuStats()
    // The previous bug left the 3D view visible while hiding EVERY
    // illustrated sky layer. That must never happen again.
    const bg = background as unknown as {
      skyScene: { visible: boolean; children: Array<{ visible: boolean; label?: string }> }
    }
    const illustratedLayers = bg.skyScene.children.filter(
      layer => layer.visible && layer !== (background as unknown as { spaceWorld3D?: { view?: unknown } }).spaceWorld3D?.view,
    ).length
    const skyVisible = bg.skyScene.visible
    const sceneActive = stats.space3D && host.querySelector('canvas')?.dataset.space3d === 'active'
    win.space3dPlayfieldSmoke = {
      success: Boolean(initialized && renderSucceeded && sceneActive && skyVisible && illustratedLayers >= 4),
      initialized, renderSucceeded, sceneActive, skyVisible, illustratedLayers, backend: stats.backend,
    }
  } catch (error) {
    console.error('Actual raid playfield rendering failure:', error)
    win.space3dPlayfieldSmoke = {
      success: false, initialized: Boolean(background),
      renderSucceeded: false, sceneActive: false, skyVisible: false,
      illustratedLayers: 0, backend: 'unknown', message: String(error),
    }
  }
  // Preserve canvas for screenshot capture; the browser owns teardown.
}
void main()
