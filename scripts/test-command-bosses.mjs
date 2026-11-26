import assert from 'node:assert/strict'
import { readFileSync,writeFileSync } from 'node:fs'
import ts from 'typescript'
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
const strip=s=>s.replace(/^import .*\n/gm,'')
const load=source=>import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64'))
const source='const PLAYER_MAX_RANK=20;\n'+strip(read('src/components/games/raid/bossCatalog.ts'))+strip(read('src/components/games/raid/commandBoss.ts'))
const m=await load(source)
const boss=(stage,hp=1)=>({isBoss:true,bossKind:m.getCampaignBossKind(stage),bossArtStage:stage,id:1,x:50,y:20,hp:10000*hp,maxHp:10000,shieldTime:0,phase:0,radius:12,chargeLane:50,chargeTimer:0,chargeCooldown:0,fireCooldown:0})
assert.equal(m.COMMAND_BOSS_PROFILES.length,12)
assert.equal(new Set(m.COMMAND_BOSS_PROFILES.map(profile => profile.sequence[0])).size, 12)
for(const profile of m.COMMAND_BOSS_PROFILES) {
 const kind = m.getCampaignBossKind(profile.stage)
 for (const difficulty of ['easy', 'normal', 'hard', 'expert']) {
  const hp = rank => m.getCommandBossHpScale(kind, profile.stage, rank, undefined, difficulty)
  assert.equal(hp(1), profile.hp)
  assert.ok(hp(10) > hp(1) * 1.35)
  assert.ok(hp(20) - hp(10) > hp(10) - hp(1), 'higher ranks should add more HP')
  assert.equal(hp(21), hp(20))
  assert.equal(hp(NaN), hp(1))
 }
 const maxRank = m.getCommandBossHpScale(kind, profile.stage, 20)
 assert.ok(maxRank >= profile.hp * 2.86 && maxRank <= profile.hp * 2.863)
 assert.equal(m.getCommandBossHpScale(m.getCampaignBossKind(profile.stage),profile.stage,10,20),m.getCommandBossHpScale(m.getCampaignBossKind(profile.stage),profile.stage,15))
}
for(const kind of ['squid','snake','final','devil'])assert.equal(m.getCommandBossHpScale(kind,15,20),1)
for (const difficulty of ['easy', 'normal']) {
 const enemy = boss(1)
 const bursts = new Set()
 for (let i = 0; i < 1800; i++) {
  const event = m.advanceCommandBoss(enemy, 1/60, [{ x: 50, y: 82 }], difficulty, 120, () => {})
  if (event & m.COMMAND_WARNING) bursts.add(enemy.bossBurstCount)
 }
 assert.deepEqual([...bursts].sort(), [1, 2])
}
// Solo opening warns before a single committed beam, then presents a stable counterattack window.
const opening = boss(1)
const openingTarget = { x: 38, y: 82 }, openingShots = []
const stepOpening = () => m.advanceCommandBoss(opening, .05, [openingTarget], 'normal', 120,
  shot => openingShots.push({ ...shot }), true)
assert.ok(stepOpening() & m.COMMAND_WARNING)
assert.equal(opening.bossAttackPattern, 'beam')
assert.ok(opening.bossWarningSeconds >= 2.4)
openingTarget.x = 80
while (opening.bossAttackTimer > .051) stepOpening()
assert.equal(openingShots.length, 0)
stepOpening()
assert.equal(openingShots.length, 1)
assert.equal(openingShots[0].x, 38, 'warning must show the same lane the boss fires on')
assert.equal(opening.bossAttackState, 'recovery')
assert.ok(opening.bossAttackTimer > 2.7)
const openingBossX = opening.x
stepOpening()
assert.equal(opening.x, openingBossX)

