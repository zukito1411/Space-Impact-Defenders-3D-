import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
const read = name => readFileSync(new URL('../src/components/games/raid/' + name, import.meta.url), 'utf8')
const source = read('combatFeel.ts') + '\n' + read('travelMotion.ts').replace(/^import .*\n/gm, '')
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText
const { RaidTravelMotion } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'))
function run(hz) {
  const motion = new RaidTravelMotion()
  motion.update(0, 0, 1, 50, 65)
  for (let i = 1; i <= hz * 6; i++) {
    const t = i / hz
    motion.update(t * 1000, t <= 2 ? 0 : t <= 4 ? 1 : 0, 1, 90, 25)
  }
  return motion
}
const baseline = run(60)
for (const hz of [30, 120, 144]) {
  const other = run(hz)
  assert.ok(Math.abs(other.far - baseline.far) < 0.00001, `far differs at ${hz}Hz`)
  assert.ok(Math.abs(other.near - baseline.near) < 0.00001, `near differs at ${hz}Hz`)
  assert.ok(Math.abs(other.x - baseline.x) < 0.00001, `parallax differs at ${hz}Hz`)
}
const motion = new RaidTravelMotion()
motion.update(1e8, 0, 1, 50, 65)
const before = motion.near
motion.update(1e8 + 16, 1, 1, 100, 100)
assert.ok(motion.near > before && motion.near - before < 4, 'rush transition teleported starfield')
const prior = motion.near
motion.update(1e8 + 60000, 1, 1, 100, 100)
assert.ok(motion.near - prior < 25, 'tab resume jumped forward')
assert.ok(Math.abs(motion.x) <= 1 && Math.abs(motion.y) <= 1, 'parallax exceeds bounds')
const steer = new RaidTravelMotion()
steer.update(0, 0, 1, 50, 65)
for (let step = 1; step <= 20; step++) steer.update(step * 16, 0, 1, 50 + step * .8, 65)
assert.ok(steer.drift > .8, 'moving right should set the lateral scenery drift')
for (let step = 21; step <= 40; step++) steer.update(step * 16, 0, 1, 66 - (step - 20) * .8, 65)
assert.ok(steer.drift < -.8, 'reversing direction should reverse the scenery drift')
steer.update(900, 0, 1, 50, 65)
assert.equal(steer.drift, 0, 'resume should clear the visual bank')
console.log('Travel: 30/60/120/144Hz agreement, rush continuity, resume and parallax bounds passed')

