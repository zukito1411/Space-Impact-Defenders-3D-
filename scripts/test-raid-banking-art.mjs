import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import ts from 'typescript'

const path = 'src/components/games/raid/'
const registrations = JSON.parse(readFileSync(path + 'bankingAnchors.json', 'utf8'))
const assets = readFileSync('src/components/games/RaidShipSprite.tsx', 'utf8') +
  readFileSync(path + 'shipArtwork.ts', 'utf8')
const expectedKeys = [...assets.matchAll(/^  (\w+): 'assets\/ships\//gm)].map(match => match[1]).filter(key => key !== 'mesiah')
assert.deepEqual(Object.keys(registrations).sort(), [...new Set(expectedKeys)].sort())

// Generated textures must be committed together with any renderer version bump.
// Otherwise CI fails late with ENOENT and the APK can contain missing ships.
const bankingDir = 'public/assets/ships/banking/'
const expectedV4Files = Object.keys(registrations).map(key => key + '-v7.webp').sort()
const committedV4Files = readdirSync(bankingDir).filter(name => name.endsWith('-v7.webp')).sort()
assert.deepEqual(committedV4Files, expectedV4Files,
  'Every registered 3D banking ship needs its committed -v7.webp atlas before verification and release')


function compile(source) {
  const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } })
  return import('data:text/javascript;base64,' + Buffer.from(outputText).toString('base64'))
}