// Warnings latch target, origin, phase, speed and duration. HP loss cannot shorten a committed warning.
for(const p of m.COMMAND_BOSS_PROFILES) {
 const e=boss(p.stage),emit=()=>assert.fail('unexpected early volley')
 const targets=[{x:22,y:80},{x:78,y:75}]
 assert.ok(m.advanceCommandBoss(e,1/60,targets,'expert',120,emit)&m.COMMAND_WARNING)
 const frozen=[e.bossAimX,e.bossAimY,e.bossAttackX,e.bossAttackY,e.bossWarningSeconds,e.bossShotSpeed,e.bossCombatPhase]
 e.hp=1000;targets[0].x=90
 for(let i=0;i<3;i++)m.advanceCommandBoss(e,.1,targets,'expert',120,emit)
 assert.deepEqual([e.bossAimX,e.bossAimY,e.bossAttackX,e.bossAttackY,e.bossWarningSeconds,e.bossShotSpeed,e.bossCombatPhase],frozen)
 const snapshot=JSON.stringify(e)
 m.advanceCommandBoss(e,0,targets,'expert',120,emit);assert.equal(JSON.stringify(e),snapshot,'pause advanced a boss')
 m.interruptCommandBoss(e);assert.equal(e.bossAttackState,'recovery');assert.equal(e.bossAttackTimer,.9)
}
// Entry shields, dead bosses and special models never emit through this scheduler.
for(const props of [{shieldTime:1},{y:5},{y:15.5},{hp:0},{bossKind:'squid',bossArtStage:undefined}]) {
 let fired=0;const e={...boss(1),...props}
 for(let i=0;i<120;i++)m.advanceCommandBoss(e,1/60,[{x:50,y:80}],'normal',120,()=>fired++)
 assert.equal(fired,0);assert.equal(e.bossEncounterAge,undefined)
}
let observedPeak=0
function run(stage,ratio,fps,difficulty='normal',duration=60,targetMode='static') {
 const e=boss(stage,ratio),shots=[],history=[],patterns=new Set(),targets=[{x:50,y:82}]
 let fired=0,peak=0,minWarning=99,lastWarning=0,warning=false,maxVolley=0,hits=0,invuln=0
 const times=[]
 for(let frame=0;frame<Math.round(duration*fps);frame++) {
  const t=frame/fps,dt=1/fps
  if(targetMode==='strafe')targets[0].x=50+Math.sin(t*.75)*30
  invuln=Math.max(0,invuln-dt)
  for(let i=shots.length-1;i>=0;i--) {
   const s=shots[i];s.life-=dt;s.x+=s.vx*dt;s.y+=s.vy*dt
   if(s.life<=0||s.x< -12||s.x>112||s.y< -12||s.y>112){shots.splice(i,1);continue}
   const hit=s.kind==='beam'?Math.abs(s.x-targets[0].x)<=s.radius*.82+3.2*.72:Math.hypot(s.x-targets[0].x,s.y-82)<=s.radius+3.2
   if(hit&&invuln<=0){hits++;invuln=1.05}
  }
  const oldX=e.x,oldY=e.y,state=e.bossAttackState, maneuver=e.bossManeuver
  let volley=0
  const event=m.advanceCommandBoss(e,dt,targets,difficulty,Math.max(0,120-shots.length),shot=>{shots.push({...shot});volley++})
  if(event&m.COMMAND_WARNING) {
   warning=true;lastWarning=t;patterns.add(e.bossAttackPattern)
   history.push({serial:e.bossAttackSerial,x:e.bossAimX,phase:e.bossCombatPhase,pattern:e.bossAttackPattern})
   minWarning=Math.min(minWarning,e.bossWarningSeconds)
   assert.ok(e.bossWarningSeconds>=m.getCommandWarningFloor(m.isCommandBeam(e.bossAttackPattern))-1e-9)
  }
  if(event&m.COMMAND_FIRED) {
   if(warning)assert.ok(t-lastWarning>=e.bossWarningSeconds-1/fps-1e-8,'danger before warning completed')
   warning=false;fired++;times.push(t)
  }
  const speedLimit = maneuver === 'phaseShift' ? m.COMMAND_MAX_PHASE_SPEED : m.COMMAND_MAX_STRAFE_SPEED
  assert.ok(Math.abs(e.x-oldX)<=speedLimit*dt+1e-9&&Math.abs(e.y-oldY)<=m.COMMAND_MAX_VERTICAL_SPEED*dt+1e-9,'boss teleported')
  if(state==='warning'||state==='burst')assert.equal(e.x,oldX,'boss moved its locked muzzle during a warning/burst')
  assert.ok(e.x>=18&&e.x<=82&&e.y>=16&&e.y<=28)
  maxVolley=Math.max(maxVolley,volley);peak=Math.max(peak,shots.length)
  assert.ok(volley<=12&&shots.length<=120)
  for(const s of shots) {
   assert.ok([s.x,s.y,s.vx,s.vy,s.radius,s.life].every(Number.isFinite))
   assert.ok(Math.hypot(s.vx,s.vy)<=m.COMMAND_MAX_SHOT_SPEED+1e-8,'projectile exceeded tuned speed cap')
  }
 }
 observedPeak=Math.max(observedPeak,peak)
 return {stage,ratio,fps,difficulty,fired,peak,minWarning,maxVolley,hits,patterns:[...patterns],history,times}
}
const stage14Order=run(14,.55,60).history.map(attack=>attack.pattern)
assert.ok(stage14Order.some((pattern,i)=>i>=4 && pattern!==stage14Order[i%4]),'boss should vary the repeating attack order')
const report=[]
for(const p of m.COMMAND_BOSS_PROFILES) {
 for(const ratio of [1,.55,.2]) {
  const samples=[30,60,144].map(fps=>run(p.stage,ratio,fps))
  const counts=samples.map(s=>s.fired)
  assert.ok(Math.max(...counts)-Math.min(...counts)<=2,'attack cadence depends on refresh rate')
  assert.ok(samples.every(s=>s.patterns.length>=new Set(p.sequence).size),'boss never executes its whole pattern sequence')
  report.push(samples[1])
 }
 for(const difficulty of ['easy','hard','expert'])run(p.stage,.2,60,difficulty,45)
}
// Clamp dangerous attacks atomically under load; require a new warning after deferred shots or a nuke.
const capped=boss(13);let emitted=0
m.advanceCommandBoss(capped,.01,[{x:50,y:80}],'expert',0,()=>emitted++)
for(let i=0;i<20;i++)m.advanceCommandBoss(capped,.1,[{x:50,y:80}],'expert',0,()=>emitted++)
assert.equal(emitted,0)
assert.equal(capped.bossLastVolleyAge, undefined)
m.interruptCommandBoss(capped)
for(let i=0;i<8;i++)m.advanceCommandBoss(capped,.1,[{x:50,y:80}],'expert',120,()=>emitted++)
assert.equal(emitted,0,'nuke caused an immediate retaliation')
// Paired pilots alternate bait targets; existing flat snapshot clone/compact paths preserve every field.
const coop=boss(11),bait=[]
for(let i=0;i<1200;i++) {
 const event=m.advanceCommandBoss(coop,1/60,[{x:18,y:80},{x:82,y:80}],'normal',120,()=>{})
 if(event&m.COMMAND_WARNING)bait.push(coop.bossAimX)
}
assert.ok(bait.length>4);assert.ok(bait.every((x,i)=>x===(i%2?82:18)))
const draft=m.createCommandVolley()
for(const p of m.COMMAND_BOSS_PROFILES)for(const pattern of p.sequence)for(const aimX of [8,50,92]) {
 const e={...boss(p.stage),bossAttackPattern:pattern,bossAimX:aimX,bossAimY:82,bossGapX:aimX < 25 ? aimX + 18 : aimX - 18,bossCombatPhase:2,bossShotSpeed:40,bossBurstCount:3}
 const count=m.writeCommandVolley(e,draft)
 assert.ok(count>0&&count<=12, 'empty or overfull '+pattern+' at '+aimX)
 if(pattern==='curtain')for(let i=0;i<count;i++)assert.ok(Math.abs(draft[i].x-e.bossGapX)>=13,'curtain fills its advertised corridor')
 if(pattern==='twinBeam')assert.ok(draft[1].x-draft[0].x>=28-1e-9,'paired beams close the safe center')
}
const longRun=run(14,.2,60,'expert',600)
assert.ok(longRun.peak<120,'ordinary fight constantly exhausts its shot budget')