const cueCode = ts.transpileModule('const HEIGHT=100,WIDTH=100,PLAYER_RADIUS=3.2; const getRaidPlayerHitRadius=p=>PLAYER_RADIUS*(p.sizeScale??1);\n' +
  read('flightCues.ts').replace(/^import .*\n/gm, ''), { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText
const cues = await import('data:text/javascript;base64,' + Buffer.from(cueCode).toString('base64'))
const pilot = { x: 50, y: 75, hp: 1, maxHp: 4 }
const shot = { x: 55.6, y: 75.6, vx: 0, vy: 30, kind: 'boss', radius: 1.5 }
assert.equal(cues.passesNearPilot(shot, pilot, .025), true)
assert.equal(cues.passesNearPilot({ ...shot, x: 53 }, pilot, .025), false, 'collision should not sound like a dodge')
assert.equal(cues.passesNearPilot({ ...shot, y: 76.4 }, pilot, .025), false, 'a flyby should trigger only once')
assert.equal(cues.passesNearPilot({ ...shot, kind: 'beam' }, pilot, .025), false)
assert.equal(cues.needsRepair(pilot), true)
assert.equal(cues.needsRepair({ ...pilot, hp: 0 }), false)
assert.equal(cues.needsRepair({ ...pilot, hp: 2 }), false)
const farAsteroid = { x: 50, y: -18, vx: 0, vy: 14, radius: 5, hp: 10 }
const incoming = { x: 48, y: -12, vx: 2, vy: 28, radius: 5, life: 2 }
assert.equal(cues.findIncomingHazard([farAsteroid], [incoming], pilot), incoming)
assert.equal(cues.findIncomingHazard([farAsteroid], [{ ...incoming, x: 4 }], pilot), undefined)
assert.equal(cues.findIncomingHazard([], [{ ...incoming, y: 12 }], pilot), undefined)
assert.equal(cues.findIncomingHazard([], [{ ...incoming, life: 0 }], pilot), undefined)
console.log('Flight cues: close-pass detection, repair thresholds, and nearest offscreen hazard passed')

const mechanics = read('mechanics.ts')
const clearStart = mechanics.indexOf('export function animateStageClearPlayer(')
const clearSource = 'const clamp = (value, min, max) => Math.max(min, Math.min(max, value));\n' +
  mechanics.slice(clearStart, mechanics.indexOf('export function movePlayerWithInput(', clearStart))
const clearCode = ts.transpileModule(clearSource, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText
const { animateStageClearPlayer } = await import('data:text/javascript;base64,' + Buffer.from(clearCode).toString('base64'))
const idle = { x: 50, y: 80, invuln: 0 }
const steering = { ...idle }
animateStageClearPlayer(idle, .1, 50)
animateStageClearPlayer(steering, .1, 50, {x: 96, y: 80})
assert.ok(steering.x > idle.x && steering.x < 61)
assert.equal(steering.y, idle.y, 'lateral steering should preserve departure timing')
animateStageClearPlayer(steering, .1, 50, null, new Set(['arrowleft']))
assert.ok(steering.x < 50)
console.log('Departure: keyboard and pointer steering preserve forward flight')

const ambushSource = read('events.ts').replace(/^import .*\n/gm, '')
const ambushCode = ts.transpileModule(ambushSource, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText
const ambush = await import('data:text/javascript;base64,' + Buffer.from(ambushCode).toString('base64'))
for (const [difficulty, expected] of [['easy',6],['normal',9],['hard',10],['expert',11]]) {
 let total=0
 for (let wave=0;wave<3;wave++) {
  total+=ambush.getRaidAmbushWaveSize(difficulty,wave,total)
  for (let slot=0;slot<4;slot++) {
   const x=ambush.getRaidAmbushLane(22.4,wave,slot)
   assert.ok(wave%2===0 ? x<40 : x>60, 'ambush flanks should alternate with an open center on entry')
  }
 }
 assert.equal(total,expected)
 assert.equal(ambush.getRaidAmbushWaveSize(difficulty,3,total),0)
 assert.equal(ambush.getRaidAmbushWaveSize(difficulty,0,31),1)
 assert.equal(ambush.getRaidAmbushWaveSize(difficulty,1,32),0)
}
assert.ok(2*ambush.RAID_AMBUSH_WAVE_SPACING < ambush.getRandomEventDuration('ambush'))
console.log('Ambush: three waves, alternating flank lanes, difficulty counts and live enemy cap passed')

const runtime = read('GradiusRaidRuntime.tsx')
const ambushStart = runtime.indexOf("        } else if (activeRandomEvent.kind === 'ambush'")
const ambushEnd = runtime.indexOf('\n        }', runtime.indexOf('activeRandomEvent.ambushWave =', ambushStart))
assert.ok(ambushStart >= 0 && ambushEnd > ambushStart, 'could not locate the Raid ambush branch')
const ambushBody = runtime.slice(runtime.indexOf('{', ambushStart + 12) + 1, ambushEnd)
const integrationSource = ambushSource + `
export function playAmbush(difficulty, initialEnemies = 0) {
 const activeRandomEvent={kind:'ambush',duration:5.8,seed:22.4};
 const spawned=[];
 const stageRef={current:7}, waveRef={current:7}, raidDifficultyRef={current:difficulty};
 const enemiesRef={current:Array.from({length:initialEnemies},()=>({hp:100,isMiniBoss:false}))};
 const randomEventSpawnTimerRef={current:0};
 const pickEliteEnemyKind=()=> 'lancer', getMaxActiveEliteEnemies=()=>1, isCoOpActive=()=>false;
 const spawnEnemyAt=(x,y,wave,pattern,slot,style,elite)=>{
  spawned.push({x,y,elite});
  enemiesRef.current.push({hp:100,isMiniBoss:Boolean(elite)});
 };
 for(let round=0;round<4;round++){
  if(randomEventSpawnTimerRef.current>=activeRandomEvent.duration) break;
 ` + ambushBody + `
 }
 return spawned;
}`
const integratedAmbush = await import('data:text/javascript;base64,' +
 Buffer.from(ts.transpileModule(integrationSource,{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText).toString('base64'))
const normalAmbush=integratedAmbush.playAmbush('normal')
assert.equal(normalAmbush.length,9)
assert.equal(normalAmbush.filter(enemy=>enemy.elite).length,1)
assert.ok(normalAmbush.every(enemy=>enemy.y<0))
assert.equal(integratedAmbush.playAmbush('expert',30).length,2,'the actual spawn path must respect the live enemy cap')

const hazardCode = ts.transpileModule(
  'const RANDOM_EVENT_WARNING_SECONDS = 2.45; const clamp = (n, min, max) => Math.max(min, Math.min(n, max));\n' + ambushSource,
  { compilerOptions: { module: ts.ModuleKind.ESNext } },
).outputText
const hazards = await import('data:text/javascript;base64,' + Buffer.from(hazardCode).toString('base64'))
const event = { kind: 'rift', seed: 18, age: 3, duration: hazards.getRandomEventDuration('rift'), warning: 0 }
const hole = hazards.getBlackHole(event)
const crossingShot = { x: hole.x - 20, y: hole.y, vx: 2800, vy: 0 }
assert.equal(hazards.advanceRaidEventShot(crossingShot, 1 / 60, hole), false, 'fast shots must be captured when they cross the horizon')
const passingShot = { x: hole.x - 20, y: hole.y + 10, vx: 2800, vy: 0 }
assert.equal(hazards.advanceRaidEventShot(passingShot, 1 / 60, hole), true, 'shots clear of the horizon should survive')
assert.ok(passingShot.vy < 0, 'gravity should still bend a passing shot')
assert.equal(hazards.getBlackHole({ ...event, age: 0, warning: 1 }).strength, 0, 'the black hole must telegraph before applying gravity')

const front = hazards.getSolarWave({ ...event, kind: 'solar', age: 2 }, 0)
assert.equal(hazards.solarWaveHits(front, { x: front.gap, y: front.y }, 3, 1 / 60), false, 'the solar gap should be safe')
assert.equal(hazards.solarWaveHits(front, { x: 99 - front.gap, y: front.y }, 3, 1 / 60), true, 'the front should hit outside its gap')
assert.equal(hazards.solarWaveHits({ ...front, age: .5 }, { x: 99 - front.gap, y: front.y }, 3, 1 / 60), false, 'the charge phase must be safe')
assert.ok(hazards.getSolarWave(event, 1).gap - front.gap > 20, 'the next front should require a different lane')

const strike = { id: 1, x: 50, width: 8.4, warmup: 1, life: .68, duration: .68 }
assert.equal(hazards.ionStrikeIsLive(strike), false, 'charging lanes must be safe')
assert.equal(hazards.ionStrikeIsLive({ ...strike, warmup: 0, life: .6 }), true, 'the discharge should be dangerous')
assert.equal(hazards.ionStrikeIsLive({ ...strike, warmup: 0, life: .2 }), false, 'the afterglow must be safe')
console.log('Raid hazards: black-hole capture and deflection, solar escape gaps, and ion strike phases passed')

const distortionSource = read('blackHoleDistortion.ts').replace(/^import .*\n/gm, '')
const distortionCode = ts.transpileModule(
  'const clamp = (n, min, max) => Math.max(min, Math.min(max, n)); class Matrix {}\n' +
    'const BLACK_HOLE_AXIS_RATIO = ' + hazards.BLACK_HOLE_AXIS_RATIO + ';\n' + distortionSource,
  { compilerOptions: { module: ts.ModuleKind.ESNext } },
).outputText
const distortion = await import('data:text/javascript;base64,' + Buffer.from(distortionCode).toString('base64'))
const field = { hole, scaleX: 4, scaleY: 8, reducedMotion: false, age: event.age }
const near = { x: hole.x + hole.radius + 1, y: hole.y }
const warp = distortion.gravityWarp(field, near)
assert.ok(warp.xx > 2.7 && warp.yy < .55 && Math.abs(warp.xy) < .001, 'gravity must stretch radially and compress transversely')
assert.equal(distortion.gravityWarp(field, { x: hole.x + 45, y: hole.y }), null)
assert.ok(distortion.gravityWarp({ ...field, reducedMotion: true }, near).xx < warp.xx, 'reduced motion should soften stretching')
distortion.recordBlackHoleCapture(event, hole, { kind: 'shot', body: crossingShot, hostile: false },
  { x: hole.x + 30, y: hole.y }, { x: hole.x - 30, y: hole.y })
const capture = event.captures[0]
assert.ok(Math.abs(capture.contact.x - (hole.x - hole.radius)) < .001, 'a fast shot must start dissolving at the entry side')
const firstInfall = distortion.sampleBlackHoleCapture(capture, field.age, field)
const laterInfall = distortion.sampleBlackHoleCapture(capture, field.age + .16, field)
assert.ok(laterInfall.alpha < firstInfall.alpha && laterInfall.x > firstInfall.x, 'a captured object must fade toward the center')
assert.equal(distortion.sampleBlackHoleCapture(capture, field.age + .34, field), null)
console.log('Black-hole distortion: tidal axes, reduced motion, swept entry, and capture lifetime passed')
