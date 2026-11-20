import assert from 'node:assert/strict'
import {writeFile} from 'node:fs/promises'

export async function checkBossKeels(page,output,landscape) {
 const checks=await page.evaluate(async landscape=>{
  const review=window.campaignReview,scene=review.ships
  const {CAMPAIGN_BOSS_ART}=await import('/src/components/games/raid/bossCatalog.ts')
  const {BOSS_KEEL_DESIGNS}=await import('/src/components/games/raid/bossKeelDesigns.ts')
  const {BufferAttribute}=await import('/node_modules/three/build/three.module.js')
  const result=[]
  const probe=document.createElement('canvas'),context=probe.getContext('2d',{willReadFrequently:true})
  const pixels=()=>{
   const canvas=scene.renderer.domElement
   probe.width=canvas.width;probe.height=canvas.height
   context.drawImage(canvas,0,0)
   return context.getImageData(0,0,probe.width,probe.height).data
  }
  for(const art of CAMPAIGN_BOSS_ART) {
   await scene.prepareHull('commandHull'+art.stage)
   review.reset(art.stage);review.frame(false)
   const enemy=review.r.enemiesRef.current[0],node=scene.hulls.get('enemy:'+enemy.id)
   if(!node)throw Error('Missing normal boss '+art.stage)
   let body
   node.object.traverse(object=>{if(object.geometry?.userData.ventralDesign)body=object})
   if(!body)throw Error('Missing designed lower hull '+art.stage)
   const geometry=body.geometry,p=geometry.getAttribute('position'),data=geometry.userData
   const lower=Array.from({length:p.count-data.shellVertexCount},(_,i)=>p.getZ(data.shellVertexCount+i))
   if(lower.some(z=>z>=0))throw Error('A lower housing entered the upper hull')
   if(!data.ventralHousings)throw Error('Missing recessed reactor housings at '+art.stage)
   // A clean top view must retain every opaque deck pixel. Negative geometry
   // is removed temporarily from this diagnostic copy, then restored.
   node.object.rotation.y=0
   scene.present()
   const full=pixels(),original=geometry.index
   const selected=[]
   for(let i=0;i<original.count;i+=3){
    const ids=[original.getX(i),original.getX(i+1),original.getX(i+2)]
    if(ids.every(v=>p.getZ(v)>=-.00001))selected.push(...ids)
   }
   const upper=new BufferAttribute(new Uint32Array(selected),1)
   geometry.setIndex(upper);scene.present()
   const deck=pixels();geometry.setIndex(original);upper.dispose?.();scene.present()
   let changed=0,opaque=0,covered=0
   const stride=probe.width*4
   for(let y=1;y<probe.height-1;y++)for(let x=1;x<probe.width-1;x++){
    const i=(y*probe.width+x)*4
    const difference=Math.abs(full[i]-deck[i])+Math.abs(full[i+1]-deck[i+1])+Math.abs(full[i+2]-deck[i+2])+Math.abs(full[i+3]-deck[i+3])
    if(difference>12)changed++
    if([i,i-4,i+4,i-stride,i+stride].every(j=>deck[j+3]===255)){
     opaque++;if(difference>6)covered++
    }
   }
   result.push({stage:art.stage,name:art.name,design:BOSS_KEEL_DESIGNS[art.stage].name,
    housings:data.ventralHousings,deckVertices:data.deckVertexCount,vertices:p.count,
    drawCalls:scene.getShipStats().drawCalls,changed,opaque,covered,addedMaxZ:Math.max(...lower)})
  }
  return result
 },landscape)
 for(const check of checks){
  assert.ok(check.housings>0&&check.addedMaxZ<0,'Lower components escaped their reserved volume')
  assert.ok(check.drawCalls<=3,'Underside added actor draws')
  assert.ok(check.opaque>500,'Upper deck failed to render')
  if(!landscape)assert.ok(check.covered/check.opaque<.002,'Lower hull covered the upper painting: '+JSON.stringify(check))
  else assert.ok(check.changed>100,'New lower hull was invisible in the gameplay camera: '+JSON.stringify(check))
 }
 await writeFile(output+'/keel-'+(landscape?'landscape':'portrait')+'-checks.json',JSON.stringify(checks,null,2))
 console.log('Verified normal boss keels',landscape?'landscape':'portrait',checks.length)
 if(landscape){
  const data=await page.evaluate(async()=>{
   const review=window.campaignReview,scene=review.ships
   const {CAMPAIGN_BOSS_ART}=await import('/src/components/games/raid/bossCatalog.ts')
   scene.render({width:1440,height:1050,dpr:1})
   for(let i=0;i<CAMPAIGN_BOSS_ART.length;i++){
    const art=CAMPAIGN_BOSS_ART[i],key='commandHull'+art.stage,id='underframe-review-'+art.stage
    scene.submitHull({id,key,x:180+i%4*360,y:165+Math.floor(i/4)*350,size:242,bank:0,angle:0,alpha:1,landscape:true})
    const node=scene.hulls.get(id);node.object.rotation.x=Math.PI
   }
   scene.present()
   const sheet=document.createElement('canvas');sheet.width=1440;sheet.height=1050
   const ctx=sheet.getContext('2d');ctx.fillStyle='#0a101a';ctx.fillRect(0,0,1440,1050)
   ctx.drawImage(scene.renderer.domElement,0,0);ctx.font='18px sans-serif';ctx.fillStyle='#dce8f4';ctx.textAlign='center'
   CAMPAIGN_BOSS_ART.forEach((art,i)=>ctx.fillText(art.stage+' — '+art.name,180+i%4*360,320+Math.floor(i/4)*350))
   for(const art of CAMPAIGN_BOSS_ART)scene.hulls.get('underframe-review-'+art.stage).object.rotation.x=0
   return sheet.toDataURL('image/png').split(',')[1]
  })
  await writeFile(output+'/normal-boss-undersides-v1.png',Buffer.from(data,'base64'))
 }
}
