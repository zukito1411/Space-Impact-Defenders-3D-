import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const read = file => readFileSync(new URL('../src/components/games/raid/' + file, import.meta.url), 'utf8')
const utils = read('utils.ts')
const sparkStart = utils.indexOf('export function acquireSpark(')
const sparkEnd = utils.indexOf('export function recycleRipple(', sparkStart)
const code = ts.transpileModule([
  read('flightEffects.ts'), read('combatFeel.ts'), read('sectorAtmosphere.ts'),
  'let sparkId = 0; export const sparkPool = [];', utils.slice(sparkStart, sparkEnd),
].join('\n'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
const { raidStereoPan, sampleCapitalFlyby, sampleDistantBattle, muzzleFlashProgress, sampleOrbitalShadow, orbitalShadowCoverage, updateFlightPose, getHullImpactDirection, acquireSpark, sparkPool, getRaidSectorLight, sampleSectorWreck, raidRevealGain } =
  await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'))

assert.equal(sampleDistantBattle(0, 0), -1)
assert.equal(sampleDistantBattle(18.5, 0), .5)
assert.equal(sampleDistantBattle(21, 0), -1)
assert.equal(sampleDistantBattle(NaN, 1), -1)
assert.equal(muzzleFlashProgress(1000, 1000), 0)
assert.equal(muzzleFlashProgress(1055, 1000), .5)
assert.equal(muzzleFlashProgress(1110, 1000), -1)
assert.equal(muzzleFlashProgress(900, 1000), -1)
assert.equal(sampleCapitalFlyby(0, 3), -1)
assert.equal(sampleCapitalFlyby(11, 3), .5)
assert.equal(sampleCapitalFlyby(22, 3), -1)
assert.equal(sampleCapitalFlyby(43, 3), .5)

assert.equal(raidRevealGain(Infinity), 1)
assert.equal(raidRevealGain(5), 1)
assert.ok(raidRevealGain(4.3) < .7)
assert.ok(raidRevealGain(3) < .25)
assert.equal(raidRevealGain(0), 1)
for (const stage of [1, 3, 13, 16]) assert.equal(getRaidSectorLight(stage), undefined)

for (const [w, h] of [[360, 800], [800, 360], [1440, 900]]) {
  for (const side of [.35, .65]) {
    const shadow = {}
    const sun = Float32Array.from([side < .5 ? -.61 : .61, -.49, .62])
    sampleOrbitalShadow(shadow, side * w, .24 * h, Math.max(w, h) * .7, w, h, .2, sun)
    assert.equal(orbitalShadowCoverage(shadow, shadow.x, shadow.y), 0)
    sampleOrbitalShadow(shadow, side * w, .24 * h, Math.max(w, h) * .7, w, h, .82, sun)
    assert.equal(orbitalShadowCoverage(shadow, shadow.x, shadow.y), 1)
    assert.ok(orbitalShadowCoverage(shadow, shadow.x - Math.sin(shadow.rotation) * shadow.width * .18,
      shadow.y + Math.cos(shadow.rotation) * shadow.width * .18) > .8)
    assert.equal(orbitalShadowCoverage(shadow, shadow.x - Math.sin(shadow.rotation) * shadow.width,
      shadow.y + Math.cos(shadow.rotation) * shadow.width), 0)
    assert.equal(shadow.sunSide, side < .5 ? -1 : 1)
  }
  for (const stage of [2, 4, 6, 7, 8, 9, 11, 12, 14, 15]) {
    const { sun, wreckAt } = getRaidSectorLight(stage)
    const wreck = {}, shadow = {}, light = Float32Array.from(sun)
    assert.equal(sampleSectorWreck(wreck, shadow, wreckAt, wreckAt, w, h, light), false)
    let peak = 0
    for (let i = 1; i < 228; i++) {
      assert.ok(sampleSectorWreck(wreck, shadow, wreckAt + i / 60, wreckAt, w, h, light))
      assert.ok(wreck.x < .075 * w || wreck.x > .925 * w)
      peak = Math.max(peak, orbitalShadowCoverage(shadow, w * .5, h * .82))
    }
    assert.ok(peak > .20 && peak < .50, `Stage ${stage} flyby missed the piloting lane at ${w}×${h}`)
    assert.equal(sampleSectorWreck(wreck, shadow, wreckAt + 4, wreckAt, w, h, light), false)
    assert.equal(shadow.strength, 0)
  }
}

for (const fps of [30, 60, 120]) {
  const step = 1000 / fps
  const pose = { time: 0, x: 50, bank: 0 }
  updateFlightPose(pose, step, 50 + 48 / fps)
  assert.ok(pose.maneuverJet > .8)
  updateFlightPose(pose, step * 2, 50)
  assert.ok(pose.maneuverJet < -.8, 'reversal must switch thrusters immediately')
  for (let n = 3; n < 3 + fps; n++) updateFlightPose(pose, step * n, 50)
  assert.ok(Math.abs(pose.maneuverJet) < .065, 'idle thrust should fade out')
}
assert.equal(getHullImpactDirection(3, 0, -5, 0), 0)
assert.equal(getHullImpactDirection(0, 0, 0, -5), Math.PI / 2)
const chip = acquireSpark(0, 0, 8, 1, .2, '#fff', 5, true)
assert.equal(chip.fragment, true)
assert.equal(chip.maxLife, .2)
sparkPool.push(chip)
const normal = acquireSpark(0, 0, 4, 1, .5, '#fff', 5)
assert.equal(normal, chip)
assert.equal(normal.fragment, undefined)
assert.equal(normal.maxLife, .9)
console.log('Flight effects: bounded flybys, eclipse coverage, responsive side jets, directional impact and spark reuse passed')


assert.equal(raidStereoPan(0,50,false),-1)
assert.equal(raidStereoPan(100,50,false),1)
assert.equal(raidStereoPan(50,100,true),-1)
assert.equal(raidStereoPan(50,0,true),1)