const source = readFileSync(path + 'bankingArt.ts', 'utf8')
const art = await compile(`
  const anchors = ${JSON.stringify(registrations)}
  const getPublicAssetUrl = path => '/base/' + path
  const releaseCanvasSprite = () => {}
  const makeImageCanvasSprite = (cacheKey, url) => ({ cacheKey, url, loaded: !cacheKey.includes('rocket-v7') })
` + source.replace(/^import .*\n/gm, ''))
// Preserve textured ship paint and reflections; a one-time tint is cheaper
// than filters on every animated frame and should not wash out the hull.
assert.equal(art.RAID_BANKING_HULL_FILTER, 'none')
assert.equal(art.BANKING_CELL, 448, 'banking poses must be high-DPI source resolution')
assert.match(source, /makeImageCanvasSprite\(`ship-banking:/)
assert.doesNotMatch(source, /globalCompositeOperation = 'source-atop'/)
// Use the in-game indexing logic to exercise extremes, the portrait/landscape split and reduced motion.
for (const [landscape, offset] of [[false, 0], [true, 7]]) {
  assert.deepEqual([-.3, -.14, 0, .14, .3].map(bank => art.raidBankingFrameIndex(bank, landscape, false)),
    [0, 0, 3, 6, 6].map(i => i + offset))
  assert.equal(art.raidBankingFrameIndex(.14, landscape, true), 3 + offset)
}
// Flight atlases are always nose-up before the game's rotating landscape
// camera. Preview cards must apply that same quarter-turn to the hull and
// nozzle roots, without changing the portrait view.
assert.equal(art.raidBankingPreviewAngle(false), 0)
assert.equal(art.raidBankingPreviewAngle(true), 90)
assert.deepEqual(art.raidBankingPreviewNozzle(.09, .42, false), {x:.09, y:.42})
assert.deepEqual(art.raidBankingPreviewNozzle(.09, .42, true), {x:-.42, y:.09})
for (const landscape of [false, true]) {
  for (const bank of [-.14, -.08, -.035, 0, .028, .08, .14]) {
    const index = art.raidBankingFrameIndex(bank, landscape, false) % art.BANKING_COLUMNS
    const bakedAngle = (index - 3) * (.14 / 3)
    const remainingAngle = art.raidBankingResidualAngle(bank, landscape, false)
    assert.ok(Math.abs(bakedAngle + remainingAngle - bank) < 1e-9,
      'subframe roll should complete—not double—the selected baked bank')
    assert.ok(Math.abs(remainingAngle) <= .14/6 + 1e-12)
  }
  assert.equal(art.raidBankingResidualAngle(.12, landscape, true), 0)
}
// New atlases must originate from the unsharpened v1 source, never v2/v3.
const baker = readFileSync('scripts/match-3d-to-2d-palette.py', 'utf8')
assert.match(baker, /source=directory\/\(key\+"-v1.webp"\)/)
assert.match(baker, /ImageFilter.MedianFilter\(size=3\)/)
assert.doesNotMatch(baker, /ImageFilter\.UnsharpMask\(/)
assert.match(baker, /"-v7.webp"/)
const preview = readFileSync('src/components/games/RaidShipSprite.tsx', 'utf8')
assert.match(preview, /drawRaidBankingCell\(ctx, sprite, raidBankingFrameIndex\(0, viewLandscape, false\)/)
assert.match(preview, /raidBankingPreviewAngle\(viewLandscape\)/)
// Gundam/Spiegel use the original 2D artwork for landscape play and all selection views.
for (const key of ['godGundam', 'godGundamBurning', 'spiegel', 'coreLander',
                   'coreLanderBurning', 'coreLanderElite', 'coreLanderBurningElite']) {
  assert.equal(art.isRaidGundamArt(key), true, key)
  assert.equal(art.shouldUseRaidBankingArt(key, true), false, key)
  assert.equal(art.getRaidBankingFrame(key, .12, true, false), null, key)
  assert.equal(art.shouldUseRaidBankingArt(key, false), true, key)
}
assert.equal(art.isRaidGundamArt('rocket'), false)
assert.equal(art.shouldUseRaidBankingArt('rocket', true), true)
assert.ok(preview.includes('getRaidPicker3DPreviewUrl'), 'ship-picker must use HD 3D previews')
assert.ok(preview.includes('RaidShipPickerPreview'), '3D selection component must exist')
const picker = readFileSync('src/components/games/raid/GradiusRaidRuntime.tsx', 'utf8')
assert.ok(picker.includes('<RaidShipPickerPreview shipKey={shipSpriteKey} landscape={landscape} />'))
assert.ok(!picker.includes('<small>{locked ? lockedCopy : shipCopy.role}</small>'), 'ship cards show names only')
assert.ok(source.includes('${key}-v8.webp'), 'clean Mesiah textures must be addressed by renderer')
for (const key of ['mesiah', 'mesiahBlack', 'mesiahWhite']) {
  assert.match(art.getRaidBankingAtlasUrl(key), /-v8\\.webp$/, key)
}
for (const key of ['rocket', 'xwing', 'spaceEt', 'godGundam']) {
  assert.match(art.getRaidBankingAtlasUrl(key), /-v7\\.webp$/, key)
}
for (const key of ['mesiahBlack', 'mesiahWhite']) {
  const image = readFileSync(bankingDir + key + '-v8.webp')
  assert.equal(image.toString('ascii', 0, 4), 'RIFF', key)
  assert.equal(image.toString('ascii', 8, 12), 'WEBP', key)
}
const previews = readdirSync('public/assets/ships/previews').filter(name => name.endsWith('-v1.webp'))
const expectedPreviews = Object.keys(registrations).flatMap(key => [
  key + '-portrait-v1.webp', key + '-landscape-v1.webp'
]).sort()
assert.deepEqual(previews.sort(), expectedPreviews, 'Every 3D ship requires both HD selector views')
for (const name of previews) {
  const image = readFileSync('public/assets/ships/previews/' + name)
  assert.equal(image.toString('ascii', 0, 4), 'RIFF', name)
  assert.equal(image.toString('ascii', 8, 12), 'WEBP', name)
  assert.ok(image.byteLength > 2048, name)
}
assert.match(source, /assets\/ships\/banking\/\$\{key\}-v7.webp/)

assert.equal(art.getRaidBankingAtlasUrl('mesiah'), art.getRaidBankingAtlasUrl('mesiahBlack'))
assert.equal(art.getRaidBankingFrame('toString', 0, false, false), null)
assert.equal(art.getRaidBankingFrame('rocket', 0, false, false), null, 'keep the original sprite until the atlas loads')
assert.equal(art.getBankingProtectionHull(art.getRaidBankingAtlas('laser'), true).frame, 10)
for (const [key, entry] of Object.entries(registrations)) {
  const sourceImage = readFileSync('public/assets/ships/banking/' + key + '-v1.webp')
  const image = readFileSync('public/assets/ships/banking/' + key + '-v7.webp')
  assert.equal(image.toString('ascii', 0, 4), 'RIFF', key)
  assert.equal(image.toString('ascii', 8, 16), 'WEBPVP8X', key)
  assert.equal(sourceImage.readUIntLE(24, 3) + 1, 224 * art.BANKING_COLUMNS, key)
  assert.equal(sourceImage.readUIntLE(27, 3) + 1, 224 * art.BANKING_ROWS, key)
  assert.equal(image.readUIntLE(24, 3) + 1, art.BANKING_CELL * art.BANKING_COLUMNS, key)
  assert.equal(image.readUIntLE(27, 3) + 1, art.BANKING_CELL * art.BANKING_ROWS, key)
  assert.ok(image.byteLength > 10000, key + ': enhanced atlas must be a nonempty WebP image')
  assert.equal(entry.nozzles.length, 14, key)
  for (const outlets of entry.nozzles) {
    assert.ok(outlets.length > 0, key)
    for (const [x, y, aperture] of outlets) {
      assert.ok(Math.abs(x) < .5 && y >= 0 && y < .5 && aperture > 0 && aperture < .18, key)
    }
  }
  if (entry.wing) {
    assert.equal(entry.wing.length, 14, key)
    for (const tips of entry.wing) {
      assert.equal(tips.length, 4, key)
      assert.ok(tips.every(([x, y]) => Math.abs(x) < .5 && y < 0 && y > -.5), key)
    }
  }
}
const { createRaidMainShotEmitter, getRaidPlayerHullSize } = await compile(
  readFileSync(path + 'playerMuzzle.ts', 'utf8').replace(/^import .*\n/gm, '') + '\nconst WIDTH = 100, HEIGHT = 100;\n',
)
const tips = art.getRaidBankingFrame('xwingElite', .12, true, false).wing
const ship = { x: 45, y: 63 }, shots = [], bank = .12
const emit = createRaidMainShotEmitter(shot => shots.push(shot), ship, 'xwing', false, 400, 800, bank, true, 1, null, tips)
emit({ x: 50, y: 60, vx: 2, vy: -80 }, 'inner')
const size = getRaidPlayerHullSize('xwing', 400, true)
const [x, y] = tips[3]
assert.equal(shots[0].x, ship.x + (Math.cos(bank) * x - Math.sin(bank) * y) * (size * 100 / 400))
assert.equal(shots[0].y, ship.y + (Math.sin(bank) * x + Math.cos(bank) * y) * (size * 100 / 800))
assert.equal(shots[0].vy, -80)
console.log('27 banking atlases, seven banks, both views, reduced motion, fallback and cannon registration verified')
