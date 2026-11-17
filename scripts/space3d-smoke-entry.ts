import { Application } from 'pixi.js'
import { SpaceWorld3D } from '../src/components/games/raid/spaceWorld3D'
import { preloadCosmosArt } from '../src/components/games/raid/cosmosArt'

// Small fast renderer integration fixture: detects real mesh/render-pipeline
// failures without waiting through the game's lengthy campaign briefing.
const win = window as Window & {
  space3dSmoke?: { success: boolean; backend: string; frameCount: number; message?: string }
}
async function main() {
  let app: Application | undefined
  let world: SpaceWorld3D | undefined
  try {
    // Importing SpaceWorld3D first registers the Pixi 3D renderer plugins.
    app = new Application()
    await app.init({
      width: 480, height: 640, resolution: 1, preference: 'webgl',
      backgroundAlpha: 1, backgroundColor: 0x02040a,
      antialias: false, autoStart: false, preserveDrawingBuffer: true,
    })
    document.body.appendChild(app.canvas)
    await preloadCosmosArt()
    world = new SpaceWorld3D()
    app.stage.addChild(world.view)
    for (let i = 1; i <= 5; i++) {
      world.update({
        time: i * 16.67, stageTheme: i % 2 ? 1 : 4,
        width: 480, height: 640, stageRush: .4, paused: false,
        reducedMotion: false, runToken: 0,
      })
      app.render()
    }
    const canvas = app.canvas
    if (canvas.width < 100 || canvas.height < 100) throw Error('3D canvas dimensions invalid')
    win.space3dSmoke = { success: true, backend: 'webgl', frameCount: 5 }
  } catch (error) {
    win.space3dSmoke = { success: false, backend: 'webgl', frameCount: 0, message: String(error) }
    console.error('3D scene smoke test failed:', error)
  } finally {
    // Keep the rendered frame visible for screenshot inspection.
    // Page teardown will reclaim the isolated test context.
    void world
    void app
  }
}
void main()
