import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { PNG } from 'pngjs'
import { spawn } from 'node:child_process'

const origin = 'http://127.0.0.1:5173/scripts/space3d-playfield-smoke.html'
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1'],
  { stdio: 'ignore' })

function coverage(png) {
  let vivid = 0
  let bright = 0
  let read = 0
  for (let y = 14; y < png.height - 14; y += 2) {
    for (let x = 14; x < png.width - 14; x += 2) {
      const index = (y * png.width + x) * 4
      const r = png.data[index], g = png.data[index + 1], b = png.data[index + 2]
      const top = Math.max(r, g, b)
      const bottom = Math.min(r, g, b)
      read++
      if (top > 55) bright++
      if (top > 55 && top - bottom > 23) vivid++
    }
  }
  return { bright: bright / Math.max(1, read), vivid: vivid / Math.max(1, read) }
}
function visible3DDifference(a, b) {
  assert.equal(a.width, b.width)
  assert.equal(a.height, b.height)
  let changed = 0, total = 0, distinct = 0
  for (let y = 14; y < a.height - 14; y += 2) {
    for (let x = 14; x < a.width - 14; x += 2) {
      const p = (y * a.width + x) * 4
      const dr = Math.abs(a.data[p] - b.data[p])
      const dg = Math.abs(a.data[p + 1] - b.data[p + 1])
      const db = Math.abs(a.data[p + 2] - b.data[p + 2])
      const magnitude = dr + dg + db
      total++
      if (magnitude > 66) changed++
      if (magnitude > 145) distinct++
    }
  }
  return { changed: changed / total, distinct: distinct / total }
}

let browser
try {
  let ready = false
  for (let i = 0; i < 150; i++) {
    try {
      if ((await fetch(origin)).ok) { ready = true; break }
    } catch { /* Vite starting */ }
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  assert.ok(ready, 'Vite must start')

  browser = await chromium.launch({
    channel: process.env.GITHUB_ACTIONS ? 'chrome' : undefined,
    args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
  })

  // Test the old fixture AND the real mobile aspect of the screenshot.
  // The earlier 480x720 test did not catch narrow portrait 3D frustum loss.
  const variants = [
    { width: 432, height: 960, name: 'portrait-phone', deviceDpr: 2.5 },
    { width: 960, height: 432, name: 'landscape-phone', deviceDpr: 1 },
  ]
  for (const { width, height, name, deviceDpr } of variants) {
    const page = await browser.newPage({
      viewport: { width, height },
      deviceScaleFactor: 1,
      isMobile: true, hasTouch: true,
    })
    const uncaught = []
    page.on('pageerror', error => uncaught.push(error.message))
    await page.goto(origin + '?width=' + width + '&height=' + height + '&deviceDpr=' + deviceDpr)
    await page.waitForFunction(() => Boolean(window.space3dPlayfieldSmoke),
      null, { timeout: 90000 })
    const status = await page.evaluate(() => window.space3dPlayfieldSmoke)
    assert.equal(status.success, true, 'Actual raid background must activate real 3D: ' + JSON.stringify({ name, status }))
    assert.ok(status.backingWidth >= Math.floor(width * status.pixelDpr) - 1,
      name + ' HD canvas backing must match effective device DPR: ' + JSON.stringify(status))
    assert.ok(status.backingHeight >= Math.floor(height * status.pixelDpr) - 1,
      name + ' HD canvas height must match effective device DPR: ' + JSON.stringify(status))
    if (deviceDpr > 1)
      assert.ok(status.pixelDpr >= 2, 'High-quality portrait GPU scenery must render at >=2x device density')
    assert.deepEqual(uncaught, [], 'No uncaught errors in ' + name)

    const canvas = page.locator('#raid-background-host')
    const screenshot3D = await canvas.screenshot({
      path: 'space-3d-' + name + '-visible.png', animations: 'disabled',
    })
    const threeD = PNG.sync.read(screenshot3D)
    assert.equal(threeD.width, width)
    assert.equal(threeD.height, height)
    const light = coverage(threeD)
    assert.ok(light.bright > .035 && light.vivid > .022,
      name + ' must retain bright/vivid original 2D art: ' + JSON.stringify(light))

    // Compare the SAME scene/time with just View3D hidden. Ordinary 2D
    // background brightness could make a broken 3D layer pass previous tests.
    const disabled = await page.evaluate(() => window.disable3DForPixelComparison?.())
    assert.equal(disabled, true, name + ' 3D world must exist')
    const legacy = PNG.sync.read(await canvas.screenshot({ animations: 'disabled' }))
    const diff = visible3DDifference(threeD, legacy)
    console.log(name, JSON.stringify({ ...status, ...light, ...diff }))
    assert.ok(diff.changed >= .012 && diff.distinct >= .003,
      name + ' must DISPLAY 3D mesh pixels beyond the 2D scene: ' + JSON.stringify(diff))
    await page.close()
  }
  console.log('Real 3D geometry is visibly present in BOTH Android phone aspect ratios.')
} finally {
  if (browser) await browser.close()
  server.kill()
}