// Each boss opens its own barrage and sustains it at the tuned interval before recovering.
for (const profile of m.COMMAND_BOSS_PROFILES) {
  const full = boss(profile.stage)
  const critical = boss(profile.stage, .2)
  const target = [{ x: 54, y: 80 }]
  for (const enemy of [full, critical]) {
    const stamps = []
    for (let i = 0; i < 360; i++) {
      const event = m.advanceCommandBoss(enemy, 1/120, target, 'normal', 120, () => {})
      if (event & m.COMMAND_FIRED) stamps.push(enemy.bossEncounterAge)
      if (enemy.bossAttackState === 'recovery') break
    }
    assert.equal(enemy.bossAttackPattern, profile.sequence[0])
    assert.equal(stamps.length, Math.min(6, profile.signature.rounds + (enemy === critical ? 2 : 0)))
    for (let i = 1; i < stamps.length; i++) assert.ok(
      Math.abs(stamps[i] - stamps[i-1] - enemy.bossBurstInterval) <= 1/120 + 1e-6,
      'rounds should follow the same barrage cadence across refresh rates',
    )
  }
  assert.ok(critical.bossRecoverySeconds < full.bossRecoverySeconds)
}

for (const profile of m.COMMAND_BOSS_PROFILES.filter(profile => profile.maneuver)) {
  const enemy = boss(profile.stage, .6)
  const target = [{ x: 50, y: 82 }]
  const step = emit => m.advanceCommandBoss(enemy, 1/60, target, 'normal', 120, emit)
  const cloak = profile.maneuver === 'cloak'
  let startAge, departureX, lastHiddenAge, movedDuringScan = false
  let fullyCloaked = false
  for (let i = 0; i < 600; i++) {
    const event = step(() => assert.equal(m.sampleCommandBossCloak(enemy), 0, 'a hidden boss must never fire'))
    if (enemy.bossManeuver) {
      assert.equal(enemy.bossManeuver, profile.maneuver)
      departureX = enemy.bossManeuverFromX
      startAge ??= enemy.bossManeuverStartAge
      assert.equal(enemy.shieldTime, 0)
      assert.equal(enemy.bossAttackState, 'recovery')
      if (m.getCommandManeuverAge(enemy) < m.COMMAND_CLOAK_SCAN_SECONDS && enemy.x !== departureX) movedDuringScan = true
    }
    if (m.sampleCommandBossCloak(enemy) >= .99) fullyCloaked = true
    if (m.sampleCommandBossCloak(enemy) > 0) lastHiddenAge = enemy.bossEncounterAge
    if (startAge !== undefined && event & m.COMMAND_WARNING) break
  }
  assert.ok(Math.abs(enemy.x - departureX) >= 20, 'the hull must actually change positions')
  if (cloak) {
    assert.ok(fullyCloaked && !movedDuringScan)
    assert.ok(enemy.bossEncounterAge - lastHiddenAge >= .22, 'cloak must end before the warning')
    assert.ok(enemy.bossEncounterAge - startAge <= 2.23)
  } else {
    assert.ok(!fullyCloaked && enemy.bossEncounterAge - startAge < .68, 'phase dash should immediately lead into a warning')
    const warning = enemy.bossWarningSeconds
    const warningAge = enemy.bossEncounterAge
    assert.ok(warning >= m.getCommandWarningFloor(false))
    let fired = false
    for (let i = 0; i < 180 && !fired; i++) step(() => { fired = true })
    assert.ok(fired && enemy.bossEncounterAge - startAge < 1.55, 'the dash follow-up should land quickly')
    assert.ok(enemy.bossEncounterAge - warningAge >= warning - 1/60, 'the follow-up must still give time to dodge')
  }
  for (let i = 0; i < 600 && !enemy.bossManeuver; i++) step(() => {})
  assert.ok(enemy.bossManeuver && enemy.bossAttackSerial >= 3, 'maneuver should recur with cooldown')
  m.interruptCommandBoss(enemy)
  assert.equal(m.sampleCommandBossCloak(enemy), 0)
  assert.equal(enemy.bossManeuver, undefined)
  assert.equal(enemy.bossAttackTimer, .9)
}

