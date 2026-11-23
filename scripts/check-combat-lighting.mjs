import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'

/** Pixel comparisons use the same meshes, paint, camera and environment.
 * Legacy comparisons change only the prior fill-light uniforms in this fixture. */
export async function checkCombatLighting(page, output) {
  const checks=await page.evaluate(async()=>{
    const scene=window.campaignReview.ships
    const {createShipLightingFrame,sampleShipLighting}=await import('/src/components/games/raid/shipLighting.ts')
    const keys=['dreadnought','rocket','fighterCinder','fighterCinder','alienHull0','eliteHull0','commandHull2']
    await Promise.all([...new Set(keys)].map(key=>scene.prepareHull(key)))
    const canvas=document.createElement('canvas');canvas.width=844;canvas.height=390
    const ctx=canvas.getContext('2d',{willReadFrequently:true}),lighting=createShipLightingFrame(),results=[]
    const draw=(landscape,region,scenario,legacy=false)=>{
      const eclipse=scenario==='eclipse'
      sampleShipLighting(lighting,new Float32Array(scenario==='backlit'?[0,0,-1]:[-.61,-.49,.62]),region,0,0,0)
      scene.previousLightSeconds=null
      scene.render({width:844,height:390,dpr:1,lighting,dock:scenario==='dock'?1:0,eclipseAt:()=>eclipse?1:0})
      keys.forEach((key,i)=>{
        if(!scene.submitHull({id:'readability:'+i,key,x:60+i*120,y:195,size:110,bank:.02,
          angle:landscape?-Math.PI/2:0,alpha:1,landscape}))throw Error('Hull not prepared: '+key)
      })
      if(legacy) {
        const state=scene.lighting,fill=scene.fillLight
        fill.color.setRGB(...state.fillColor);fill.intensity=state.fillIntensity
        scene.lightDirection.set(state.fillDirection[0],-state.fillDirection[1],state.fillDirection[2]).normalize()
        fill.position.copy(fill.target.position).addScaledVector(scene.lightDirection,1800)
      }
      scene.present()
      ctx.clearRect(0,0,844,390);ctx.drawImage(scene.renderer.domElement,0,0)
      const pixels=ctx.getImageData(0,0,844,390).data
      const hulls=keys.map((key,i)=>{
        let luma=0,count=0,clipped=0
        for(let y=115;y<275;y++)for(let x=i*120;x<Math.min(844,(i+1)*120);x++) {
          const p=(y*844+x)*4;if(pixels[p+3]<240)continue
          luma+=pixels[p]*.2126+pixels[p+1]*.7152+pixels[p+2]*.0722;count++
          if(pixels[p]>248&&pixels[p+1]>248&&pixels[p+2]>248)clipped++
        }
        return {key,pixels:count,luma:luma/Math.max(1,count),clipped:clipped/Math.max(1,count)}
      })
      return {hulls,drawCalls:scene.getShipStats().drawCalls,instanceBatches:scene.getShipStats().instanceBatches}
    }
    for(const landscape of [true,false])for(let region=0;region<4;region++)for(const scenario of ['backlit','eclipse']) {
      const before=draw(landscape,region,scenario,true),after=draw(landscape,region,scenario)
      results.push({landscape,region,scenario,before,after})
    }
    const before=draw(true,0,'dock',true),after=draw(true,0,'dock')
    results.push({landscape:true,region:0,scenario:'dock',before,after})
    return results
  })
  await writeFile(output+'/readability-checks.json',JSON.stringify({environment:'Headless Chromium / SwiftShader',checks},null,2))
  for(const check of checks) {
    assert.equal(check.after.drawCalls,check.before.drawCalls,'Readability added hull draws')
    assert.equal(check.after.instanceBatches,check.before.instanceBatches,'Readability broke instancing')
    for(let i=0;i<check.after.hulls.length;i++) {
      const after=check.after.hulls[i],before=check.before.hulls[i]
      assert.ok(after.pixels>150,after.key+' failed to render')
      if(check.scenario==='dock')assert.ok(Math.abs(after.luma-before.luma)<.05,'Carrier lighting changed')
      else {
        assert.ok(after.luma>(/^(alien|elite)/.test(after.key)?20:25),after.key+' still unreadable: '+JSON.stringify(check))
        assert.ok(after.luma>before.luma*1.12,after.key+' gained insufficient night-side detail')
      }
      assert.ok(after.luma<180&&after.clipped<.1,after.key+' washed out its paint')
    }
  }
  console.log('Verified combat readability:',checks.length,'lighting/view cases; carrier and instancing preserved')
}

