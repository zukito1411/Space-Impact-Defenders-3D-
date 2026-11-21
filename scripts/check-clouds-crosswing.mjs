import assert from 'node:assert/strict'
import {mkdir,writeFile} from 'node:fs/promises'

export async function checkCloudsCrosswing(page,output,landscape){
 const view=landscape?'landscape':'portrait',checks=[]
 for(const stage of [5,10]){
  const result=await page.evaluate(({stage,landscape})=>{
   const review=window.campaignReview;review.reset(stage);review.frame(false)
   if(!landscape)return {stage,active:review.background.landscapeAtmosphere.root.visible}
   const a=review.background.landscapeAtmosphere,bg=review.background
   const w=a.frame.width,h=a.frame.height,kind=stage===5?'pelagic':'cinder'
   a.lastTime=null;a.update(h,w,40000,kind,'max',false,false,0,bg.shipLighting)
   const x=()=>[...a.clouds.filter(c=>c.visible),...a.mist].map(c=>c.x)
   const before=x()
   for(let frame=1;frame<=60;frame++)a.update(h,w,40000+frame*1000/60,kind,'max',false,false,0,bg.shipLighting)
   const after=x(),delta=before.map((v,i)=>v-after[i])
   const paused=x();a.update(h,w,42000,kind,'max',false,true,0,bg.shipLighting)
   const holdsPause=paused.every((v,i)=>v===x()[i])
   a.update(h,w,43000,kind,'max',true,false,0,bg.shipLighting);const reduced=x()
   a.update(h,w,44000,kind,'max',true,false,0,bg.shipLighting)
   const holdsReduced=reduced.every((v,i)=>v===x()[i])
   a.lastTime=null;review.actions.draw(40000)
   return {stage,active:a.root.visible,width:w,delta,holdsPause,holdsReduced}
  },{stage,landscape})
  assert.equal(result.active,landscape)
  if(landscape){assert.ok(result.delta.every(d=>Math.abs(d)>result.width*.009),'Fixed cloud/mist layer remains');assert.ok(result.holdsPause&&result.holdsReduced)}
  checks.push(result)
  if(landscape){
   await mkdir(output+'/frames-'+stage,{recursive:true})
   for(let frame=0;frame<12;frame++){
    await page.evaluate(({stage,frame})=>{
     const review=window.campaignReview
     if(frame===0)review.reset(stage)
     review.background.landscapeAtmosphere.lastTime=null
     review.actions.draw(40000+frame*250);review.actions.sync()
    },{stage,frame})
    await page.screenshot({path:output+'/frames-'+stage+'/'+String(frame).padStart(2,'0')+'.png'})
   }
  }
 }
 await writeFile(output+'/cloud-'+view+'-checks.json',JSON.stringify(checks,null,2))
 for(const key of ['xwing','xwingElite']){
  const model=await page.evaluate(async key=>{
   const review=window.campaignReview
   await review.ships.prepareHull(key)
   const {getInitialPlayer,getShipByKey}=await import('/src/components/games/raid/state.ts')
   const {getHullRegistration}=await import('/src/components/games/raid/liveHullAssets.ts')
   review.reset(1,'waves');review.r.enemiesRef.current=[]
   review.r.playerRef.current=getInitialPlayer(getShipByKey('xwing'),key)
   review.r.playerRef.current.invuln=999
   review.actions.draw(40000);review.actions.sync()
   const node=[...review.ships.hulls.values()].find(n=>n.key===key&&n.group.visible)
   if(!node)throw Error('Aligned ship missing from gameplay: '+key)
   return {key,registration:getHullRegistration(key),...review.ships.getShipStats()}
  },key)
  for(const family of ['wing','nozzles'])for(const [a,b] of [[0,1],[2,3]]){
   assert.deepEqual(model.registration[family][a].slice(0,2),model.registration[family][b].slice(0,2),'Live attachment columns differ')
  }
  assert.ok(model.drawCalls<=1+(model.lampDraws??0),'X-wing no longer fits one draw')
  await page.screenshot({path:output+'/'+key+'-'+view+'.png'})
  await writeFile(output+'/'+key+'-'+view+'-checks.json',JSON.stringify(model,null,2))
 }
 console.log('Verified cloud wind and X-wing columns:',view)
}