for (const x of [18, 82]) {
  const edgeBoss = { ...boss(13, .6), x }
  const target = [{ x: x < 50 ? 8 : 92, y: 82 }]
  for (let i = 0; i < 360 && !edgeBoss.bossManeuver; i++) {
    m.advanceCommandBoss(edgeBoss, 1/60, target, 'normal', 120, () => {})
  }
  assert.ok(Math.abs(edgeBoss.bossManeuverToX - x) >= 18, 'cloaking at an edge must still reposition the boss')
}

const ladder = { ...boss(12), bossAttackPattern: 'ladder', bossGapX: 46, bossShotSpeed: 45 }
const ladderLanes = []
for (let wave = 0; wave < 6; wave++) {
  const count = m.writeCommandVolley(ladder, draft, wave)
  const lanes = draft.slice(0, count).map(shot => shot.x)
  assert.ok(lanes.every(x => Math.abs(x - 46) >= 15), 'the ladder must keep a persistent escape corridor')
  ladderLanes.push(lanes)
}
assert.notDeepEqual(ladderLanes[0], ladderLanes[1])
assert.deepEqual(ladderLanes[0], ladderLanes[2])
for (const stage of [3, 4, 6, 12, 13]) {
  for (const bossX of [18, 50, 82]) for (const aimX of [8, 25, 50, 75, 92]) for (const aimY of [48, 55, 82, 91, 94]) {
    const enemy = { ...boss(stage, .2), x: bossX, y: 26 }
    const target = [{ x: aimX, y: aimY }]
    m.advanceCommandBoss(enemy, 1/60, target, 'expert', 120, () => {})
    assert.ok(Math.abs(enemy.bossGapX - aimX) <= 18 && Math.abs(enemy.bossGapX - aimX) >= 12)
    for (let wave = 0; wave < enemy.bossBurstCount; wave++) {
      const count = m.writeCommandVolley(enemy, draft, wave)
      assert.ok(count > 0 && count <= m.COMMAND_VOLLEY_LIMIT, 'barrage must sustain every scheduled wave')
      for (const shot of draft.slice(0, count)) {
        if (shot.vy <= 0) continue
        for (const altitude of [aimY - 4, aimY, aimY + 4]) {
          const crossing = shot.x + shot.vx * (altitude - shot.y) / shot.vy
          assert.ok(Math.abs(crossing - enemy.bossGapX) >= 10 - 1e-8,
            'a maximum-size pilot must have room in the corridor during every wave')
        }
      }
    }
  }
}
console.log('Command signatures: all 12 sustained barrages, phased cadence, cloak recovery and clear corridor geometry passed')

