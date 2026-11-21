import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const read = name => readFileSync(new URL('../src/components/games/raid/' + name + '.ts', import.meta.url), 'utf8')
// Run the actual simulation functions without loading browser artwork or audio.
function declarations(file, names) {
  const source = read(file)
  const ast = ts.createSourceFile(file + '.ts', source, ts.ScriptTarget.Latest, true)
  return ast.statements.filter(node => names.includes(node.name?.text) ||
    (ts.isVariableStatement(node) && node.declarationList.declarations.some(d => names.includes(d.name.text))))
    .map(node => node.getText(ast)).join('\n')
}
const source = [
  `export const draws = []
  const getShipSpriteSize = () => 32
  const getShipCanvasSprite = key => ({ key, loaded: true })
  const getRaidSideShipCanvasSprite = getShipCanvasSprite
  const getRaidShipBaseVisualKey = key => key
  const getCoreLanderCombatModelFromVisualShipKey = () => null
  const drawSupportEngineTrail = () => {}
  const drawCanvasSprite = (_ctx, sprite, x, y) => draws.push({ key: sprite.key, x, y })
  const drawCanvasSpriteContain = drawCanvasSprite
  const getRaidPlayerFlightBank = () => .04
  const getRaidBankingFrame = () => null
  const PLAYER_COLOR = '#fff'`,
  declarations('mechArtwork', ['isRaid2DMech']),
  declarations('liveHullBridge', ['activeSink', 'bindLiveHulls', 'drawLiveHull']),
  declarations('constants', ['WEAPON_KEYS', 'SPACE_ET_FORCE_FIELD_REGEN_SECONDS', 'SPACE_ET_PASSIVE_FORCE_FIELD_CHARGES',
    'MESIAH_DRONE_MIN_FIRE_RANGE', 'MESIAH_DRONE_MAX_FIRE_RANGE', 'MESIAH_DRONE_HOME_OFFSET', 'MESIAH_DRONE_MOBILE_HOME_OFFSET', 'SCOUT_SUPPORT_PICKUP_SECONDS']),
  declarations('utils', ['clamp', 'distSq']),
  declarations('state', ['createMesiahDrones', 'normalizeMesiahDrones', 'createMesiahScoutDrones', 'normalizeMesiahScoutDrones', 'getOptionSupportStacks', 'activateScoutSupportPickup']),
  read('scoutFlight').replace(/^import .*\n/gm, ''),
  declarations('playerRender', ['mesiahLiveTargetsScratch', 'getMesiahDroneTarget', 'getMesiahScoutTargetBySlot', 'getMesiahDroneHome',
    'getMesiahDroneAttackPoint', 'getMesiahScoutSupportPoint', 'moveMesiahDroneToward', 'updateMesiahDrones', 'updateMesiahScoutDrones', 'drawRaidOptions']),
  declarations('mechanics', ['isCoreLanderBurning', 'updatePlayerTimers']),
].join('\n')
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText + '\n//# sourceURL=scout-flight-test-module.js'
const m = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'))
m.bindLiveHulls({ submitHull(draw) { m.draws.push(draw); return true } })
const weapons = () => Object.fromEntries(m.WEAPON_KEYS.map(key => [key, 0]))
const player = key => ({
  x: 50, y: 70, hp: 6, ship: { key }, optionStacks: 0, optionTimer: 0,
  fireCooldown: 0, weaponCooldowns: weapons(), mesiahDroneFireCooldown: 0, mesiahRocketCooldown: 0,
  mesiahDroneTimer: 1, mesiahDrones: m.createMesiahDrones(), mesiahScoutDrones: m.createMesiahScoutDrones(),
  shield: 0, invuln: 0, forceField: 5, passiveForceFieldRegen: 0,
})
const scouts = p => p.mesiahScoutDrones.filter(s => s.active)
const transforms = []
let transform = { a: 2, b: 0, c: 0, d: 2, e: 0, f: 0 }
const ctx = {
  canvas: { dataset: { raidDpr: '2' } }, globalAlpha: 1,
  getTransform: () => transform,
  save() { transforms.push({ ...transform }) },
  restore() { transform = transforms.pop() },
  translate(x, y) { transform.e += transform.a * x + transform.c * y; transform.f += transform.b * x + transform.d * y },
  rotate(angle) {
    const { a, b, c, d } = transform, cos = Math.cos(angle), sin = Math.sin(angle)
    Object.assign(transform, { a: a * cos + c * sin, b: b * cos + d * sin, c: c * cos - a * sin, d: d * cos - b * sin })
  },
}
function advance(p, seconds, landscape, enemies = [], small = true, dt = 1 / 60) {
  for (let remaining = seconds; remaining > 1e-9; remaining -= dt) m.updatePlayerTimers(p, Math.min(dt, remaining), enemies, small, landscape)
}

