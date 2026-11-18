import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'

const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1'],
  { stdio: 'ignore' })
let browser
try {
  for (let i = 0; i < 150; i++) {
    try {
      const response = await fetch('http://127.0.0.1:5173/scripts/space3d-smoke.html')
      if (response.ok) break
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  browser = await chromium.launch({ channel: process.env.GITHUB_ACTIONS ? 'chrome' : undefined,
    args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] })
  const page = await browser.newPage({ viewport: { width: 480, height: 640 } })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('http://127.0.0.1:5173/scripts/space3d-smoke.html')
  await page.waitForFunction(() => Boolean(window.space3dSmoke), {}, { timeout: 45000 })
  const status = await page.evaluate(() => window.space3dSmoke)
  assert.equal(status.success, true, '3D rendering test must succeed: ' + JSON.stringify(status))
  assert.equal(status.frameCount, 5)
  assert.ok(status.art?.sourceAtlases >= 8,
    'Original high-resolution 2D art must reach the 3D material pipeline: ' + JSON.stringify(status.art))
  assert.equal(status.art.texturedPlanets, 3)
  assert.equal(status.art.texturedRocks, 26)
  assert.ok(status.art.stationParts >= 10)
  assert.ok(status.art.volumetricClouds >= 8)
  assert.equal(status.art.atmosphericHalos, 3)
  assert.deepEqual(errors, [], '3D renderer must not emit uncaught exceptions')
  await page.screenshot({ path: 'space-3d-world-smoke.png' })
  console.log('Actual perspective 3D world rendered five frames through shared Pixi WebGL renderer')
} finally {
  if (browser) await browser.close()
  server.kill()
}
