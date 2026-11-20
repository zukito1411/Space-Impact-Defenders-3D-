import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { chromium } from 'playwright'

// Diagnostic setup stays in the browser fixture. Production simulation,
// cameras, renderers, stage artwork and quality budgets are used unchanged.
const base=process.env.RAID_TEST_URL ?? 'http://127.0.0.1:5200'
const output='presentation-review/campaign-v1'
const capturesOnly=process.argv.includes('--captures-only')
const profileOnly=process.argv.includes('--profile-only')
const resume=process.argv.includes('--resume')
const frames=Number(process.env.RAID_REVIEW_FRAMES ?? 24)
assert.ok(Number.isInteger(frames)&&frames>=12&&frames<=180)
const source=await readFile('src/components/games/raid/GradiusRaidRuntime.tsx','utf8')
const refNames=[...source.matchAll(/const (\w+Ref) = useRef/g)].map(match=>match[1])
const server=process.env.RAID_TEST_URL ? null : spawn(process.execPath,
  ['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5200','--strictPort'],{stdio:'ignore'})
const exited=server ? once(server,'exit') : Promise.resolve()
const results=[],captures=[],errors=[]
if(resume&&!capturesOnly) {
  const previous=JSON.parse(await readFile(output+'/loads-v1.json','utf8'))
  assert.equal(previous.quality,'max')
  assert.equal(previous.deviceScaleFactor,1)
  assert.deepEqual(previous.errors,[])
  results.push(...previous.results)
}
let browser
try {
  await mkdir(output,{recursive:true})
  for(let attempt=0;attempt<100;attempt++) {
    try {if((await fetch(base)).ok)break}catch{}
    await new Promise(resolve=>setTimeout(resolve,200))
  }
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,
    args:['--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader']})
  for(const landscape of (capturesOnly ? [true] : [true,false])) {
    const view=landscape?'landscape':'portrait'
    const page=await browser.newPage({viewport:landscape?{width:844,height:390}:{width:393,height:852},
      deviceScaleFactor:1,hasTouch:true,reducedMotion:'no-preference'})
    page.on('pageerror',error=>errors.push(view+': '+error.message))
    page.on('console',message=>{
      if(message.type()==='error'&&/THREE\.|WebGL|shader|Air Raid frame failed/i.test(message.text())) errors.push(message.text())
    })
    await page.route('**/*',route=>new URL(route.request().url()).hostname===new URL(base).hostname?route.continue():route.abort())
    await page.addInitScript(landscape=>{
      localStorage.setItem('raid-flight-view',landscape?'landscape':'vertical')
      localStorage.setItem('gameSoundEnabled','0')
      localStorage.setItem('raidGraphicsQuality','max')
      localStorage.setItem('raid-show-fps','1')
      const native=requestAnimationFrame.bind(window)
      window.reviewRAF=native
      window.reviewManual=false
      window.requestAnimationFrame=callback=>{
        const raidLoop=callback.toString().includes('tick(time)')
        if(raidLoop)window.reviewLoop=callback
        return raidLoop&&window.reviewManual?-37:native(callback)
      }
      let seed=1
      window.reviewSeed=value=>{seed=value>>>0}
      Math.random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296)
    },landscape)
    await page.goto(base+'/scripts/presentation-fixture.html')
    await page.addStyleTag({content:'.raid__perf-hud { visibility:hidden !important }'})
    await page.locator('button.raid__start').first().click({timeout:180000})
    await page.locator('.raid__carrier-briefing').waitFor({timeout:120000})
    await page.locator('.raid__carrier-skip').click()
    await page.waitForFunction(()=>document.querySelector('.raid')?.dataset.carrierStage==='flight',{},{timeout:120000})
    const catalog=await page.evaluate(async names=>{
      const root=document.querySelector('.raid')
      let fiber=root[Object.keys(root).find(key=>key.startsWith('__reactFiber$'))]
      while(fiber&&fiber.type?.name!=='GradiusRaid')fiber=fiber.return
      if(!fiber)throw Error('Raid fixture runtime not found')
      const refs=[],callbacks=[]
      for(let hook=fiber.memoizedState;hook;hook=hook.next) {
        const value=hook.memoizedState
        if(value&&typeof value==='object'&&Object.keys(value).length===1&&Object.hasOwn(value,'current')) refs.push(value)
        if(Array.isArray(value)&&typeof value[0]==='function')callbacks.push(value[0])
      }
      const offset=refs.findIndex(ref=>typeof ref.current?.getShipStats==='function')-names.indexOf('shipsRef')
      const r=Object.fromEntries(names.map((name,index)=>[name,refs[index+offset]]))
      if(r.stageRef.current!==1||r.phaseRef.current!=='playing'||!r.pixiBackgroundRef.current.render)throw Error('Invalid diagnostic ref mapping')
      const find=(...markers)=>{
        const matches=callbacks.filter(fn=>markers.every(marker=>fn.toString().includes(marker)))
        if(matches.length!==1)throw Error('Diagnostic callback mapping failed ('+matches.length+'): '+markers.join(', '))
        return matches[0]
      }
      const actions={
        spawnBoss:find('const bossBaseHp'),update:find('const scoreMult = scoreMultRef.current','nearMissCooldownRef.current'),
        draw:find('RAID_FX_CANVAS_CONTEXT_SETTINGS','const carrierActive'),sync:find('const bossAlertBucket'),
        formation:find('getRaidWingSize','spawnEnemyAt'),asteroids:find('asteroidsRef.current.push(...planned'),
        sparks:find('acquireSpark('),ripple:find('acquireRipple('),
      }
      const {CAMPAIGN_BOSS_ART,getCampaignBossKind}=await import('/src/components/games/raid/bossCatalog.ts')
      const bosses=Array.from({length:15},(_,index)=>{
        const stage=index+1,art=CAMPAIGN_BOSS_ART.find(art=>art.stage===stage)
        return {stage,kind:getCampaignBossKind(stage),name:art?.name??({5:'Abyss Squid',10:'Serpent Guardian',15:'Mirage Mothership'})[stage]}
      })
      bosses.push({stage:16,kind:'devil',name:'Devil Gundam'})
      const background=r.pixiBackgroundRef.current,ships=r.shipsRef.current
      const gl=background.app.renderer.gl
      const gpu={calls:0,triangles:0}
      for(const name of ['drawElements','drawArrays','drawElementsInstanced','drawArraysInstanced']) {
        const original=gl[name]?.bind(gl)
        if(!original)continue
        gl[name]=(...args)=>{
          gpu.calls++
          const count=name.startsWith('drawElements')?args[1]:args[2]
          const instances=name.endsWith('Instanced')?args.at(-1):1
          gpu.triangles+=(args[0]===gl.TRIANGLES?count/3:args[0]===gl.TRIANGLE_STRIP?Math.max(0,count-2):0)*instances
          return original(...args)
        }
      }
      const nativePresent=ships.present.bind(ships)
      let shipCpu=0
      ships.present=()=>{const start=performance.now();nativePresent();shipCpu+=performance.now()-start}
      const player=structuredClone(r.playerRef.current)
      const review={r,actions,bosses,gpu,background,ships,player,
        reset(stage,scenario='capture') {
          window.reviewSeed(stage*1009+17)
          for(const name of ['enemiesRef','shotsRef','enemyShotsRef','sparksRef','ripplesRef','asteroidsRef',
            'asteroidApproachRef','meteorsRef','ionStrikesRef','wrecksRef','powerUpsRef','muzzleFlashesRef',
            'godMeleeStrikesRef','bossDefeatExplosionEventsRef'])r[name].current=[]
          for(const name of ['stageEntryRef','stageClearRef','bossAlertRef','bossEntranceSlamRef','nukeFlashRef',
            'asteroidWarningRef','asteroidSpawnDelayRef','victoryBlackoutRef'])r[name].current=0
          for(const name of ['carrierStopRef','pendingNextStageRef','randomEventRef','nukeStrikeRef','godBarrageRef'])r[name].current=null
          r.initialLaunchRef.current=false;r.phaseRef.current='playing';r.raidModeRef.current=stage===16?'endless':'campaign'
          r.stageRef.current=stage;r.waveRef.current=stage;r.journeyStageAgeRef.current=35
          r.sceneryRunTokenRef.current=stage*1009+17
          r.formationTimerRef.current=999;r.spawnTimerRef.current=999;r.bossTimerRef.current=999
          r.asteroidClusterTimerRef.current=999;r.randomEventTimerRef.current=999
          r.bossMessageRef.current=null;r.cameraShakeRef.current.until=0
          r.remotePlayerRef.current=null;r.sameScreenCoopRef.current=false;r.coOpRunRef.current=false
          r.playerRef.current=structuredClone(player)
          Object.assign(r.playerRef.current,{x:50,y:82,hp:player.maxHp,invuln:999,score:0,specialCooldown:0})
          r.enemyHpMultRef.current=1
          if(scenario==='boss'||scenario==='capture') {
            actions.spawnBoss(bosses.find(boss=>boss.stage===stage).kind)
            const boss=r.enemiesRef.current[0]
            Object.assign(boss,{x:50,y:boss.bossKind==='final'?17:boss.bossKind==='snake'?19:22,
              phase:0,shieldTime:0,fireCooldown:1,bossAttackState:'recovery',bossAttackTimer:scenario==='capture'?999:.15})
            if(scenario==='boss')boss.hp=boss.maxHp*.6
            r.bossAlertRef.current=0;r.bossEntranceSlamRef.current=0;r.bossMessageRef.current=null
            r.cameraShakeRef.current.until=0
          } else if(scenario==='entry')r.stageEntryRef.current=stage===5||stage===10?1.4:.8
          else if(scenario==='transition') {
            r.stageClearRef.current=1.8;r.pendingNextStageRef.current=stage===15?null:stage+1
          } else {
            r.wingSerialRef.current=0
            for(let i=0;i<3;i++)actions.formation()
            r.enemiesRef.current.forEach((enemy,i)=>Object.assign(enemy,{y:14+(i%4)*12,hp:100000,maxHp:100000,fireCooldown:.1+i*.018}))
          }
          if(scenario==='burst'||scenario==='coop') {
            for(const key of ['spread','laser','scatter','rocket','homing'])r.playerRef.current.weapons[key]=3
            r.playerRef.current.optionStacks=3;r.playerRef.current.optionTimer=30
            while(r.asteroidsRef.current.length<16)actions.asteroids()
            r.asteroidsRef.current.forEach((rock,i)=>Object.assign(rock,{y:12+(i%5)*13,x:12+(i*17)%78,hp:100000,maxHp:100000}))
            actions.sparks(50,45,'#67e8f9',45,7)
            for(let i=0;i<6;i++)actions.ripple(12+i*14,30+i*6,'#67e8f9',10)
          }
          if(scenario==='coop') {
            r.sameScreenCoopRef.current=true;r.coOpRunRef.current=true
            r.remotePlayerRef.current=structuredClone(r.playerRef.current)
            r.remotePlayerRef.current.x=68;r.playerRef.current.x=32
          }
          actions.sync()
        },
        frame(update=true) {
          gpu.calls=0;gpu.triangles=0;shipCpu=0
          const start=performance.now()
          if(update)actions.update(1/60)
          const afterSim=performance.now()
          actions.draw(performance.now())
          const afterDraw=performance.now(),stats=ships.getShipStats(),costs=r.drawCostsRef.current
          return {simulationMs:afterSim-start,drawMs:afterDraw-afterSim,backgroundMs:costs.backgroundMs,
            pixiSubmitMs:costs.gpuSubmitMs,canvasMs:Math.max(0,costs.canvasMs-shipCpu),shipSubmitMs:shipCpu,bossMs:costs.bossMs,
            pixiCalls:gpu.calls,pixiTriangles:gpu.triangles,shipCalls:stats.drawCalls,shipTriangles:stats.triangles,
            hulls:stats.hulls,shipTextures:stats.textures,gpuMs:background.getRaidGpuStats().gpuFrameMs,
            enemies:r.enemiesRef.current.length,shots:r.shotsRef.current.length,enemyShots:r.enemyShotsRef.current.length,
            asteroids:r.asteroidsRef.current.length,dpr:r.viewportMetricsRef.current.dpr}
        },
      }
      window.campaignReview=review
      window.reviewManual=true
      return bosses
    },refNames)
    await page.evaluate(async()=>{await new Promise(window.reviewRAF);await new Promise(window.reviewRAF)})
    assert.equal(await page.evaluate(()=>typeof window.reviewLoop),'function')
    if(landscape&&!profileOnly) for(const boss of catalog) {
      const filename='boss-'+String(boss.stage).padStart(2,'0')+'-landscape-v1.png'
      if(resume&&await access(output+'/'+filename).then(()=>true,()=>false)) {
        captures.push({...boss,file:filename})
        continue
      }
      await page.evaluate(stage=>{
        const review=window.campaignReview
        review.reset(stage)
        for(let i=0;i<4;i++)review.frame(false)
      },boss.stage)
      await page.waitForTimeout(240)
      await page.evaluate(()=>{window.campaignReview.frame(false);window.campaignReview.actions.sync()})
      await page.evaluate(()=>new Promise(window.reviewRAF))
      await page.screenshot({path:output+'/'+filename})
      captures.push({...boss,file:filename})
      console.log('Captured',boss.stage,boss.name)
    }
    if(!capturesOnly) for(const stage of Array.from({length:15},(_,index)=>index+1)) {
      for(const scenario of ['waves','boss','burst','entry','transition',...([1,5,10,15].includes(stage)?['coop']:[])]) {
        if(resume&&results.some(row=>row.view===view&&row.stage===stage&&row.scenario===scenario))continue
        const summary=await page.evaluate(async({stage,scenario,frames})=>{
          const review=window.campaignReview
          review.reset(stage,scenario)
          const samples=[]
          for(let i=0;i<frames+8;i++) {
            await new Promise(window.reviewRAF)
            const sample=review.frame()
            if(i>=8)samples.push(sample)
            if(i%12===0)review.actions.sync()
            const boss=review.r.enemiesRef.current.find(enemy=>enemy.isBoss)
            if(boss)boss.hp=boss.maxHp*.6
            review.r.playerRef.current.invuln=999
          }
          const summary={samples:samples.length}
          for(const key of Object.keys(samples[0])) {
            const values=samples.map(sample=>sample[key]).filter(value=>typeof value==='number'&&Number.isFinite(value)).sort((a,b)=>a-b)
            summary[key]=values.length?{mean:values.reduce((a,b)=>a+b,0)/values.length,p95:values[Math.floor(values.length*.95)],max:values.at(-1)}:null
          }
          return summary
        },{stage,scenario,frames})
        results.push({view,stage,scenario,...summary})
        console.log('Profiled',view,stage,scenario,'CPU',summary.drawMs.mean.toFixed(2),'ms')
        // Keep partial evidence if a later scenario exposes a bug.
        await writeFile(output+'/loads-v1.json',JSON.stringify({environment:'Headless Chromium / SwiftShader',quality:'max',deviceScaleFactor:1,
          note:'CPU calls and submitted work in controlled diagnostic states. GPU timers may be unavailable. Not a device FPS benchmark.',results,errors},null,2))
      }
    }
    await page.close()
  }
  if(captures.length)await writeFile(output+'/bosses-v1.json',JSON.stringify(captures,null,2))
  if(captures.length)await writeFile(output+'/bosses-v1.md',captures.map(boss=>
    `${boss.stage===16?'Anomaly':'Stage '+boss.stage} — ${boss.name}\n\n![${boss.name}](${boss.file})`).join('\n\n')+'\n')
  assert.deepEqual(errors,[])
  console.log('Review complete:',captures.length,'gameplay captures;',results.length,'whole-campaign workload cases')
} finally {
  await browser?.close()
  server?.kill()
  await exited
}