// A simple stationary/continuous-strafe comparison is diagnostic, not a human playtest.
const diagnostics=m.COMMAND_BOSS_PROFILES.map(p=>({stage:p.stage,stationary:run(p.stage,.55,60,'normal',60).hits,strafe:run(p.stage,.55,60,'normal',60,'strafe').hits}))
const output=process.argv.indexOf('--report')
function legacyVolleys(stage) {
 let timer=Math.max(.75,1-(stage-1)*.025),count=0
 const interval=Math.max(.85,1.82-stage*.028-stage*.035)
 for(let i=0;i<3600;i++) {
  const next=timer-1/60
  if(next<=0&&(i/60)%6<=3)count++
  timer=next<=0?interval:next
 }
 return count
}
if(output>=0)writeFileSync(process.argv[output+1],JSON.stringify({scenario:'60s fixed-HP scripted encounters at 100%, 55%, 20% HP; no player DPS, browser or GPU. Bot hits are diagnostic, not a human fairness proof.',
 phases:[1,.55,.2],profiles:m.COMMAND_BOSS_PROFILES.map(p=>{
  const rows=report.filter(r=>r.stage===p.stage),bots=diagnostics.find(r=>r.stage===p.stage)
  return {stage:p.stage,legacyVolleys:legacyVolleys(p.stage),newVolleys:rows.map(r=>r.fired),peakShots:rows.map(r=>r.peak),minimumWarnings:rows.map(r=>Number(r.minWarning.toFixed(4))),hpScaleRank1:m.getCommandBossHpScale(m.getCampaignBossKind(p.stage),p.stage,1),hpScaleRank20:Number(m.getCommandBossHpScale(m.getCampaignBossKind(p.stage),p.stage,20).toFixed(4)),stationaryHits:bots.stationary,strafeHits:bots.strafe}
 }),observedPeakShots:observedPeak,tenMinutePeak:longRun.peak},null,2)+'\n')
console.log(`Command bosses: 12 profiles, 3 HP phases, 4 difficulties, 30/60/144Hz cadence, locked warnings, nuke recovery, co-op targets and 10-minute bounds passed (observed peak ${observedPeak} shots)`)
console.log('Scripted hit diagnostics:',JSON.stringify(diagnostics))
// Exercise the production draw routing and collision geometry at both viewport shapes.
const vfxStubs = `
const BOSS_FX = Object.fromEntries(
 ['lane','aim','ionWake','pulse','muzzle','shield','impact','precision','damage','char'].map(name=>[name,name]));
const drawBossFx = (ctx,...args) => { ctx.sprites.push(args); return true };
const drawBossFxLane = (ctx,...args) => { ctx.lanes.push(args) };
const COMBAT_TILE={smoke:11}, getRaidCombatFrame=()=>({});
const drawRaidCombatTexture=ctx=>{ctx.smoke=(ctx.smoke??0)+1;return true};
`
const warnings=await load(source+vfxStubs+'\nconst PLAYER_RADIUS=3.2;\n'+strip(read('src/components/games/raid/commandBossRender.ts')))
for(const [w,h] of [[390,844],[1280,720]])for(const p of m.COMMAND_BOSS_PROFILES)for(const pattern of p.sequence) {
 const e={...boss(p.stage),bossAttackState:'warning',bossAttackPattern:pattern,bossAttackTimer:.5,bossWarningSeconds:1,bossAimX:50,bossAimY:82,bossGapX:36,bossCombatPhase:1,bossShotSpeed:36}
 const ctx={lanes:[]}
 warnings.drawCommandBossTelegraph(ctx,e,v=>v*w/100,v=>v*h/100,w)
 assert.ok(ctx.lanes.length<=12)
 assert.ok(ctx.lanes.flatMap(lane=>lane.slice(1)).every(Number.isFinite))
 if(m.isCommandBeam(pattern)) {
  const n=m.writeCommandVolley(e,draft)
  assert.equal(ctx.lanes.length,n)
  for(let i=0;i<n;i++) {
   const [tile,x,y,endX,endY,width]=ctx.lanes[i]
   const half=draft[i].radius*.82+3.2*.72
   assert.equal(tile,'lane')
   assert.ok(Math.abs(x-draft[i].x*w/100)<1e-8)
   assert.ok(Math.abs(width-half*2*w/100)<1e-8)
   assert.equal(x,endX);assert.equal(y,0);assert.equal(endY,h)
  }
 }
 if(pattern==='hydra')assert.equal(ctx.lanes.length,3,'Hydra must preview all firing heads')
 if(pattern==='broadside')assert.equal(ctx.lanes.length,6,'Broadside must preview both batteries')
}
const cloaked = { ...boss(13), bossAttackState: 'recovery', bossManeuver: 'cloak', bossManeuverStartAge: 3, bossEncounterAge: 3.6 }
assert.equal(warnings.getCommandBossHullOpacity(cloaked), 0)
assert.equal(warnings.getCommandBossHullOpacity({ ...cloaked, bossManeuver: 'phaseShift' }), 1)
assert.ok(Math.abs(warnings.getCommandBossHullOpacity({ ...cloaked, hitFlash: .24 }) - .34) < 1e-8)
assert.ok(warnings.getCommandBossHullOpacity({ ...cloaked, hitFlash: .1 }) < .34)
assert.equal(warnings.getCommandBossHullOpacity({ ...cloaked, bossEncounterAge: 5.01 }), 1)
const dash = { ...cloaked, bossManeuver: 'phaseShift', bossManeuverFromX: 22, bossManeuverToX: 78, bossEncounterAge: 3.36 }
dash.x = m.sampleCommandPhaseShiftX(dash, .36)
const ghosts = []
warnings.drawCommandPhaseAfterimages(dash, (x, alpha, index) => ghosts.push({ x, alpha, index }))
assert.equal(ghosts.length, 3)
assert.ok(ghosts[0].x < ghosts[1].x && ghosts[1].x < ghosts[2].x && ghosts[2].x < dash.x)
assert.ok(ghosts[0].alpha < ghosts[1].alpha && ghosts[1].alpha < ghosts[2].alpha)
warnings.drawCommandPhaseAfterimages({ ...dash, bossEncounterAge: 3.7 }, () => assert.fail('ghosts outlived the dash'))
const motionSafe = await load(source + vfxStubs +
 '\nconst PLAYER_RADIUS=3.2; const window={matchMedia:()=>({matches:true})};\n' + strip(read('src/components/games/raid/commandBossRender.ts')))
