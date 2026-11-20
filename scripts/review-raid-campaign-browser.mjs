import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { chromium } from 'playwright'

// Diagnostic setup stays in the browser fixture. Production simulation,
// cameras, renderers, stage artwork and quality budgets are used unchanged.
const base=process.env.RAID_TEST_URL ?? 'http://127.0.0.1:5200'
const output=process.env.RAID_REVIEW_OUTPUT??'presentation-review/campaign-v1'
const selectedStages=process.env.RAID_REVIEW_STAGES?.split(',').map(Number)
const desktop=process.env.RAID_REVIEW_DESKTOP==='1'
const profileOnly=process.argv.includes('--profile-only')
const capturesOnly=process.argv.includes('--captures-only')||(!profileOnly&&!process.argv.includes('--profile'))
const resume=process.argv.includes('--resume')
const specialOnly=process.argv.includes('--special-only')
const verifySpecial=specialOnly||process.argv.includes('--verify-special')
const verifyMobs=process.argv.includes('--verify-mobs')
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
  const specialChecks=[],mobChecks=[]
  for(const landscape of (capturesOnly&&!verifySpecial&&!verifyMobs ? [true] : [true,false])) {
    const view=landscape?'landscape':'portrait'
    const page=await browser.newPage({viewport:landscape?(desktop?{width:1920,height:1080}:{width:844,height:390}):{width:393,height:852},
      deviceScaleFactor:1,hasTouch:!desktop,reducedMotion:'no-preference'})
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
            pixiSubmitMs:costs.gpuSubmitMs,canvasMs:costs.canvasMs,shipSubmitMs:shipCpu,bossMs:costs.bossMs,
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
    if(landscape&&!profileOnly) for(const boss of catalog.filter(boss=>!selectedStages||selectedStages.includes(boss.stage))) {
      const filename='boss-'+String(boss.stage).padStart(2,'0')+'-landscape-v1.png'
      if(specialOnly&&![5,10,15].includes(boss.stage)) {
        // Reuse the unchanged bosses from the completed gallery while
        // iterating only on special anatomy. Missing evidence fails loudly.
        await access(output+'/'+filename)
        captures.push({...boss,file:filename})
        continue
      }
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
      if(selectedStages) {
        const hud=await page.evaluate(()=>{
          const panel=document.querySelector('.raid__hud .raid__stat'),text=panel?.querySelector('b')
          const p=getComputedStyle(panel),t=getComputedStyle(text)
          return {background:p.backgroundColor,panelOpacity:p.opacity,textOpacity:t.opacity,textColor:t.color,blur:p.backdropFilter}
        })
        assert.equal(hud.textOpacity,'1','HUD text was faded')
        assert.equal(hud.panelOpacity,'1','HUD container opacity faded its children')
        assert.ok(hud.background.endsWith('0.28)'),'HUD skin overrode translucent background')
        await writeFile(output+'/hud-checks.json',JSON.stringify(hud,null,2))
      }
      console.log('Captured',boss.stage,boss.name)
    }
    if(verifySpecial)for(const stage of [5,10,15])for(const phase of stage===10?['idle','attack','bite','retract']:['idle','attack']) {
      const attacking=phase!=='idle'
      const stats=await page.evaluate(({stage,attacking,phase})=>{
        const review=window.campaignReview
        review.reset(stage)
        const enemy=review.r.enemiesRef.current[0]
        if(attacking)Object.assign(enemy,{chargePattern:stage===10?'cross':'trident',chargeTimer:.2,
          chargeLane:50,chargeTargetY:64})
        if(phase==='bite')enemy.chargeTimer=.001
        if(phase==='retract')Object.assign(enemy,{chargeTimer:0,beamVolleyRecovery:.21})
        review.frame(false)
        const node=review.ships.hulls.get('enemy:'+enemy.id)
        if(!node||!node.group.visible)throw Error('Special boss missing live hull: '+stage)
        const limb=node.object.getObjectByName(stage===5?'boss-organic-squid-v1':'boss-organic-appendages-v1')
        const head=stage===5?limb:node.object.getObjectByName('boss-organic-head-v1')
        if(stage!==15&&(!limb||!head))throw Error('Missing organic anatomy: '+stage)
        const materials=limb?(Array.isArray(limb.material)?limb.material:[limb.material]):[]
        const shaderPose=materials.at(-1)?.userData.bossPose
        if(stage===5&&(limb.userData.squidAnchors?.length!==8||limb.geometry.groups.length!==2))throw Error('Squid is not one connected mantle/arm mesh')
        if(stage!==15&&(!shaderPose||attacking&&shaderPose.attack.value<=0))throw Error('Organic attack did not reach GPU uniforms')
        if(stage===15&&!node.object.getObjectByName('boss-armament-v1'))throw Error('Mothership batteries missing')
        const buffers=limb?.geometry.getAttribute('position').array
        const first=shaderPose?.time.value
        const heading=node.group.quaternion.clone(),spin=node.object.rotation.z
        review.actions.draw(performance.now()+180)
        if(buffers&&limb.geometry.getAttribute('position').array!==buffers)throw Error('Organic animation rebuilt immutable buffers')
        if(shaderPose&&shaderPose.time.value<=first)throw Error('Organic pose clock stopped')
        if(stage===15) {
          if(heading.angleTo(node.group.quaternion)>.025)throw Error('Mothership spin rotated the projected flight plane')
          if(node.object.rotation.z<=spin)throw Error('Mothership local spin stopped')
        }
        let faceOcclusion
        if(stage===10) {
          // Compare actual lit head pixels with and without the body, in the
          // native camera. The body must not replace opaque face fragments.
          const source=review.ships.renderer.domElement,probe=document.createElement('canvas')
          probe.width=source.width;probe.height=source.height
          const ctx=probe.getContext('2d',{willReadFrequently:true})
          ctx.drawImage(source,0,0)
          const full=ctx.getImageData(0,0,probe.width,probe.height).data
          limb.visible=false;review.ships.present()
          ctx.clearRect(0,0,probe.width,probe.height);ctx.drawImage(source,0,0)
          const isolated=ctx.getImageData(0,0,probe.width,probe.height).data
          limb.visible=true;review.ships.present()
          let tested=0,covered=0
          const stride=probe.width*4
          for(let y=1;y<probe.height-1;y++)for(let x=1;x<probe.width-1;x++) {
            const i=(y*probe.width+x)*4
            if([i,i-4,i+4,i-stride,i+stride].some(j=>isolated[j+3]<255))continue
            tested++
            if(Math.abs(full[i]-isolated[i])+Math.abs(full[i+1]-isolated[i+1])+Math.abs(full[i+2]-isolated[i+2])>12)covered++
          }
          faceOcclusion={tested,covered}
          if(tested<1000||covered/tested>.002)throw Error('Cobra body covers its head in '+phase+': '+JSON.stringify(faceOcclusion))
        }
        let motionPixels
        if(stage!==15&&!attacking) {
          const source=review.ships.renderer.domElement,probe=document.createElement('canvas')
          probe.width=source.width;probe.height=source.height
          const ctx=probe.getContext('2d',{willReadFrequently:true})
          const poses=materials.map(m=>m.userData.bossPose).filter(Boolean)
          const time=shaderPose.time.value
          const pixels=(seconds,motion)=>{
            for(const pose of poses){pose.time.value=seconds;pose.motion.value=motion}
            review.ships.present();ctx.clearRect(0,0,probe.width,probe.height);ctx.drawImage(source,0,0)
            return ctx.getImageData(0,0,probe.width,probe.height).data
          }
          const difference=(a,b)=>{
            let count=0;for(let i=3;i<a.length;i+=4)if((a[i]>128)!==(b[i]>128))count++
            return count
          }
          motionPixels=difference(pixels(time,1),pixels(time+.55,1))
          const still=difference(pixels(time,0),pixels(time+.55,0))
          for(const pose of poses){pose.time.value=time;pose.motion.value=1}
          review.ships.present()
          if(motionPixels<150||still>1)throw Error('Organic motion missing or reduced-motion pose unstable: '+JSON.stringify({stage,motionPixels,still}))
        }
        return {stage,attacking,...review.ships.getShipStats(),limbVertices:buffers?.length/3||0,
          attack:shaderPose?.attack.value||0,headMoved:head?.position.length()||0,faceOcclusion,motionPixels}
      },{stage,attacking,phase})
      specialChecks.push({view,phase,...stats})
      assert.ok(stats.drawCalls<=4,'Special boss split into excessive draws')
      assert.ok(stats.triangles>10000,'Boss geometry missing')
      await page.screenshot({path:output+'/special-'+stage+'-'+view+(attacking?'-'+phase:'')+'-v1.png'})
      console.log('Verified special',view,stage,phase,JSON.stringify(stats))
    }
    if(verifyMobs) {
      const stats=await page.evaluate(landscape=>{
        const review=window.campaignReview
        review.reset(1,'waves')
        while(review.r.enemiesRef.current.length<14)review.actions.formation()
        review.r.enemiesRef.current.splice(14)
        review.r.enemiesRef.current.forEach((enemy,i)=>Object.assign(enemy,{
          variant:i,x:landscape?20+Math.floor(i/4)*20:17+(i%4)*22,
          y:landscape?18+(i%4)*20:20+Math.floor(i/4)*17,vx:0,vy:8,phase:0,shieldTime:0,
          hp:100000,maxHp:100000,fireCooldown:999,hitFlash:0,
        }))
        review.frame(false);review.actions.sync()
        let singleDraw=0
        for(const enemy of review.r.enemiesRef.current) {
          const node=review.ships.hulls.get('enemy:'+enemy.id)
          let meshes=0
          node?.object.traverse(child=>{if(child.isMesh)meshes++})
          if(!node||meshes!==1)throw Error('Normal mob lost its single merged hull: '+enemy.variant)
          singleDraw++
        }
        return {...review.ships.getShipStats(),singleDraw}
      },landscape)
      assert.equal(stats.singleDraw,14)
      assert.ok(stats.drawCalls<=15,'Mob details added per-ship draws')
      mobChecks.push({view,...stats})
      await page.screenshot({path:output+'/mobs-'+view+'-v1.png'})
      console.log('Verified normal mobs',view,JSON.stringify(stats))
      await page.evaluate(()=>{
        const review=window.campaignReview;review.reset(2)
        Object.assign(review.r.enemiesRef.current[0],{shieldTime:2,bossAttackState:'warning',bossAttackPattern:'fan',
          bossAttackTimer:.6,bossWarningSeconds:1,bossEncounterAge:8,bossPhaseStartedAge:7.7,bossLastVolleyAge:0})
        review.frame(false);review.actions.sync()
      })
      await page.screenshot({path:output+'/boss-charge-clean-'+view+'-v1.png'})
    }
    if(!capturesOnly) for(const stage of selectedStages??Array.from({length:15},(_,index)=>index+1)) {
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
        await writeFile(output+'/loads-v1.json',JSON.stringify({environment:'Headless Chromium / SwiftShader',quality:'max',deviceScaleFactor:1,selectedStages:selectedStages??null,landscapeViewport:desktop?[1920,1080]:[844,390],
          note:'CPU calls and submitted work in controlled diagnostic states. GPU timers may be unavailable. Not a device FPS benchmark.',results,errors},null,2))
      }
    }
    await page.close()
  }
  if(captures.length)await writeFile(output+'/bosses-v1.json',JSON.stringify(captures,null,2))
  if(specialChecks.length)await writeFile(output+'/special-boss-checks-v1.json',JSON.stringify({specialChecks,errors},null,2))
  if(mobChecks.length)await writeFile(output+'/mob-hull-checks-v1.json',JSON.stringify({mobChecks,errors},null,2))
  if(captures.length)await writeFile(output+'/bosses-v1.md',captures.map(boss=>
    `${boss.stage===16?'Anomaly':'Stage '+boss.stage} — ${boss.name}\n\n![${boss.name}](${boss.file})`).join('\n\n')+'\n')
  assert.deepEqual(errors,[])
  console.log('Review complete:',captures.length,'gameplay captures;',results.length,selectedStages?'selected-stage workload cases':'whole-campaign workload cases')
} finally {
  await browser?.close()
  server?.kill()
  await exited
}
