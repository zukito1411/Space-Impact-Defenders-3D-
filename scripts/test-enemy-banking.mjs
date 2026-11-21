import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
const code=ts.transpileModule(readFileSync('src/components/games/raid/enemyBanking.ts','utf8'),
 {compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
const {updateEnemyBank}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'))
const motion=(kind,time,x,y=20,paused=false)=>({kind,time,x,y,paused})
function turn(kind,hz,speed=18){
 const pose={x:30,y:20,time:0,bank:0,velocity:0}
 for(let i=1;i<=hz;i++)updateEnemyBank(pose,motion(kind,i/hz*1000,30+speed*i/hz))
 return pose
}
for(const kind of ['elite','capital','organic','mothership']){
 const reference=turn(kind,60)
 assert.ok(reference.bank>.03&&reference.bank<=.16)
 for(const hz of [30,90,120,144])assert.ok(Math.abs(turn(kind,hz).bank-reference.bank)<1e-10)
 assert.ok(Math.abs(turn(kind,60,-18).bank+reference.bank)<1e-10,'left/right symmetry')
 const paused=reference.bank
 for(let i=1;i<=30;i++)updateEnemyBank(reference,motion(kind,1000+i/60*1000,48,20,true))
 assert.equal(reference.bank,paused,'pause altered bank')
 const same=reference.bank
 updateEnemyBank(reference,motion(kind,1500,48))
 assert.equal(reference.bank,same,'duplicate draw altered bank')
 for(let i=1;i<=180;i++)updateEnemyBank(reference,motion(kind,1500+i/60*1000,48))
 assert.ok(Math.abs(reference.bank)<1e-7,'did not settle level')
 const reverse=turn(kind,60)
 let signChanged=false
 for(let i=1;i<=60;i++){
  const next=updateEnemyBank(reverse,motion(kind,1000+i/60*1000,48-18*i/60))
  if(next<0)signChanged=true
  assert.ok(Math.abs(next)<=.16,'reversal exceeded limit')
 }
 assert.ok(signChanged)
 updateEnemyBank(reverse,motion(kind,2016,85))
 assert.equal(reverse.bank,0,'teleport inherited a turn')
 const reduced=turn(kind,60)
 assert.equal(updateEnemyBank(reduced,motion(kind,1016,48.3),true),0)
 const forward=turn(kind,60,0)
 assert.equal(forward.bank,0,'forward-only travel rolled sideways')
 const gap=turn(kind,60)
 assert.equal(updateEnemyBank(gap,motion(kind,5000,49)),0)
}
assert.ok(turn('elite',60).bank>turn('capital',60).bank)
assert.ok(turn('capital',60).bank>turn('organic',60).bank)
console.log('Enemy banking: all four profiles, 30–144 Hz, reversals, stop, pause, reduced motion and teleport/resume passed')