assert.ok(motionSafe.getCommandBossHullOpacity(cloaked) >= .24 - 1e-8)
motionSafe.drawCommandPhaseAfterimages(dash, () => assert.fail('reduced motion must suppress the trail'))
const effectBoss = boss(11, .5)
m.advanceCommandBoss(effectBoss, .01, [{x:50,y:80}], 'normal', 120, () => {})
assert.equal(effectBoss.bossPhaseStartedAge, effectBoss.bossEncounterAge)
const sprites = [], fills = [], labels = []
const effectsContext = {
 globalAlpha: 1, ellipse(){}, clip(){}, createLinearGradient(){ return {addColorStop(){}} },
 sprites, save(){}, restore(){}, translate(){}, rotate(){}, scale(){}, beginPath(){}, arc(){}, stroke(){},
 fillRect(...args){ fills.push(args) },
 fillText(...args){ labels.push(args) },
}
warnings.drawCommandBossEnergy(effectsContext, { ...cloaked, bossEncounterAge: 3.22 }, x=>x, y=>y, 130)
assert.equal(fills.length, 1, 'a visible scan must precede full cloak')
warnings.drawCommandBossEnergy(effectsContext, cloaked, x=>x, y=>y, 130)
assert.equal(fills.length, 1, 'the scan should disappear when the cloak is active')
fills.length = 0
warnings.drawCommandBossEnergy(effectsContext, effectBoss, x=>x*3.9, y=>y*8.44, 130)
assert.equal(sprites.length, 0, 'A warning uses its projected attack lanes without a body or charge ring')
warnings.drawCommandBossHealthBar(effectsContext, effectBoss, 195, 168.8, 130)
assert.deepEqual(fills.slice(-2).map(([left])=>left),[136.5+117*.3-1,136.5+117*.65-1])
assert.equal(labels[0][0],m.getGenericBossArt(effectBoss.bossKind,11).name)

const released = []
for (let step = 0; step < 100 && !released.length; step++) {
 m.advanceCommandBoss(effectBoss, .02, [{x:50,y:80}], 'normal', 120, shot => released.push({...shot}))
}
assert.equal(released.length,1)
assert.equal(effectBoss.bossLastVolleyAge, effectBoss.bossEncounterAge)
sprites.length=0
warnings.drawCommandBossEnergy(effectsContext, effectBoss, x=>x*3.9, y=>y*8.44, 130)
assert.deepEqual(sprites.map(([tile,x,y])=>[tile,x,y]), released.map(shot=>['muzzle',shot.x*3.9,shot.y*8.44]))
sprites.length=0
warnings.drawCommandBossEnergy(effectsContext, {...effectBoss,bossEncounterAge:effectBoss.bossEncounterAge+1}, x=>x,y=>y,130)
assert.equal(sprites.length,0,'Muzzle textures must expire')
const fan = {...boss(1),bossEncounterAge:2,bossLastVolleyAge:2,bossAttackPattern:'fan',bossAttackState:'burst',bossBurstIndex:1}
warnings.drawCommandBossEnergy(effectsContext, fan, x=>x,y=>y,130)
assert.equal(sprites.length,1,'a five-shot fan sharing a muzzle should draw only one flash')

const damage = await load(source + vfxStubs + strip(read('src/components/games/raid/bossDamageFx.ts')))

const impactBoss = boss(11, .25)
const contact = { id: 3, x: 51, y: 31, kind: 'pulse' }
assert.equal(damage.recordBossImpact(impactBoss, contact, true), 'shield')
assert.equal(damage.recordBossImpact(impactBoss, { ...contact, id: 4 }, true), undefined)
sprites.length=0
damage.drawBossImpact(effectsContext, impactBoss, 195, 168.8, 3.9, 8.44, 130, false)
assert.equal(sprites.length, 1)
const [shieldTile, shieldX, shieldY] = sprites[0]
assert.equal(shieldTile, 'shield')
assert.ok(shieldX > 195 && shieldY > 168.8)
assert.ok(Math.hypot(shieldX - 195, shieldY - 168.8) <= 130 * .52 + 1e-8)
impactBoss.bossImpactTime = .09
assert.equal(damage.recordBossImpact(impactBoss, contact, false), 'core')
impactBoss.bossImpactTime = 0
assert.equal(damage.recordBossImpact(impactBoss, { ...contact, kind: 'rocket' }, false), 'heavy')
console.log('Boss VFX: projected beam widths, per-muzzle artwork, shield, hull and contact placement passed')