for (const landscape of [false, true]) for (const small of [false, true]) {
  for (const key of ['rocket', 'fast', 'laser', 'gatling', 'xwing', 'spaceEt', 'coreLander', 'dreadnought', 'mesiah']) {
    const p = player(key)
    m.activateScoutSupportPickup(p)
    advance(p, 0, landscape)
    m.updatePlayerTimers(p, 0, [], small, landscape)
    assert.equal(scouts(p).length, 2, key)
    for (const s of scouts(p)) {
      assert.ok((landscape ? s.x : s.y) > 100, 'arrival starts below the visible screen')
      assert.equal(s.canFire, false)
    }
    advance(p, 1.2, landscape, [], small)
    assert.ok(scouts(p).every(s => s.flightPhase === 'active' && s.canFire), key)
    assert.equal(p.mesiahDrones.filter(s => s.active).length, key === 'mesiah' ? 2 : 0, 'built-in escorts unchanged')

    // A refresh extends the timer without sending existing escorts through another arrival.
    m.activateScoutSupportPickup(p)
    m.updatePlayerTimers(p, 0, [], small, landscape)
    assert.ok(scouts(p).filter(s => s.stack === 0).every(s => s.flightPhase === 'active'))
    if (key === 'mesiah') {
      assert.equal(scouts(p).length, 4)
      assert.ok(scouts(p).filter(s => s.stack === 1).every(s => s.flightPhase === 'arriving' && !s.canFire))
    }
    advance(p, 19.99, landscape, [], small)
    assert.ok(p.optionTimer > 0)
    advance(p, 0.02, landscape, [], small)
    assert.equal(p.optionStacks, 0)
    assert.equal(p.optionTimer, 0)
    assert.ok(scouts(p).length >= 2, 'expiry keeps departing hulls visible')
    assert.ok(scouts(p).every(s => s.flightPhase === 'departing' && !s.canFire && s.targetId === null))
    m.draws.length = 0
    m.drawRaidOptions(ctx, p, v => v * 4, v => v * 7, small ? 390 : 900, 1000, '#fff', key, landscape)
    assert.equal(m.draws.length, scouts(p).length + (key === 'dreadnought' || key === 'mesiah' ? 2 : 0), 'expired escorts still render during departure')
    const departure = scouts(p).map(s => s.y)
    advance(p, 0.3, landscape, [], small)
    scouts(p).forEach((s, i) => assert.ok(s.y < departure[i], 'departure flies forward'))
    advance(p, 0.6, landscape, [], small)
    assert.equal(scouts(p).length, 0, 'removed only after reaching offscreen')
    m.draws.length = 0
    m.drawRaidOptions(ctx, p, v => v, v => v, 390, 1000, '#fff', key, landscape)
    assert.equal(m.draws.length, key === 'dreadnought' || key === 'mesiah' ? 2 : 0, 'departure removes pickup sprites while retaining built-in escorts')

    // Preset loadouts retain permanent support and older packets can omit flight state.
    p.optionStacks = key === 'mesiah' ? 2 : 1
    advance(p, 22, landscape, [], small)
    assert.equal(scouts(p).length, key === 'mesiah' ? 4 : 2)
    assert.ok(scouts(p).every(s => s.canFire))
  }
}

// Reacquiring support during departure reverses smoothly from its current position.
const p = player('mesiah')
m.activateScoutSupportPickup(p)
advance(p, 2, false)
p.optionTimer = 0.01
advance(p, 0.15, false)
const before = { ...scouts(p)[0] }
m.activateScoutSupportPickup(p)
m.updatePlayerTimers(p, 0, [], true, false)
assert.equal(scouts(p)[0].x, before.x)
assert.equal(scouts(p)[0].y, before.y)
assert.equal(scouts(p)[0].flightPhase, 'arriving')
assert.equal(scouts(p)[0].canFire, false)
advance(p, 1.3, false, [{ id: 1, x: 50, y: 35, hp: 100, isBoss: true }])
assert.ok(scouts(p).some(s => s.targetId === 1), 'Mesiah resumes boss targeting after arrival')

// Missing flight fields from older clients preserve already-active support.
const oldScout = { x: 45, y: 72, side: -1, stack: 0, rotation: 0, active: true, canFire: true }
assert.equal(m.updateScoutFlight(oldScout, true, { x: 45, y: 72 }, 0.016, false), false)
assert.equal(oldScout.flightPhase, 'active')
console.log('Scout flights: portrait/landscape, all ships, timer expiry, refreshes, stacked Mesiah, reacquisition, presets and older packets passed')

// Exercise real Canvas-to-Three submission: rotations pivot at the hull, retain
// its identity/bank and stay aligned with world coordinates at renderer DPR 2.
for (const landscape of [false, true]) {
  const p = player('rocket')
  m.activateScoutSupportPickup(p)
  advance(p, .15, landscape)
  m.draws.length = 0
  m.drawRaidOptions(ctx, p, v => v * 4, v => v * 7, 390, 1000, '#fff', 'rocket', landscape)
  const ids = m.draws.map(d => d.id)
  for (const draw of m.draws) {
    const scout = scouts(p).find(s => draw.id.endsWith(':' + s.side))
    assert.ok(Math.abs(draw.x - scout.x * 4) < 1e-8)
    assert.ok(Math.abs(draw.y - scout.y * 7) < 1e-8)
    assert.ok(Math.abs(draw.angle + scout.rotation) < 1e-8)
    assert.equal(draw.landscape, landscape)
    assert.equal(draw.bank, .04)
  }
  advance(p, 1.2, landscape)
  p.optionTimer = .01
  advance(p, .2, landscape)
  m.draws.length = 0
  m.drawRaidOptions(ctx, p, v => v * 4, v => v * 7, 390, 1000, '#fff', 'rocket', landscape)
  assert.deepEqual(m.draws.map(d => d.id), ids, 'same pooled Three actors survive into departure')
}
console.log('Scout Canvas/Three bridge: positions, headings, DPR, banking and pooled actor identities passed')