/** Exercise the real Stage 2 shot emission and effects canvas at the rAF boundary. */
export async function checkPilotWeaponGlows(page, output, landscape) {
 const checks=await page.evaluate(async()=>{
  const {r,actions,ships}=window.campaignReview
  const {getWeaponIgnition,warmRaidWeaponGlows}=await import('/src/components/games/raid/weaponPresentation.ts')
  const {getCachedProjectileOrbSprite,spriteGlowCache}=await import('/src/components/games/raid/utils.ts')
  const checks=[]
  const quality=r.graphicsQualityRef.current
  const canvas=document.querySelector('.raid__fx-canvas')
  const ctx=canvas.getContext('2d')
  const original=ctx.drawImage
  warmRaidWeaponGlows()
  const exhaustSources=new Set([...spriteGlowCache.values()].map(sprite=>sprite.canvas))
  let exhaust=0
  try {
   for(const [preset,kind] of [['low','pulse'],['max','laser']]){
    reviewSetup(preset)
    const pilot=r.playerRef.current
    pilot.weapons.laser=kind==='laser'?2:0
    pilot.weaponCooldowns.laser=0
    const frameTime=performance.now()
    actions.update(1/60)
    const flash=r.muzzleFlashesRef.current.find(entry=>entry.owner===pilot&&entry.kind===kind)
    if(!flash)throw Error('Missing emitted '+kind+' muzzle')
    if(flash.at<frameTime)throw Error('Fixture missed the rAF timestamp boundary')
    const source=getCachedProjectileOrbSprite(getWeaponIgnition(kind).color,24).canvas
    let flashDraws=0
    ctx.drawImage=function(image,...args){
     if(image===source)flashDraws++
     if(exhaustSources.has(image))exhaust++
     return original.call(this,image,...args)
    }
    actions.draw(frameTime)
    const {cssWidth,cssHeight,dpr}=r.viewportMetricsRef.current
    const x=Math.round((pilot.x+flash.x)*cssWidth*dpr/100),y=Math.round((pilot.y+flash.y)*cssHeight*dpr/100)
    const brightness=()=>{
     const pixels=ctx.getImageData(x-3,y-3,7,7).data
     let light=0
     for(let i=0;i<pixels.length;i+=4)light+=(pixels[i]+pixels[i+1]+pixels[i+2])*pixels[i+3]/255
     return light/49
    }
    const withFlash=brightness()
    const flashDrawsWhileFiring=flashDraws
    const exhaustWhileFiring=exhaust
    const draws=ships.getShipStats().drawCalls
    actions.draw(flash.at+200)
    const withoutFlash=brightness()
    checks.push({preset,kind,flashDrawsWhileFiring,exhaustWhileFiring,withFlash,withoutFlash,
     expired:!r.muzzleFlashesRef.current.length,draws,drawsAfter:ships.getShipStats().drawCalls})
    if(kind==='laser'){
     r.muzzleFlashesRef.current=[flash]
     actions.draw(frameTime)
     actions.sync()
    }
   }
  } finally {
   ctx.drawImage=original
   r.graphicsQualityRef.current=quality
  }
  return checks
  function reviewSetup(preset) {
   window.campaignReview.reset(2,'waves')
   r.enemiesRef.current=[]
   r.journeyStageAgeRef.current=1
   r.graphicsQualityRef.current=preset
   r.playerRef.current.fireCooldown=0
   r.playerRef.current.invuln=0
   exhaust=0
  }
 })
 for(const check of checks){
  assert.ok(check.flashDrawsWhileFiring>0&&check.withFlash>check.withoutFlash+35,'Muzzle glow did not appear: '+JSON.stringify(check))
  assert.ok(check.exhaustWhileFiring>0,'Missing nozzle bloom: '+JSON.stringify(check))
  assert.ok(check.expired,'Muzzle glow outlasted its shot')
  assert.equal(check.draws,check.drawsAfter,'Muzzle bloom added 3D draw calls')
 }
 const view=landscape?'landscape':'portrait'
 await page.screenshot({path:output+'/stage-02-pilot-glow-'+view+'.png'})
 await writeFile(output+'/pilot-glow-'+view+'-checks.json',JSON.stringify(checks,null,2))
 console.log('Stage 2 muzzle and exhaust glow verified in',view,checks.map(({preset,kind})=>preset+'/'+kind).join(', '))
}
