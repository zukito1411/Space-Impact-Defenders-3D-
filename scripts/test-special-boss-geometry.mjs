import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {pathToFileURL} from 'node:url'
import ts from 'typescript'
const code=readFileSync('src/components/games/raid/specialBossGeometry.ts','utf8')
const compiled=ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
  .replace("from 'three'",`from '${pathToFileURL(process.cwd()+'/node_modules/three/build/three.module.js')}'`)
  .replace("from 'three/addons/utils/BufferGeometryUtils.js'",`from '${pathToFileURL(process.cwd()+'/node_modules/three/examples/jsm/utils/BufferGeometryUtils.js')}'`)
const {buildOrganicAppendages,connectSquidBody,prepareOrganicRig,poseOrganicBoss,sampleSerpentBody}=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'))
const {Group,Mesh,MeshStandardMaterial,RepeatWrapping,BufferGeometry,Float32BufferAttribute}=await import('three')
globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>({fillRect(){},drawImage(){}})})}
for(const kind of ['squid','snake']) {
 const limb=buildOrganicAppendages({naturalWidth:1024,naturalHeight:1536},kind)
 const geometry=limb.geometry,positions=geometry.getAttribute('position'),indices=geometry.index
 assert.ok(positions.count>2000&&positions.count<14000)
 assert.ok(indices.array.every(i=>i<positions.count))
 assert.ok(positions.array.every(Number.isFinite))
 assert.ok(geometry.getAttribute('normal').array.every(Number.isFinite))
 const attributes=geometry.getAttribute('bossLimb')
 const ids=new Set(Array.from({length:attributes.count},(_,i)=>attributes.getX(i)))
 assert.equal(ids.size,kind==='squid'?8:1)
 assert.equal(limb.frustumCulled,false,'charged extensions must not disappear at neutral-pose bounds')
 if(kind==='snake') {
  assert.equal(limb.material.map.wrapT,RepeatWrapping,'skin must tile instead of stretching the hood')
  const around=geometry.getAttribute('uv').getX(24)-geometry.getAttribute('uv').getX(0)
  assert.equal(around,Math.round(around),'circumference must close on a complete scale tile')
  assert.ok(geometry.getAttribute('uv').getY(positions.count-1)>2,'body needs repeated rows of scales')
  for(const join of [.4,.73]) {
   const left=sampleSerpentBody(join-.00001),right=sampleSerpentBody(join+.00001)
   assert.ok(Math.hypot(...right.map((n,i)=>n-left[i]))<.001,'cobra coils must join continuously')
  }
  const neck=sampleSerpentBody(1)
  assert.equal(neck[0],0);assert.equal(neck[1],-.08)
  const points=Array.from({length:101},(_,i)=>sampleSerpentBody(i/100))
  assert.ok(points.every(p=>p.every(Number.isFinite)))
  assert.ok(Math.max(...points.map(p=>p[0]))-Math.min(...points.map(p=>p[0]))>.6,'body must have broad coils')
 }
 const shader={uniforms:{},vertexShader:'#include <beginnormal_vertex>\n#include <begin_vertex>'}
 prepareOrganicRig(limb.material);limb.material.onBeforeCompile(shader,{})
 assert.ok(shader.vertexShader.includes('vec3 objectNormal='),'deformation must update the lit normals')
 assert.ok(shader.vertexShader.includes('transformed=center+'),'the actual body must deform')
 assert.ok(shader.vertexShader.includes('if(bossLimb.x>=0.)transformed='),'fixed mantle vertices must retain their original position')
 const object=new Group();object.add(limb)
 if(kind==='snake') {
  const head=new Mesh(geometry,new MeshStandardMaterial())
  head.name='boss-organic-head-v1';head.userData.organicKind='snake';object.add(head)
  for(const attack of [0,.4,.815,1,.5,0]) {
   poseOrganicBoss(object,{seconds:7,attack,targetX:.2,targetY:-1.4,motion:1})
   assert.ok(head.position.z>.21,'head must clear the neck surface through bite and retraction')
  }
  head.material.dispose()
 }
 const uniforms=limb.material.userData.bossPose
 poseOrganicBoss(object,{seconds:7,attack:.8,targetX:.2,targetY:-1.4,motion:1})
 assert.equal(uniforms.attack.value,.8);assert.equal(uniforms.time.value,7)
 assert.equal(uniforms.target.value.y,-1.4)
 // Banking must preserve the attack lane after camera foreshortening.
 for(const yaw of [0,-24*Math.PI/180])for(const roll of [-.17,.17]) {
  const scale=Math.cos(yaw)/Math.cos(yaw+roll)
  poseOrganicBoss(object,{seconds:7,attack:.8,targetX:.2,targetY:-1.4,motion:1},'bank-check',scale)
  assert.ok(Math.abs(uniforms.target.value.x*Math.cos(yaw+roll)-.2*Math.cos(yaw))<1e-12)
  const head=object.children.find(child=>child.name==='boss-organic-head-v1')
  if(head)assert.ok(Math.abs(head.position.x-.2*scale*.8)<1e-12)
 }

 poseOrganicBoss(object,{seconds:8,attack:0,targetX:0,targetY:-1,motion:0})
 assert.equal(geometry.getAttribute('position'),positions,'animation must preserve the shared vertex buffers')
 assert.equal(uniforms.attack.value,0,'pooled organic bosses must reset attack state')
 assert.equal(uniforms.motion.value,0)
 if(kind==='squid') {
  poseOrganicBoss(object,{seconds:9,attack:1,targetX:.2,targetY:-1.4,motion:1},'slap')
  poseOrganicBoss(object,{seconds:9.016,attack:0,targetX:.2,targetY:-1.4,motion:1},'slap')
  assert.ok(uniforms.attack.value>0&&uniforms.attack.value<1,'slap must retract without snapping')
  poseOrganicBoss(object,{seconds:9.032,attack:0,targetX:.2,targetY:-1.4,motion:1},'next-boss')
  assert.equal(uniforms.attack.value,0,'pooled squid must not inherit the previous slap')
 }
 geometry.dispose();limb.material.map.dispose();limb.material.dispose()
}
const mantle=new BufferGeometry()
mantle.setAttribute('position',new Float32BufferAttribute([-.2,.15,.1,.2,.15,.1,.2,-.15,.1,-.2,-.15,.1],3))
mantle.setAttribute('uv',new Float32BufferAttribute([0,1,1,1,1,0,0,0],2))
mantle.setAttribute('color',new Float32BufferAttribute(new Float32Array(12).fill(1),3))
mantle.setAttribute('hullWall',new Float32BufferAttribute(new Float32Array(4),1))
mantle.setIndex([0,1,2,0,2,3]);mantle.computeVertexNormals()
const squid=connectSquidBody(new Mesh(mantle,new MeshStandardMaterial()),{naturalWidth:1024,naturalHeight:1024})
assert.equal(squid.geometry.groups.length,2,'unified squid must retain its two paint draws')
const adjacent=Array.from({length:squid.geometry.getAttribute('position').count},()=>[])
const index=squid.geometry.index.array
for(let i=0;i<index.length;i+=3)for(let j=0;j<3;j++)adjacent[index[i+j]].push(index[i+(j+1)%3],index[i+(j+2)%3])
const reached=new Set([0]),pending=[0]
while(pending.length)for(const next of adjacent[pending.pop()])if(!reached.has(next)){reached.add(next);pending.push(next)}
assert.equal(reached.size,adjacent.length,'all eight arms must connect to the mantle topology')
const render=readFileSync('src/components/games/raid/enemyRender.ts','utf8')
assert.ok(!/drawCachedStageBossBody|drawFinalBossSpriteBody|drawSquidWhipStrike/.test(render),'live bosses still invoke the old Canvas bodies')
const enemySource=readFileSync('src/components/games/raid/enemyHulls.ts','utf8')
assert.ok(enemySource.includes("enemy.bossKind === 'devil') return null"),'Devil must remain 2D')
assert.ok(!render.includes('drawBossShield('),'boss-wide shield ring returned')
assert.ok(!readFileSync('src/components/games/raid/commandBossRender.ts','utf8').includes('BOSS_FX.pulse'),'boss charge/phase ring returned')
console.log('Organic GPU buffers, normals, eight limbs, continuous serpent, attack uniforms, pool reset, and 2D Devil boundary verified')
