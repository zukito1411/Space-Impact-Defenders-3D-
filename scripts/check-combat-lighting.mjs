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
