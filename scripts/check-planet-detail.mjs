import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'

export async function checkPlanetDetail(page, output, view) {
  const prefix = `${output}/planet-detail-${view}`
  const checks = []
  for (const [name, stage] of [['distant', 1], ['pelagic', 4], ['cinder', 9]]) {
    const result = await page.evaluate(async ({ name, stage }) => {
      const review = window.campaignReview
      const { background, actions, r } = review
      const { getSurfaceTerrain } = await import('/src/components/games/raid/surfaceArt.ts')
      const textures = [getSurfaceTerrain(0), getSurfaceTerrain(1)]
      const renderer = background.app.renderer
      const ready = textures.map(texture => {
        const source = texture.source
        return Boolean(source._gpuData[renderer.uid]) && !source.autoGarbageCollect &&
          source.mipLevelCount > 1 && source.style.addressMode === 'repeat'
      })
      review.reset(stage, 'transition')
      r.stageClearRef.current = name === 'distant' ? 0 : .7
      const fixedTime = performance.now()
      for (let i = 0; i < 4; i++) actions.draw(fixedTime)
      const globe = background.globes[0]
      const surface = globe.surface
      const uniforms = surface.params.uniforms
      const amount = uniforms.uDetailAmount
      const tile = textures.findIndex(texture => texture === surface.detail)
      const canvas = background.app.canvas
      const copy = document.createElement('canvas')
      copy.width = canvas.width
      copy.height = canvas.height
      const ctx = copy.getContext('2d', { willReadFrequently: true })
      const render = detail => {
        uniforms.uDetailAmount = detail
        review.gpu.calls = 0
        review.gpu.triangles = 0
        background.app.render()
        return [review.gpu.calls, review.gpu.triangles]
      }
      const read = detail => {
        const work = render(detail)
        ctx.clearRect(0, 0, copy.width, copy.height)
        ctx.drawImage(canvas, 0, 0)
        return { work, pixels: ctx.getImageData(0, 0, copy.width, copy.height).data }
      }
      try {
        const { pixels: before, work: beforeWork } = read(0)
        const { pixels: after, work: afterWork } = read(amount)
        let changedPixels = 0, totalDelta = 0, brightnessChange = 0
        for (let i = 0; i < after.length; i += 4) {
          const red = after[i] - before[i]
          const green = after[i + 1] - before[i + 1]
          const blue = after[i + 2] - before[i + 2]
          const delta = Math.abs(red) + Math.abs(green) + Math.abs(blue)
          if (delta >= 5) changedPixels++
          totalDelta += delta
          brightnessChange += red * .2126 + green * .7152 + blue * .0722
        }
        const size = copy.width * copy.height
        return { name, ready, visible: globe.mesh.visible, amount, tile, work: [beforeWork, afterWork], changedPixels,
          averageRgbDelta: totalDelta / size / 3, averageBrightnessChange: brightnessChange / size }
      } finally {
        uniforms.uDetailAmount = amount
        actions.draw(fixedTime)
      }
    }, { name, stage })
    checks.push(result)
    if (name !== 'distant') {
      await page.evaluate(() => window.campaignReview.actions.sync())
      await page.screenshot({ path: `${prefix}-${name}.png` })
    }
  }
  await writeFile(`${prefix}.json`, JSON.stringify({ view, checks }, null, 2))
  for (const check of checks) {
    assert.deepEqual(check.ready, [true, true], 'Both mipmapped terrain materials must be on the GPU before approach')
    assert.ok(check.visible, `${check.name} did not render an orbital mesh`)
    assert.deepEqual(check.work[1], check.work[0], `${check.name} detail changed submitted geometry`)
    if (check.name === 'distant') {
      assert.equal(check.amount, 0, 'A distant planet entered the detail branch')
      assert.equal(check.changedPixels, 0, 'Distant planet pixels changed')
      continue
    }
    assert.ok(check.amount > .1, `${check.name} stayed on its base paint at close range`)
    assert.equal(check.tile, check.name === 'pelagic' ? 0 : 1)
    assert.ok(check.changedPixels > 250, `${check.name} did not show visible detail under its original lighting`)
    assert.ok(Math.abs(check.averageBrightnessChange) < 2, `${check.name} detail altered the lighting balance`)
  }
  console.log('Verified distant and close planet materials in', view, JSON.stringify(checks))
}
