import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdir, readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'

const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5186','--strictPort'], {stdio:'ignore'})
const exited = once(server,'exit')
let browser
try {
  for (let i=0;i<100;i++) {
    try { if ((await fetch('http://127.0.0.1:5186')).ok) break } catch {}
    await new Promise(resolve=>setTimeout(resolve,200))
  }
  browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH,
    args:['--enable-unsafe-swiftshader','--use-angle=swiftshader']})
  await mkdir('presentation-review',{recursive:true})
  const errors=[]
  const page=await browser.newPage({viewport:{width:900,height:650}})
  page.on('pageerror',error=>errors.push(error.message))
  page.on('response',response=>{if(response.status()>=400)errors.push(response.status()+' '+response.url())})
  page.on('console',message=>{if(message.type()==='error'&&!message.text().includes('net::')) errors.push(message.text())})
  const atlasRequests=[]
  page.on('request',request=>{if(/banking\/.*-v15\.webp/.test(request.url()))atlasRequests.push(request.url())})
  await page.goto('http://127.0.0.1:5186/scripts/live-three-fixture.html')
  await page.waitForFunction(()=>window.threeFixture?.ready,{},{timeout:120000})
  const keys=Object.keys(JSON.parse(await readFile('public/assets/ships/models/v1/manifest.json','utf8')))
  assert.equal(keys.length,24)
  for (const key of keys) {
    const stats=await page.evaluate(key=>window.threeFixture.draw(key,.031,true),key)
    assert.equal(stats.drawn,true,key)
    assert.ok(stats.triangles>1000,key+' did not submit a real mesh')
  }
  for(const key of ['godGundam','spiegel']) {
    const stats=await page.evaluate(key=>window.threeFixture.draw(key,.02,false),key)
    assert.equal(stats.drawn,true,key)
  }
  const hash=buffer=>createHash('sha256').update(buffer).digest('hex')
  await page.evaluate(()=>window.threeFixture.draw('rocket',.001,false))
  const a=hash(await page.screenshot({clip:{x:240,y:130,width:420,height:420}}))
  await page.evaluate(()=>window.threeFixture.draw('rocket',.002,false))
  const b=hash(await page.screenshot({clip:{x:240,y:130,width:420,height:420}}))
  assert.notEqual(a,b,'sub-pose turns must rotate the mesh continuously')
  assert.deepEqual(atlasRequests,[],'live rendering fetched a frame-switching hull atlas')
  await page.screenshot({path:'presentation-review/live-three-portrait.png'})
  await page.evaluate(()=>window.threeFixture.draw('fast',-.071,true))
  await page.screenshot({path:'presentation-review/live-three-landscape.png'})
  await page.evaluate(()=>window.threeFixture.draw('rocket',0,true,9101))
  await page.screenshot({path:'presentation-review/live-three-surface.png'})
  assert.deepEqual(errors,[])
  await page.evaluate(()=>window.threeFixture.scene.destroy())
  await page.close()
  const gameplay=await browser.newPage({viewport:{width:844,height:390},hasTouch:true,reducedMotion:'reduce'})
  const gameErrors=[]
  gameplay.on('pageerror',error=>gameErrors.push(error.message))
  await gameplay.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort())
  await gameplay.goto('http://127.0.0.1:5186/scripts/presentation-fixture.html')
  await gameplay.locator('button.raid__start').first().click({timeout:120000})
  await gameplay.locator('.raid__carrier-briefing').waitFor({timeout:120000})
  await gameplay.locator('.raid__carrier-skip').click()
  await gameplay.waitForFunction(()=>document.querySelector('.raid')?.dataset.carrierStage==='flight',{},{timeout:120000})
  await gameplay.screenshot({path:'presentation-review/live-three-gameplay.png'})
  assert.equal(await gameplay.locator('[role="alert"]').count(),0,'3D renderer reported a launch error')
  assert.deepEqual(gameErrors,[])
  await gameplay.close()
  console.log('24 authored GLBs, live reconstructed mechs, continuous mesh roll, no banking atlases, surface scene, gameplay launch and teardown passed')
} finally {
  await browser?.close()
  server.kill()
  await exited
}