// Real network interpolation preserves committed targets and never blends different attack warnings.
const net=read('src/components/games/raid/network.ts')
const interpolation=await load('const cloneEnemy=e=>({...e});\n'+net.slice(net.indexOf('export function interpolateEnemyVisual('),net.indexOf('const enemyIdMapCache')))
const prev={...boss(12),bossAttackState:'warning',bossAttackSerial:1,bossAttackTimer:1,bossAimX:20}
const next={...prev,bossAttackTimer:.5,bossAimX:20}
assert.equal(interpolation.interpolateEnemyVisual(prev,next,.5).bossAttackTimer,.75)
assert.equal(interpolation.interpolateEnemyVisual(
 {...prev,bossEncounterAge:4}, {...next,bossEncounterAge:4.1}, .5).bossEncounterAge, 4.05)

const oldImpact = { kind: 'shield', shotId: 11, x: 0, y: 2 }
const oldFrame = { ...prev, bossImpact: oldImpact, bossImpactTime: .2, defeatTimer: 3 }
const sameImpact = { ...oldFrame, bossImpactTime: .1, defeatTimer: 2.8 }
assert.ok(Math.abs(interpolation.interpolateEnemyVisual(oldFrame, sameImpact, .5).bossImpactTime - .15) < 1e-8)
assert.equal(interpolation.interpolateEnemyVisual(oldFrame, sameImpact, .5).defeatTimer, 2.9)
const newImpact = { ...sameImpact, bossImpact: { ...oldImpact, shotId: 12 }, bossImpactTime: .22 }
assert.equal(interpolation.interpolateEnemyVisual(oldFrame, newImpact, .5).bossImpactTime, .22)

const changed={...next,bossAttackSerial:2,bossAttackTimer:1.1,bossAimX:80}
assert.equal(interpolation.interpolateEnemyVisual(prev,changed,.5).bossAttackTimer,1.1)
assert.equal(interpolation.interpolateEnemyVisual(prev,changed,.5).bossAimX,80)
const eliteBefore = { ...prev, isMiniBoss: true, chargeTimer: 0, chargeLane: 20, chargeTargetY: 50 }
const eliteWarning = { ...eliteBefore, miniBossAttack: 'crossfire', miniBossAttackIndex: 2, chargeTimer: 1.05, chargeLane: 70, chargeTargetY: 80 }
const committed = interpolation.interpolateEnemyVisual(eliteBefore, eliteWarning, .5)
assert.equal(committed.chargeTimer, 1.05)
assert.equal(committed.chargeLane, 70)
assert.equal(committed.chargeTargetY, 80)
assert.equal(interpolation.interpolateEnemyVisual(eliteWarning, { ...eliteWarning, chargeTimer: .55 }, .5).chargeTimer, .8)
// Execute the actual nuke callback and damage rule, including its projectile clear and forced recovery.
const runtime=read('src/components/games/raid/GradiusRaidRuntime.tsx')
const nuke=runtime.slice(runtime.indexOf('  const detonateNuke = useCallback('),runtime.indexOf('  const activateNuke = useCallback('))
const mechanics=read('src/components/games/raid/mechanics.ts')
const balanceConstants=read('src/components/games/raid/constants.ts').split('\n').filter(line =>
  /^export const (?:MAX_RAID_STAGE|NUKE_BOSS_DAMAGE_\w+|NUKE_MINI_BOSS_DAMAGE_RATIO|FINAL_BOSS_NUKE_DAMAGE_MULTIPLIER|DEVIL_BOSS_NUKE_DAMAGE_MULTIPLIER) = /.test(line)).join('\n')
