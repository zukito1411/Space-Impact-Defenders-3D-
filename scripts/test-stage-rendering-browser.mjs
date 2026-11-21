import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { once } from 'node:events'

const base = process.env.RAID_TEST_URL ?? 'http://127.0.0.1:5197'
const server = process.env.RAID_TEST_URL ? null : spawn(process.execPath,
  ['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5197','--strictPort'], {stdio:'ignore'})
const exited = server ? once(server,'exit') : Promise.resolve()
let browser
try {
  for (let attempt=0; attempt<100; attempt++) {
    try { if ((await fetch(base)).ok) break } catch {}
    await new Promise(resolve=>setTimeout(resolve,200))
  }
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH,
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'] })
  await mkdir('presentation-review', { recursive: true })
  const page = await browser.newPage({ viewport: { width: 844, height: 390 } })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => {
    if (message.type()==='error' && /THREE\.|WebGL|shader|program/i.test(message.text())) errors.push(message.text())
  })
  await page.goto(base + '/scripts/presentation-fixture.html?briefing=1')
  await page.evaluate(async () => {
    const { PixiRaidBackground, DEFAULT_RAID_PALETTE } = await import('/src/components/games/raid/background.ts')
    const host = document.createElement('div')
    document.body.replaceChildren(host)
    const bg = new PixiRaidBackground()
    if (!await bg.init(host)) throw new Error('Background initialization failed')
    const sample = document.createElement('canvas')
    sample.width = 84; sample.height = 39
    const context = sample.getContext('2d', { willReadFrequently: true })
    window.backgroundCheck = { bg, draw(stage, time, age, landscape) {
      const theme = stage === 5 ? 9101 : stage === 10 ? 9102 : stage
      if (!bg.render({ width: landscape ? 844 : 393, height: landscape ? 390 : 852, dpr: 1, time, quality: 'high',
        palette: DEFAULT_RAID_PALETTE, stageTheme: theme, stageNumber: stage, stageAge: age,
        raidMode: 'campaign', landscape, runToken: 1, stageRush: 0, bossIntensity: 0, devilCorruption: 0 })) {
        throw new Error('Background frame failed at stage ' + stage)
      }
      bg.app.render()
      context.clearRect(0, 0, 84, 39)
      context.drawImage(bg.app.canvas, 0, 0, 84, 39)
      const pixels = context.getImageData(0, 0, 84, 39).data
      let orange = 0
      const colors = new Set()
      for (let i = 0; i < pixels.length; i += 4) {
        const [r,g,b] = pixels.slice(i,i+3)
        if (r > 95 && r < 170 && g > 45 && g < 100 && b < 30) orange++
        colors.add((r>>3)*1024+(g>>3)*32+(b>>3))
      }
      return { orange: orange/(pixels.length/4), colors: colors.size }
    } }
  })
  let time = 0
  for (const landscape of [false, true]) {
    await page.setViewportSize(landscape ? {width:844,height:390} : {width:393,height:852})
    for (const stage of [1,2,3,4,5,6,9,10,11,15,1]) {
      for (const age of [0,3,25]) {
        time += 1000
        const stats = await page.evaluate(({stage,time,age,landscape}) =>
          window.backgroundCheck.draw(stage,time,age,landscape), {stage,time,age,landscape})
        assert.ok(stats.colors > 45, `Stage ${stage} became a flat field (${JSON.stringify(stats)})`)
        if (stage !== 5 && stage !== 10) assert.ok(stats.orange < .25, `Stage ${stage} lost the sky`)
        if (landscape && stage===2 && age===25) {
          await page.screenshot({path:'presentation-review/stage-transition-fixed.png'})
        }
      }
    }
  }
  await page.evaluate(() => { window.backgroundCheck.bg.destroy(); document.body.replaceChildren() })
  await page.evaluate(async () => {
    const { ThreeShipPresentation } = await import('/src/components/games/raid/threeShipPresentation.ts')
    const { createShipLightingFrame, sampleShipLighting } = await import('/src/components/games/raid/shipLighting.ts')
    const host = document.createElement('div')
    document.body.replaceChildren(host)
    const scene = new ThreeShipPresentation()
    if (!await scene.init(host)) throw new Error('Ship initialization failed')
    const keys = ['dreadnought','fighterCinder','alienHull0','eliteHull0','commandHull1']
    await Promise.all(keys.map(key => scene.prepareHull(key)))
    const lighting = createShipLightingFrame()
    // A sun behind the ship reproduces the unreadable night-side case.
    sampleShipLighting(lighting, new Float32Array([0,0,-1]), 2, 0, 0, 0)
    const { getHullRegistration } = await import('/src/components/games/raid/liveHullAssets.ts')
    const { sampleLiveHullPoints } = await import('/src/components/games/raid/liveHullBridge.ts')
    scene.render({ width:844, height:390, dpr:1, lighting })
    keys.forEach((key,i) => {
      if (!scene.submitHull({id:key,key,x:90+i*165,y:195,size:155,bank:.02,
        angle:-Math.PI/2,alpha:1,landscape:true})) throw new Error('Missing hull '+key)
    })
    scene.present()
    const data = getHullRegistration('dreadnought')
    const [x,y,z] = data.nozzles[0]
    const node = scene.hulls.get('dreadnought')
    const actual = node.object.localToWorld(node.object.position.clone().set(x,y,z))
    const [px,py] = sampleLiveHullPoints('dreadnought',.02,true).nozzles[0]
    const angle=-Math.PI/2
    const expectedX=90+155*(Math.cos(angle)*px+Math.sin(angle)*py)
    const expectedY=390-195+155*(Math.sin(angle)*px-Math.cos(angle)*py)
    if(Math.hypot(actual.x-expectedX,actual.y-expectedY)>.001) throw new Error('Hull heading detached the exhaust hardpoint')
    const sample = document.createElement('canvas'); sample.width=844; sample.height=390
    const context = sample.getContext('2d', {willReadFrequently:true})
    context.drawImage(host.querySelector('canvas'),0,0)
    const pixels=context.getImageData(0,0,844,390).data
    const scores = keys.map((key,i) => {
      let sum=0,count=0
      for(let y=90;y<300;y++) for(let x=i*165;x<Math.min(844,(i+1)*165);x++) {
        const p=(y*844+x)*4
        if(pixels[p+3]<240)continue
        sum+=pixels[p]*.2126+pixels[p+1]*.7152+pixels[p+2]*.0722;count++
      }
      return {key,count,luma:sum/Math.max(1,count)}
    })
    window.shipCheck={scene,scores}
  })
  const scores = await page.evaluate(() => window.shipCheck.scores)
  console.log('Backlit hull samples', scores)
  await page.screenshot({path:'presentation-review/enemy-hulls-backlit.png'})
  for (const score of scores) {
    assert.ok(score.count > 300, score.key + ' did not render')
    assert.ok(score.luma > 25, score.key + ' became unreadably dark')
  }
  await page.screenshot({path:'presentation-review/enemy-hulls-backlit.png'})
  // All regular capital hulls must remain live meshes with bounded draws;
  // this catches missing armor textures, shader failures and mesh-splitting regressions.
  await page.setViewportSize({width:1440,height:960})
  for (const landscape of [false,true]) {
    const stats=await page.evaluate(async landscape => {
      const scene=window.shipCheck.scene
      const { CAMPAIGN_BOSS_ART }=await import('/src/components/games/raid/bossCatalog.ts')
      const { BOSS_HULL_DESIGNS }=await import('/src/components/games/raid/bossHullDesigns.ts')
      scene.render({width:1440,height:960,dpr:1})
      for (let i=0;i<CAMPAIGN_BOSS_ART.length;i++) {
        const stage=CAMPAIGN_BOSS_ART[i].stage,key='commandHull'+stage
        if (!scene.submitHull({id:'review-'+stage,key,x:180+i%4*360,y:160+Math.floor(i/4)*320,
          size:246,bank:0,angle:landscape?-Math.PI/2:0,alpha:1,landscape})) throw new Error('Missing boss '+stage)
        const node=scene.hulls.get('review-'+stage)
        if (BOSS_HULL_DESIGNS[stage].barrels.length && !node.object.getObjectByName('boss-armament-v1')) {
          throw new Error('Missing physical cannon geometry at stage '+stage)
        }
      }
      scene.present()
      return scene.getShipStats()
    },landscape)
    assert.equal(stats.hulls,12,'regular boss catalog lost a 3D hull')
    assert.ok(stats.drawCalls<=23+(stats.lampDraws??0),'boss details split into excessive draws')
    assert.ok(stats.triangles>735872,'boss reconstruction lost the original mesh detail')
    await page.screenshot({path:'presentation-review/boss-hulls-v1-'+(landscape?'landscape':'portrait')+'.png'})
  }
  await page.evaluate(() => window.shipCheck.scene.destroy())
  assert.deepEqual(errors, [])
  console.log('Stage transitions retained detailed sky in both views. Backlit player and enemy hulls stayed readable.', scores)
} finally { await browser?.close(); server?.kill(); await exited }
