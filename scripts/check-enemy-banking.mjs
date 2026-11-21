import assert from 'node:assert/strict'
import {writeFile} from 'node:fs/promises'

/** Native draw callbacks and camera; synthetic movement only drives the fixture. */
export async function bankEnemyForCapture(page,stage,elite){
 const result=await page.evaluate(async({stage,elite})=>{
  const review=window.campaignReview,scene=review.ships
  review.reset(stage,elite===undefined?'capture':'waves')
  let enemy=review.r.enemiesRef.current[0]
  if(elite!==undefined){
   Object.assign(enemy,{isBoss:false,isMiniBoss:true,bossKind:null,bossArtStage:undefined,variant:elite,x:50,y:28,hp:1000,maxHp:1000})
   review.r.enemiesRef.current=[enemy]
  }
  const {enemyHullKey}=await import('/src/components/games/raid/enemyHulls.ts')
  const key=enemyHullKey(enemy),id='enemy:'+enemy.id
  if(!key){review.actions.draw(40000);return {stage,excluded:enemy.bossKind==='devil',key,angle:0}}
  await scene.prepareHull(key)
  const old=scene.hulls.get(id);if(old)old.bankPose=undefined
  const originalX=enemy.x
  enemy.x=originalX-5.4
  review.actions.draw(40000)
  // Replace packets between draws to cover co-op interpolation identity.
  for(let frame=1;frame<=3;frame++){
   enemy={...enemy,x:originalX-5.4+frame*1.8}
   review.r.enemiesRef.current[0]=enemy
   review.actions.draw(40000+frame*100)
  }
  review.actions.sync()
  const node=scene.hulls.get(id)
  if(!node)throw Error('Enemy hull not drawn: '+key)
  return {stage,elite,key,angle:node.object.rotation.y,bank:node.bankPose?.bank,
    spin:node.object.rotation.z,draws:scene.getShipStats().drawCalls}
 },{stage,elite})
 if(result.excluded)assert.equal(result.key,null,'Devil entered the live banking renderer')
 else {assert.ok(result.angle>.01&&result.angle<.43,'Enemy did not bank within its limit: '+JSON.stringify(result));assert.ok(result.draws<=3)}
 return result
}

export async function checkEnemyBanking(page,output,landscape){
 const checks=[]
 // The landscape gallery already covers all 15 campaign bosses. Check the
 // portrait route on one capital and all three large/special bosses as well.
 if(!landscape)for(const stage of [1,5,10,15,16])checks.push(await bankEnemyForCapture(page,stage))
 for(let elite=0;elite<5;elite++){
  checks.push(await bankEnemyForCapture(page,1,elite))
  if(elite===0||elite===4)await page.screenshot({path:`${output}/elite-${elite}-${landscape?'landscape':'portrait'}.png`})
 }
 await writeFile(`${output}/banking-${landscape?'landscape':'portrait'}-checks.json`,JSON.stringify(checks,null,2))
 console.log('Enemy banking route verified:',landscape?'landscape':'portrait',checks.length)
}