const balanceSource=mechanics.slice(mechanics.indexOf('export function getNukeStageScale'), mechanics.indexOf('export function getGodGundamBarrageBossDamage'))
const nukeHarness=await load(source+balanceConstants+'\n'+balanceSource+`
const useCallback=f=>f;
const phaseRef={current:'playing'},playerRef={current:{x:50,y:80,invuln:0,score:0}},remotePlayerRef={current:null};
const scoreMultRef={current:1},stageRef={current:12},waveRef={current:12},highScoreRef={current:0},killsSincePowerRef={current:0},enemiesDestroyedRef={current:0};
const nukeBlastOriginRef={current:null},nukeFlashRef={current:0},shipSizeRef={current:1.2},sameScreenCoopRef={current:false};
const asteroidsRef={current:[]},meteorsRef={current:[]},ionStrikesRef={current:[]},wrecksRef={current:[]};
export const enemiesRef={current:[]},enemyShotsRef={current:[]};
const HEIGHT=100,NUKE_FLASH_SECONDS=1;
const addRipple=()=>{},spawnSparks=()=>{},triggerScreenShake=()=>{},playGameSound=()=>{},syncSnapshot=()=>{};
const scenePresentation={defeat(){}};
`+nuke+'\nexport {detonateNuke};')
const charged={...boss(12),bossEncounterAge:8,bossAttackState:'warning',bossAttackTimer:.1,bossAttackPattern:'twinBeam',bossLastVolleyAge:7.95}
nukeHarness.enemiesRef.current.push(charged);nukeHarness.enemyShotsRef.current.push({})
nukeHarness.detonateNuke()
assert.equal(nukeHarness.enemyShotsRef.current.length,0)
assert.equal(charged.bossLastVolleyAge,undefined);assert.equal(charged.hp,10000-nukeHarness.getNukeBossDamage(charged,12));assert.equal(charged.bossAttackState,'recovery');assert.equal(charged.bossAttackTimer,.9)
for (const hp of [12, 100, 1800, 150000]) {
 const normal = { isBoss: true, maxHp: hp }
 const damage = (enemy, stage) => nukeHarness.getNukeBossDamage(enemy, stage)
 assert.ok(damage(normal, 1) <= hp * .07)
 assert.equal(damage(normal, 45), Math.floor(hp * .11))
 assert.ok(damage({ ...normal, bossKind: 'final' }, 15) <= hp * .061)
 assert.ok(damage({ ...normal, bossKind: 'devil' }, 25) <= hp * .025)
 assert.ok(damage({ isMiniBoss: true, maxHp: hp }, 15) <= hp * .2)
}
const weakBoss = {...boss(13), hp: 15, bossManeuver: 'cloak', bossEncounterAge: 6, bossManeuverStartAge: 5}
const miniBoss = {isMiniBoss: true, hp:200, maxHp:200, x:40, y:20}
nukeHarness.enemiesRef.current = [weakBoss, miniBoss]
nukeHarness.detonateNuke()
assert.equal(weakBoss.hp, 1, 'boss finishing blow should still require ordinary fire')
assert.equal(weakBoss.bossManeuver, undefined, 'nuke must cancel cloak')
assert.equal(miniBoss.hp, 160)
console.log('Command warnings/integration: matching beam hit lanes, bounded atlas draws, three-head preview, atomic co-op warnings and real nuke interruption passed')
// Execute the production host enemy loop, not only the standalone scheduler.
const updateStart=runtime.indexOf('  const updateGame = useCallback(')
const hostLoop=runtime.slice(runtime.indexOf('    const enemies = enemiesRef.current',updateStart),runtime.indexOf('    enemies.length = liveEnemyCount',updateStart)+'    enemies.length = liveEnemyCount'.length)
try {
const host=await load(source+`
const HEIGHT=100,WIDTH=100,landscapeRef={current:false};
const player={x:50,y:82,hp:10},livingPlayersThisTick=[player];
const enemyTactics={update(){}},sceneryRunTokenRef={current:0};
export const enemiesRef={current:[]},enemyShotsRef={current:[]};
const raidModeRef={current:'campaign'},raidDifficultyRef={current:'normal'},stageRef={current:1},waveRef={current:1};
const bossAlertRef={current:0},bossMessageRef={current:null},coachOpeningRef={current:false};
const BOSS_RUSH_MOTION_SCALE=1.18,BOSS_RUSH_SPECIAL_RECHARGE_SCALE=1.32,BOSS_RUSH_ATTACK_COOLDOWN_SCALE=.72;
export let legacyFires=0,totalShots=0;
const playBossCriticalStinger=()=>{},getNearestLivingPlayerThisTick=()=>player;
const fireEnemy=()=>{legacyFires++},playGameSound=()=>{},markBossAttack=()=>{},commandBossReleaseCue=()=>'beam',addRipple=()=>{};
let shotId=0;
const emitCommandBossShot=s=>{enemyShotsRef.current.push({...s,id:shotId++});totalShots++};
export function tick(dt,now){const nowSeconds=now/1000; const blackHole=null;
`+hostLoop+'\n}\n')
for(const p of m.COMMAND_BOSS_PROFILES) {
 const e={...boss(p.stage),isMiniBoss:false,vx:0,vy:7,originX:50,trainSlot:0,pathSpeed:.05,pattern:0,amplitude:0,phase:0}
 host.enemiesRef.current=[e]
 const before=host.totalShots
 for(let i=0;i<900;i++){host.enemyShotsRef.current.length=0;host.tick(1/60,100000+i*1000/60)}
 assert.ok(host.totalShots>before,'production host loop never emitted the new boss attacks')
 assert.ok(e.bossAttackSerial>=3,'production loop did not progress the encounter')
 assert.ok(Math.abs(e.bossEncounterAge-15)<1e-7,'production loop used a wall clock instead of dt')
 assert.ok(e.x>=18&&e.x<=82&&e.y>=16&&e.y<=28)
 assert.equal(e.fireCooldown,0,'legacy fire cooldown is still competing with the encounter')
}
assert.equal(host.legacyFires,0,'ordinary bosses still call the legacy fire path')
console.log('Command host integration: all twelve ships emit through the real enemy loop, retain dt timing/movement, and bypass the old pause/fire callback')

} catch (error) { throw new Error(`Production host loop check: ${error.name}: ${error.message}`) }

