import assert from 'node:assert/strict'
import {writeFile} from 'node:fs/promises'

export async function checkHullLamps(page,output,landscape){
 const result=await page.evaluate(async landscape=>{
  const review=window.campaignReview,scene=review.ships,lamps=scene.lamps
  const {getInitialPlayer,getShipByKey}=await import('/src/components/games/raid/state.ts')
  const manifest=await fetch('/assets/ships/models/v1/manifest.json').then(r=>r.json())
  const players=[]
  for(const key of Object.keys(manifest)){
   await scene.prepareHull(key);review.reset(1,'waves');review.r.enemiesRef.current=[]
   review.r.playerRef.current=getInitialPlayer(getShipByKey('rocket'),key)
   review.actions.draw(40000)
   const node=[...scene.hulls.values()].find(n=>n.key===key&&n.group.visible)
   const sites=node?.lamps.reduce((n,b)=>n+b.sites.length,0)??0
   if(sites<2)throw Error('Missing fitted player lamps: '+key)
   players.push({key,sites})
  }
  const attributes=Object.values(lamps.geometry.attributes).map(a=>a.array)
  const nativeAdd=lamps.add,off=()=>{},samples=[]
  const scenarios=['waves','burst','entry','transition','coop']
  for(let stage=1;stage<=15;stage++)for(const scenario of ['boss',scenarios[(stage-1)%scenarios.length]]){
   review.reset(stage,scenario);review.frame(false)
   if(scenario==='boss'){
    const boss=review.r.enemiesRef.current.find(e=>e.isBoss),node=scene.hulls.get('enemy:'+boss.id)
    if(!node?.lamps.length)throw Error('Boss missing its core/rim fittings: '+stage)
   }
   const pair=[]
   for(const enabled of [false,true]){
    lamps.add=enabled?nativeAdd:off
    // Existing pipelines and buffers are warm before the measured samples.
    review.actions.draw(40000)
    const beforePrograms=scene.renderer.info.programs.length,costs=[]
    for(let i=0;i<3;i++){
     const start=performance.now();review.actions.draw(40000);costs.push(performance.now()-start)
    }
    const stats=scene.getShipStats()
    if(scene.renderer.info.programs.length!==beforePrograms)throw Error('Lamp shader compiled during steady gameplay')
    pair.push({enabled,cpuDrawMs:costs,...stats})
   }
   samples.push({stage,scenario,before:pair[0],after:pair[1]})
  }
  lamps.add=nativeAdd
  const buffersReused=Object.values(lamps.geometry.attributes).every((a,i)=>a.array===attributes[i])
  // Clock freeze and reduced-motion hold are independent of display rate.
  review.reset(2);review.actions.draw(40000)
  const frozen=Array.from(lamps.geometry.getAttribute('lampColor').array)
  scene.present();const repeats=Array.from(lamps.geometry.getAttribute('lampColor').array)
  const stableClock=frozen.every((v,i)=>v===repeats[i])
  let realLights=0;scene.world.traverse(o=>{if(o.isPointLight||o.isSpotLight)realLights++})
  review.reset(16);review.frame(false)
  const devil=[...scene.hulls.values()].filter(n=>n.key.includes('devil')).length
  return {environment:'Headless Chromium / SwiftShader; CPU draw/submission samples, not device FPS or hardware GPU timing',
   coverage:'All 15 stages in both views; bosses plus rotating formation, weapon/asteroid burst, entry, clear and co-op fixtures; 3 samples per mode',
   landscape,players,samples,buffersReused,stableClock,realLights,devil}
 },landscape)
 assert.equal(result.players.length,24)
 assert.ok(result.buffersReused&&result.stableClock)
 assert.equal(result.realLights,0);assert.equal(result.devil,0)
 for(const s of result.samples){
  assert.ok(s.after.lampPoints<=512)
  assert.ok(s.after.lampDraws<=1)
  assert.equal(s.after.drawCalls,s.before.drawCalls+s.after.lampDraws,'Lamps grew per-actor draw calls')
  assert.equal(s.after.triangles,s.before.triangles,'Hull geometry changed')
  assert.equal(s.after.textures,s.before.textures,'Lamps allocated a texture')
 }
 await writeFile(output+'/lamps-'+(landscape?'landscape':'portrait')+'-checks.json',JSON.stringify(result,null,2))
 // A large, native gameplay ship keeps the small fittings legible in review.
 await page.evaluate(async()=>{
  const review=window.campaignReview
  await review.ships.prepareHull('mesiahWhite')
  const {getInitialPlayer,getShipByKey}=await import('/src/components/games/raid/state.ts')
  review.reset(1,'waves');review.r.enemiesRef.current=[]
  review.r.playerRef.current=getInitialPlayer(getShipByKey('rocket'),'mesiahWhite')
  review.actions.draw(40000);review.actions.sync()
 })
 await page.screenshot({path:output+'/player-lamps-'+(landscape?'landscape':'portrait')+'.png'})
 console.log('Hull lamps: fitted ships, all-stage paired draw budgets, bounded buffers, stable clock and Devil exclusion verified',landscape?'landscape':'portrait')
}
