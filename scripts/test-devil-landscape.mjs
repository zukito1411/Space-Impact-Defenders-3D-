import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const read = file => readFileSync(new URL('../src/components/games/raid/' + file, import.meta.url), 'utf8').replace(/\r\n/g, '\n')
const load = source => import('data:text/javascript;base64,' + Buffer.from(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText).toString('base64'))
const stripImports = text => text.replace(/^import .*\n/gm, '')
const enemyModule = await load(`
export const calls = []
const DEG=Math.PI/180, STAGE_CLEAR_SECONDS=3.15
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)), getEnemyCanvasSize=()=>100
const drawDevilGundamBoss=(ctx,...args)=>calls.push(['body',ctx.angle,args[3]])
const getBossForceFieldStrength=()=>.76
const drawBossShield=(ctx,x,y)=>calls.push(['shield',x,y])
const drawCachedBossBar=(ctx,enemy,x,y)=>calls.push(['bar',ctx.angle,x,y])
const drawCommandBossHealthBar=()=>{},drawBossFx=()=>{}
` + stripImports(read('enemyRender.ts')))

const enemy = {id:1,isBoss:true,bossKind:'devil',hp:100,maxHp:100,x:50,y:50,radius:10,phase:0,shieldTime:1,chargeTimer:0,color:'#fff'}
for (const landscape of [false,true]) for (const gpuReady of [false,true]) {
  const stack=[]
  const ctx={angle:0,save(){stack.push(this.angle)},restore(){this.angle=stack.pop()},rotate(a){this.angle+=a},translate(){},scale(){}}
  enemyModule.calls.length=0
  enemyModule.drawRaidEnemy(ctx,enemy,v=>v,v=>v,390,1000,'none',1,gpuReady,landscape)
  const body=enemyModule.calls.find(x=>x[0]==='body')
  assert.equal(body[1],landscape ? -Math.PI/2 : 0)
  assert.equal(body[2],gpuReady)
  const shield=enemyModule.calls.find(x=>x[0]==='shield')
  assert.equal(shield,undefined,'boss-wide shield ring must remain removed')
  assert.ok(enemyModule.calls.some(x=>x[0]==='bar'),'health bar was lost')
  assert.equal(ctx.angle,0,'Canvas transform leaked')
}

const gpu = await load(`
class Container { addChild(child){child.parent=this} }
class Sprite { constructor(texture){this.texture=texture;this.anchor={set(){}};this.position={set(x,y){this.x=x;this.y=y}}} destroy(){} }
class Texture { static WHITE={} }
const getEnemyCanvasSize=()=>100,getDevilBossPose=()=> 'idle',raidObjectInView=()=>true
const getDevilGpuPoseMotion=(time,phase,size)=>({
  pulse:.985+Math.sin(time/880+phase)*.016,drift:Math.sin(time/690+phase)*size*.006,tilt:Math.sin(time/1080+phase)*.012,
})
const STAGE_CLEAR_SECONDS=3.15,clamp=(v,a,b)=>Math.max(a,Math.min(b,v))
` + stripImports(read('gpuBossBodies.ts')))
const renderer=new gpu.RaidGpuBossBodies()
renderer.prepareDevil=()=>({texture:{},canvas:{width:184},renderSize:100})
for (const landscape of [false,true]) {
  const frame={width:390,height:844,time:1000,landscape,enemies:[enemy],bounds:{}}
  renderer.update(frame)
  const pair=renderer.nodes.get(enemy.id)
  assert.ok(pair && renderer.isRendered(enemy.id),'GPU body not rendered')
  const tilt=Math.sin(frame.time/1080+enemy.phase)*0.012
  assert.ok(Math.abs(pair.base.rotation-(tilt-(landscape?Math.PI/2:0)))<1e-9)
  assert.equal(pair.blend.rotation,pair.base.rotation)
}
const devil = await load(`
export const painted = []
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)), easeOutCubic=t=>1-(1-Math.max(0,Math.min(1,t)))**3
const getBossDefeatFade=()=>1, getBossForceFieldStrength=()=>.76, prefersRaidReducedMotion=()=>false
const RAID_DEVIL_BOSS_ATTACK_FILTER='', RAID_DEVIL_BOSS_BASE_FILTER='', getDevilBossRedFilter=()=>''
const getDevilBossCanvasSprite=pose=>pose
const drawCanvasSpriteContain=(ctx,sprite,x,y,size,filter,alpha,rotation,pulse)=>painted.push({sprite,x,y,size:size*pulse})
const drawShipProtection=(ctx,x,y,size,time,force,shield,{sprite})=>painted.push({sprite,x:x+ctx.x,y:y+ctx.y,size})
` + stripImports(read('devilBossRender.ts')))
for (const gpuReady of [false, true]) for (const landscape of [false, true]) {
  const actor = {...enemy, devilVisualPose: 'idle', devilPoseChangedAt: 500}
  const context = { x: 0, y: 0, globalAlpha: 1, save(){}, restore(){}, rotate(){}, translate(x,y){this.x+=x;this.y+=y} }
  devil.painted.length = 0
  devil.drawDevilGundamBoss(context, actor, 140, 1000, gpuReady, landscape)
  const field = devil.painted.at(-1)
  if (gpuReady) {
    const motion = devil.getDevilGpuPoseMotion(1000, actor.phase, 140)
    assert.equal(devil.painted.length, 1)
    assert.equal(field.size, 140 * motion.pulse)
    assert.equal(field.x, landscape ? -motion.drift : 0)
  } else {
    assert.equal(devil.painted.length, 2)
    assert.deepEqual(field, devil.painted[0])
  }
}
console.log('Devil Gundam Canvas and GPU orientations, pose-fitted shield, and Canvas state passed')
