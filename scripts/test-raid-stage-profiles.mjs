import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8')
const raid = 'src/components/games/raid/'
const withoutImports = source => source.replace(/^import .*\n/gm, '')
const profileSource = withoutImports(read(raid + 'stageEncounters.ts'))
const cruiseSource = withoutImports(read(raid + 'cruiseEncounters.ts'))
const tacticsSource = withoutImports(read(raid + 'enemyTactics.ts')).replace('const clamp=', 'const clampTactic=').replaceAll('clamp(', 'clampTactic(')
const runtime = read(raid + 'GradiusRaidRuntime.tsx')
const section = (start, end) => {
  const first = runtime.indexOf(start)
  const last = runtime.indexOf(end, first)
  assert.ok(first >= 0 && last > first, start)
  return runtime.slice(first, last)
}
const spawnSource = section('  const spawnEnemyAt = useCallback', '  const spawnBoss = useCallback')
const fireSource = section('  const fireEnemy = useCallback', '  const beginCarrierRecovery = useCallback')
const harness = `
const useCallback = fn => fn
const markBossAttack = () => {}
let enemyId = 0, shotId = 0
const stageRef = { current: 1 }, waveRef = { current: 1 }, wingSerialRef = { current: 0 }
const playerRef = { current: { x: 50, y: 83 } }, enemyHpMultRef = { current: 1 }
const enemiesRef = { current: [] }, enemyShotsRef = { current: [] }, bossTimerRef = { current: 90 }
const getPowerScore = () => 4, isCoOpActive = () => false
const getMaxActiveEliteEnemies = () => 2, getEliteEnemyChance = () => 1
const pickEliteEnemyKind = () => 'lancer', RAID_ELITE_SPRITE_COUNT = 5
const DARK_ENEMY_COLORS = ['#a05'], MINI_BOSS_COLORS = { lancer: '#f80' }
const clamp = (value, min, max) => Math.max(min, Math.min(max, value))
const MULTIPLAYER_MAX_ENEMY_SHOTS = 140
const emitCommandBossShot = shot => enemyShotsRef.current.push({ ...shot, id: ++shotId })
`
const wrapper = `
export function formation(stage, serial, liveEnemies = 0) {
  stageRef.current = waveRef.current = stage
  wingSerialRef.current = serial
  enemiesRef.current = Array.from({ length: liveEnemies }, () => ({ hp: 1 }))
  spawnFormation()
  return { enemies: enemiesRef.current.slice(liveEnemies), next: wingSerialRef.current }
}
export function cruise(stage, serial, { liveEnemies = 0, bossRemaining = 90 } = {}) {
  stageRef.current = waveRef.current = stage
  wingSerialRef.current = serial
  bossTimerRef.current = bossRemaining
  enemiesRef.current = Array.from({ length: liveEnemies }, () => ({ hp: 1 }))
  const interval = spawnCruiseEncounter()
  return { enemies: enemiesRef.current.slice(liveEnemies), next: wingSerialRef.current, interval }
}
export function fire(enemy, target, queued = 0) {
  enemyShotsRef.current = Array.from({ length: queued }, () => ({}))
  fireEnemy(enemy, target, 0)
  return enemyShotsRef.current.slice(queued)
}
`
const code = ts.transpileModule(profileSource + cruiseSource + tacticsSource + harness + spawnSource + fireSource + wrapper, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText
const api = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'))
const layouts = new Set()
const signatures = new Set()
const foundDebut = new Map()
for (let stage = 1; stage <= 15; stage++) {
  const profile = api.getRaidStageEncounter(stage)
  assert.deepEqual(api.getRaidStageEncounter(stage + 15), profile)
  assert.ok(profile.interval >= 4 && profile.interval <= 5.2)
  signatures.add(JSON.stringify(profile.wings))
  for (let serial = 0; serial < 3; serial++) {
    const { enemies, next } = api.formation(stage, serial)
    const wing = profile.wings[serial]
    layouts.add(wing[0])
    assert.equal(next, serial + 1)
    assert.equal(enemies.length, wing.length - 1)
    assert.equal(new Set(enemies.map(enemy => enemy.vy)).size, 1, 'ships lost vertical formation spacing')
    for (const [index, enemy] of enemies.entries()) {
      const role = wing[index + 1]
      if (!foundDebut.has(role)) foundDebut.set(role, stage)
      assert.equal(enemy.variant, api.LEGACY_FIGHTER_COUNT + role)
      assert.ok(!enemy.isMiniBoss && enemy.hp > 0)
      assert.ok(enemy.x >= 8 && enemy.x <= 92 && enemy.y > -40 && enemy.y < 0)
      assert.ok(index === 0 || enemy.fireCooldown > enemies[index - 1].fireCooldown)
      for (const formationAge of [.1, 1, 2.4, 6]) {
        const x = api.getRaidFighterPathX({ ...enemy, formationAge })
        assert.ok(x >= 4 && x <= 96, 'formation drifted outside the playfield')
      }
    }
    assert.equal(api.formation(stage, serial, 31).enemies.length, 1)
    assert.deepEqual(api.formation(stage, serial, 32), { enemies: [], next: serial })
  }
}
assert.equal(signatures.size, 15)
assert.equal(layouts.size, 6)
assert.deepEqual(api.RAID_FIGHTER_DEBUT_STAGES, api.RAID_FIGHTERS.map((_, role) => foundDebut.get(role)))
for (const [role, asset] of api.RAID_FIGHTER_ASSETS.entries()) {
  const image = readFileSync(new URL('../public/' + asset, import.meta.url))
  assert.equal(image.toString('ascii', 8, 12), 'WEBP')
  assert.ok(image.length < 16_000)
  const fighter = api.RAID_FIGHTERS[role]
  const enemy = { x: 50, y: 26, fireCooldown: .1, variant: api.LEGACY_FIGHTER_COUNT + role, isBoss: false, isMiniBoss: false }
  const pilot = { x: 68, y: 80 }
  const shots = api.fire(enemy, pilot)
  assert.equal(shots.length, fighter.shots)
  assert.ok(shots.every(shot => shot.kind === fighter.kind && shot.vy > 0 && shot.damage === 1))
  assert.equal(api.fire(enemy, pilot, 133 - fighter.shots).length, 0, 'partial volley escaped the shared budget')
  assert.equal(api.fire(enemy, { x: 50, y: 32 }).length, 0, 'ship fired at point-blank range')
  assert.equal(api.getRaidFighterCharge({ ...enemy, y: -1 }), 0)
  assert.equal(api.getRaidFighterCharge(enemy) > 0, fighter.shots > 0)
}
// Pursuit is role-specific, bounded, and never starts during formation entry.
const formationEnemy = { originX: 50, x: 50, y: 50, formationAge: 2, formationMotion: 0, phase: 0, trainSlot: 0 }
for (const role of [0,1,2,3,4,5]) {
  const ship = { ...formationEnemy, variant: api.LEGACY_FIGHTER_COUNT + role }
  const left = api.getRaidFighterPathX(ship, { x: 0, y: 80 })
  const right = api.getRaidFighterPathX(ship, { x: 100, y: 80 })
  assert.ok(left >= 4 && right <= 96)
  if (role === 1 || role === 3) assert.ok(right > left, 'pursuit should follow the pilot lane')
  else assert.equal(right, left, 'non-pursuit role should retain its own path')
  assert.equal(api.getRaidFighterPathX({ ...ship, y: 0 }, { x: 0, y: 80 }), api.getRaidFighterPathX({ ...ship, y: 0 }, { x: 100, y: 80 }))
}
console.log('Raid stages: 15 unique rotations, six layouts and aircraft, formation integrity, authored shots and live caps passed')


const ram = { ...formationEnemy, y: 24, variant: api.LEGACY_FIGHTER_COUNT+3 }
api.commitRaidFighterManeuver(ram,{x:70,y:80})
assert.equal(ram.fighterAimX,70)
api.commitRaidFighterManeuver(ram,{x:10,y:80})
assert.equal(ram.fighterAimX,70,'committed ram must not retarget after warning')
assert.ok(api.getRaidFighterSpeedScale(ram)<1)
assert.ok(api.getRaidFighterCharge({...ram,y:35})>0)
assert.ok(api.getRaidFighterSpeedScale({...ram,y:41})>1)

const routes = new Set()
for (let stage = 2; stage <= 15; stage++) {
  const route = Array.from({ length: 11 }, (_, slot) => api.getCruiseEncounter(stage, slot))
  routes.add(route.map(beat => beat.elite ?? beat.maneuver).join(','))
  assert.ok(new Set(route.map(beat => beat.maneuver)).size >= 4)
  const eliteSlots = route.flatMap((beat, slot) => beat.elite ? [slot] : [])
  assert.equal(eliteSlots.length, 2)
  assert.notEqual(route[eliteSlots[0]].elite, route[eliteSlots[1]].elite)
  for (const slot of eliteSlots) {
    const { enemies, next, interval } = api.cruise(stage, slot)
    assert.equal(next, slot + 1)
    assert.equal(interval, route[slot].interval)
    assert.equal(enemies.filter(enemy => enemy.isMiniBoss).length, 1)
    assert.ok(enemies.every(enemy => enemy.squadId === enemies[0].squadId))
    assert.ok(enemies.slice(1).every(enemy => enemy.cruiseManeuver === 'escort'))
    assert.equal(api.cruise(stage, slot, { bossRemaining: 14 }).next, slot + 1)
  }
  assert.equal(api.cruise(stage, 0, { liveEnemies: 31 }).next, 0)
}
assert.equal(routes.size, 14)
assert.equal(api.getCruiseOpeningLayout(1), 'chevron')
assert.equal(api.getCruiseOpeningLayout(3), 'line')
assert.equal(api.getCruiseOpeningLayout(4), 'echelon')
assert.equal(api.getCruiseOpeningLayout(5), 'split')

const pincer = api.cruise(2, 1).enemies
assert.ok(pincer[0].y > pincer[1].y)
assert.ok(pincer[0].x < 50 && pincer[1].x > 50)
const artillery = api.cruise(3, 0).enemies.map(enemy => ({ ...enemy, y: 19 }))
new api.EnemyTactics().update(artillery, .1, 3, 1, { x: 62, y: 85 })
assert.ok(artillery.every(enemy => Math.abs(enemy.x - 50) >= 16 && enemy.tacticHoldFire))
const escortGroup = api.cruise(2, 3).enemies
const elite = escortGroup[0]
escortGroup.slice(1).forEach(enemy => { enemy.y = 26 })
const tactics = new api.EnemyTactics()
tactics.update(escortGroup, .1, 2, 1, { x: 50, y: 85 })
assert.ok(escortGroup.slice(1).every(enemy => !enemy.tacticHoldFire))
elite.hp = 0
tactics.update(escortGroup, .1, 2, 1, { x: 50, y: 85 })
assert.ok(escortGroup.slice(1).every(enemy => enemy.tacticHoldFire && enemy.tacticSpeed > 1))
const attackCycles = {
  lancer: [['drill', 4], ['crossfire', 6], ['rail', 3]],
  stalker: [['knives', 4], ['flank', 3], ['fan', 6]],
  brood: [['launch', 0], ['pods', 4], ['screen', 6]],
}
for (const [kind, cycle] of Object.entries(attackCycles)) {
  const boss = { ...elite, miniBossKind: kind, x: 23, y: 24, hp: elite.maxHp }
  for (const [attack, shotCount] of [...cycle, cycle[0]]) {
    const target = { x: 48, y: 82 }
    api.beginCruiseEliteAttack(boss, target, true)
    assert.equal(boss.miniBossAttack, attack)
    assert.equal(boss.chargeTimer, api.getMiniBossWarningSeconds(attack))
    assert.ok(boss.chargeTimer >= .9 && boss.chargeCooldown >= 1.5)
    target.x = 80
    assert.equal(boss.chargeLane, 48, 'moving during the warning must not retarget it')
    const shots = []
    const emit = shot => shots.push(shot)
    assert.equal(api.fireCruiseEliteAttack(boss, shotCount - 1, emit), false)
    assert.equal(shots.length, 0, 'an over-budget volley must never partially fire')
    assert.equal(api.fireCruiseEliteAttack(boss, shotCount, emit), shotCount > 0)
    assert.equal(shots.length, shotCount)
    if (attack === 'drill') assert.ok(shots.every(shot => shot.vx === 0 && Math.abs(shot.x - 48) < 4))
    if (attack === 'crossfire' || attack === 'screen') assert.ok(shots.every(shot => shot.vx === 0 && Math.abs(shot.x - 48) >= 12))
    if (attack === 'flank') assert.ok(shots.every(shot => shot.x > 48 && shot.vx < 0))
    if (attack === 'rail') assert.ok(shots.some(shot => shot.kind === 'superShot'))
  }
}
const broodWithEscorts = { ...elite, miniBossKind: 'brood', hp: elite.maxHp }
api.beginCruiseEliteAttack(broodWithEscorts, { x: 50, y: 82 }, false)
assert.equal(broodWithEscorts.miniBossAttack, 'pods')
const wounded = { ...elite, miniBossKind: 'brood', hp: 1 }
api.beginCruiseEliteAttack(wounded, { x: 50, y: 82 }, false)
assert.ok(wounded.chargeCooldown < broodWithEscorts.chargeCooldown)
assert.equal(api.cruiseEliteShouldWithdraw(21, 60), true)
assert.equal(api.cruiseEliteShouldWithdraw(3, 2), true)
assert.equal(api.cruiseEliteShouldWithdraw(3, 12), false)
console.log('Cruise: 14 authored routes, staggered pincers, firing lines, elite escorts, all nine attack patterns, warning timing, and shot caps passed')

assert.equal(api.getCampaignCruiseSeconds(1), undefined, 'guided opening keeps its own timeline')
assert.equal(api.getCampaignCruiseSeconds(16), undefined, 'the optional bonus has its own approach')
const durations = new Set()
for (let stage = 2; stage <= 15; stage++) {
  const duration = api.getCampaignCruiseSeconds(stage)
  durations.add(duration)
  assert.ok(duration >= 76 && duration <= 90)
  let age = 3
  const eliteAppearances = []
  for (let serial = 0; serial < 11 && age < duration - api.CRUISE_BOSS_APPROACH_SECONDS; serial++) {
    const beat = api.getCruiseEncounter(stage, serial)
    if (beat.elite && duration - age >= 16) eliteAppearances.push(beat.elite)
    age += beat.interval
  }
  assert.equal(eliteAppearances.length, 2, 'the second elite needs its full approach window')
}
assert.ok(durations.size >= 6)

for (const [first, second] of [[api.formation(1, 1), api.formation(1, 4)], [api.cruise(2, 2), api.cruise(2, 6)]]) {
  const sweep = first.enemies
  assert.ok(sweep.every(enemy => enemy.cruiseManeuver === 'sweep'))
  assert.ok(sweep[0].y > sweep.at(-1).y)
  assert.notEqual(second.enemies[0].cruiseFlank, sweep[0].cruiseFlank)
  const side = sweep[0].cruiseFlank
  const swarm = new api.EnemyTactics()
  sweep.forEach(enemy => { enemy.y = 22 })
  swarm.update(sweep, 1 / 60, 2, 4, { x: 15, y: 85 })
  assert.ok(sweep.every(enemy => enemy.tacticHoldFire))
  const earlyX = sweep[0].tacticX
  sweep.forEach(enemy => { enemy.y = 54 })
  swarm.update(sweep, 1 / 60, 2, 4, { x: 85, y: 85 })
  assert.ok((earlyX - sweep[0].tacticX) * side > 35, 'sweep must cross from its entry side')
  assert.ok(sweep.every(enemy => !enemy.tacticHoldFire))
}

for (const fps of [30, 60, 120]) {
  for (const disrupted of [false, true]) {
    const crossfire = api.cruise(3, 2).enemies
    const tactics = new api.EnemyTactics()
    const shots = []
    const dt = 1 / fps
    assert.ok(crossfire.length <= 6 && crossfire.every(enemy => enemy.cruiseManeuver === 'crossfire'))
    crossfire.forEach(enemy => { enemy.y = 24 })
    for (let frame = 0; frame < 6 * fps; frame++) {
      const age = frame * dt
      if (disrupted && age >= 2.3) crossfire[0].hp = 0
      const pilot = age < 2.2 ? { x: 53, y: 83 } : { x: 20, y: 71 }
      tactics.update(crossfire, dt, 3, 5, pilot)
      if (age > 2 && age < 2.28) {
        assert.ok(crossfire.every(enemy => enemy.chargeTimer > 0 && enemy.tacticHoldFire))
        assert.ok(crossfire.every(enemy => api.getRaidFighterCharge(enemy) > 0))
      }
      for (const enemy of crossfire) {
        if (enemy.hp <= 0 || enemy.tacticHoldFire) continue
        assert.equal(enemy.chargeTargetY, 83)
        assert.ok(Math.abs(enemy.chargeLane - 53) >= 8)
        assert.equal(api.fire(enemy, pilot, 132).length, 0)
        shots.push(...api.fire(enemy, pilot, 0))
      }
    }
    assert.equal(shots.length, disrupted ? 0 : crossfire.length)
    for (const shot of shots) {
      const xAtTarget = shot.x + shot.vx / shot.vy * (83 - shot.y)
      assert.ok(Math.abs(Math.abs(xAtTarget - 53) - 8) < 1e-6, 'the marked center corridor stays open')
    }
  }
}
console.log('Campaign cadence, banked sweeps and locked, interruptible crossfire passed at 30/60/120 Hz')

const challengeSource = withoutImports(read(raid + 'cruiseChallenge.ts'))
const challenge = await import('data:text/javascript;base64,' + Buffer.from(ts.transpileModule(challengeSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText).toString('base64'))

for (let stage = 2; stage <= 15; stage++) {
  const kind = challenge.createCruiseChallenge(stage).kind
  const budget = challenge.CHALLENGE_NOTICE_SECONDS + (kind === 'relay'
    ? challenge.RELAY_GATE_COUNT * challenge.RELAY_GATE_SECONDS : challenge.SALVAGE_SECONDS)
  assert.ok(challenge.getCruiseChallengeStartAge(stage) + budget + 2.4 < api.getCampaignCruiseSeconds(stage) - api.CRUISE_BOSS_APPROACH_SECONDS)
}

function pilotAtTarget(operation, hp = 5) {
  const { x, y } = challenge.getCruiseChallengeTarget(operation)
  return { x, y, hp }
}

const relay = challenge.createCruiseChallenge(2)
const captain = pilotAtTarget(relay)
assert.equal(challenge.advanceCruiseChallenge(relay, 1, [captain]), undefined)
assert.equal(relay.gate, 0, 'the notice is not an active gate')
assert.equal(challenge.advanceCruiseChallenge(relay, .5, [captain]), undefined)
assert.equal(relay.gate, 1)
const position = challenge.getCruiseChallengeTarget(relay)
assert.notEqual(position.x, captain.x)
challenge.advanceCruiseChallenge(relay, .1, [pilotAtTarget(relay, 0)])
assert.equal(relay.gate, 1, 'downed pilots cannot cross a gate')
const wingmate = pilotAtTarget(relay)
challenge.advanceCruiseChallenge(relay, .1, [captain, wingmate])
assert.equal(relay.gate, 2, 'the second pilot can advance the same challenge')
Object.assign(wingmate, pilotAtTarget(relay))
assert.equal(challenge.advanceCruiseChallenge(relay, .1, [wingmate]), wingmate)
assert.equal(challenge.advanceCruiseChallenge(relay, .1, [wingmate]), undefined, 'the reward can only be collected once')

const missed = challenge.createCruiseChallenge(4)
for (let i = 0; i < 500; i++) challenge.advanceCruiseChallenge(missed, 1 / 60, [])
assert.equal(missed.outcome, 'missed')

for (const fps of [30, 60, 120]) {
  const recovery = challenge.createCruiseChallenge(3)
  const dt = 1 / fps
  for (let i = 0; i < 2 * fps; i++) challenge.advanceCruiseChallenge(recovery, dt, [pilotAtTarget(recovery)])
  const before = recovery.signal
  for (let i = 0; i < fps; i++) challenge.advanceCruiseChallenge(recovery, dt, [])
  assert.ok(before > .5 && recovery.signal === 0, 'leaving the field loses the signal')
  let completions = 0
  for (let i = 0; i < 4 * fps; i++) {
    if (challenge.advanceCruiseChallenge(recovery, dt, [pilotAtTarget(recovery)])) completions++
  }
  assert.equal(recovery.outcome, 'complete')
  assert.equal(completions, 1)
  assert.ok(Math.abs(recovery.outcomeAge - 5.4) <= dt + 1e-8)
}
const abandoned = challenge.createCruiseChallenge(5)
challenge.advanceCruiseChallenge(abandoned, 11.5, [])
assert.equal(abandoned.outcome, 'missed')
console.log('Cruise challenges: sequential gates, co-op contribution, single rewards, salvage lock and expiry passed')
