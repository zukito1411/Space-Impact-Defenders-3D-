import assert from 'node:assert/strict'

export async function checkSpaceAtmosphere(page, output, view) {
  const pass = await page.evaluate(async () => {
    const {r, actions, reset, background} = window.campaignReview
    const {getRaidSectorLight, sampleSectorWreck} = await import('/src/components/games/raid/sectorAtmosphere.ts')
    const {orbitalShadowCoverage} = await import('/src/components/games/raid/flightEffects.ts')
    const start = getRaidSectorLight(7).wreckAt
    reset(7, 'waves')
    let time = performance.now()
    const draw = age => {
      r.journeyStageAgeRef.current = age
      actions.draw(time += 1000 / 60)
      const {cssWidth, cssHeight} = r.viewportMetricsRef.current
      const wreck = background.passingWreck
      return {
        age,
        visible: wreck.visible,
        lane: wreck.x / cssWidth,
        shadow: background.getEclipseAt(cssWidth * .5, cssHeight * .82),
        weaponLayerIsAboveWreck: background.app.stage.getChildIndex(wreck.parent) <
          background.app.stage.getChildIndex(background.gpuForeground.root),
      }
    }
    const before = draw(start - .05)
    const {cssWidth, cssHeight} = r.viewportMetricsRef.current
    const sun = background.orbitalCamera.sunDirection
    const shape = {}, shadow = {}
    let peakAge = start + 1, coverage = 0
    for (let i = 1; i < 38; i++) {
      const age = start + i * .1
      sampleSectorWreck(shape, shadow, age, start, cssWidth, cssHeight, sun)
      const sample = orbitalShadowCoverage(shadow, cssWidth * .5, cssHeight * .82)
      if (sample > coverage) { peakAge = age; coverage = sample }
    }
    const after = draw(start + 3.9)
    const peak = draw(peakAge)
    actions.sync()
    return {before, after, peak}
  })

  assert.equal(pass.before.visible, false)
  assert.equal(pass.after.visible, false)
  assert.ok(pass.peak.visible && (pass.peak.lane < .075 || pass.peak.lane > .925))
  assert.ok(pass.peak.shadow > .20 && pass.peak.shadow < .50, JSON.stringify(pass))
  assert.ok(pass.peak.weaponLayerIsAboveWreck)
  await page.evaluate(() => new Promise(window.reviewRAF))
  await page.screenshot({path: `${output}/stage-07-wreck-shadow-${view}.png`, timeout: 60000})
  console.log(`Verified Stage 7 wreck pass and hull-only shadow in ${view}`)
}
