import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { PNG } from 'pngjs'
import { spawn } from 'node:child_process'

const url = 'http://127.0.0.1:5173/scripts/space3d-playfield-smoke.html'
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1'],
  { stdio: 'ignore' })
let browser
try {
  let ready = false
  for (let i = 0; i < 150; i++) {
    try {
      const response = await fetch(url)
      if (response.ok) { ready = true; break }
    } catch { /* Vite still starting */ }
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  assert.equal(ready, true, 'Vite playfield fixture must start')
  browser = await chromium.launch({
    channel: process.env.GITHUB_ACTIONS ? 'chrome' : undefined,
    args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
  })
  const page = await browser.newPage({ viewport: { width: 480, height: 720 } })
  const uncaught = []
  page.on('pageerror', error => uncaught.push(error.message))
  await page.goto(url)
  await page.waitForFunction(() => Boolean(window.space3dPlayfieldSmoke),
    null, { timeout: 90000 })
  const status = await page.evaluate(() => window.space3dPlayfieldSmoke)
  console.log('Stage 1 hybrid renderer:', JSON.stringify(status))
  assert.equal(status.success, true,
    '3D world + original illustrated background must BOTH remain visible')
  assert.deepEqual(uncaught, [], 'Background scene must not trigger uncaught page exceptions')

  const screenshot = await page.locator('#raid-background-host').screenshot({
    path: 'space-3d-playfield-smoke.png',
    animations: 'disabled',
  })
  const png = PNG.sync.read(screenshot)
  let vividPixels = 0
  let brightPixels = 0
  let readPixels = 0
  // The rendered stage is ONLY background: there are no ships, bullets,
  // HUD, or controls whose brightness could mask an empty cosmos.
  for (let y = 15; y < png.height - 15; y += 2) {
    for (let x = 15; x < png.width - 15; x += 2) {
      const index = (y * png.width + x) * 4
      const r = png.data[index]
      const g = png.data[index + 1]
      const b = png.data[index + 2]
      const hi = Math.max(r, g, b)
      const lo = Math.min(r, g, b)
      readPixels++
      if (hi > 55) brightPixels++
      if (hi > 55 && hi - lo > 23) vividPixels++
    }
  }
  const vividShare = vividPixels / Math.max(1, readPixels)
  const brightShare = brightPixels / Math.max(1, readPixels)
  console.log('Stage 1 cosmos screenshot:', JSON.stringify({
    pixels: readPixels, brightShare: +brightShare.toFixed(4),
    vividShare: +vividShare.toFixed(4),
  }))
  // Catch the 3D APK regression where the output was nearly pitch black
  // because all original sky layers were disabled before checking GPU output.
  assert.ok(brightShare >= .035 && vividShare >= .022,
    'Space environment is visually empty/dim: visible illustrated sky or 3D scene is missing')
  console.log('Real raid space environment has visible HD art and actual 3D geometry.')
} finally {
  if (browser) await browser.close()
  server.kill()
}
