import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {build} from 'esbuild'
import {BufferGeometry,BufferAttribute} from 'three'
const bundled=await build({stdin:{contents:"export * from './src/components/games/raid/volumeGeometry.worker';export * from './src/components/games/raid/bossKeelDesigns'",resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',write:false})
globalThis.self={}
const {buildVolumeGeometry,BOSS_KEEL_DESIGNS,sampleBossKeel}=await import('data:text/javascript;base64,'+Buffer.from(bundled.outputFiles[0].text).toString('base64'))
const baseline=JSON.parse(readFileSync('docs/boss-upper-baseline-v1.json','utf8'))
const resolution=baseline.resolution,pixels=new Uint8ClampedArray(resolution*resolution*4)
for(let y=1;y<63;y++)for(let x=1;x<63;x++){
 const dx=(x-31.5)/29,dy=(y-31.5)/29,r=Math.hypot(dx,dy)
 let a=Math.max(0,Math.min(1,(1-r)*8))
 if(Math.hypot(x-23,y-32)<4||Math.hypot(x-40,y-32)<4)a=0
 pixels.set([137,186,219,Math.round(a*255)],(y*resolution+x)*4)
}
const hash=array=>createHash('sha256').update(Buffer.from(array.buffer,array.byteOffset,array.byteLength)).digest('hex')
assert.deepEqual(Object.keys(BOSS_KEEL_DESIGNS).map(Number),[1,2,3,4,6,7,8,9,11,12,13,14])
for(let stage=1;stage<=15;stage++){
 const m=buildVolumeGeometry({pixels,resolution,aspectX:1,aspectY:1,profile:'capital',bossStage:stage})
 const expected=baseline.stages[stage],n=m.deckVertexCount
 const g=new BufferGeometry();g.setAttribute('position',new BufferAttribute(m.position,3));g.setIndex(new BufferAttribute(m.index,1));g.computeVertexNormals()
 const actual={vertices:n,indices:m.deckIndexCount,position:hash(m.position.subarray(0,n*3)),uv:hash(m.uv.subarray(0,n*2)),normal:hash(g.getAttribute('normal').array.subarray(0,n*3)),topology:hash(new Uint32Array(m.index.subarray(0,m.deckIndexCount)))}
 const {complete,...upper}=expected
 assert.deepEqual(actual,upper,'Changed original upper hull at stage '+stage)
 if(complete)assert.deepEqual({position:hash(m.position),uv:hash(m.uv),index:hash(new Uint32Array(m.index))},complete,'Changed a special boss')
 if(BOSS_KEEL_DESIGNS[stage]){
  const depths=m.position.subarray(n*3,n*6).filter((_,i)=>i%3===2)
  assert.ok(Math.min(...depths)<-.09,'Lower hull retained a shallow slab')
  assert.ok(Math.max(...depths)-Math.min(...depths)>.065,'Underside lost structural relief')
  assert.ok(depths.every(z=>z<0&&z>-.17),'Lower hull left its reserved depth')
  assert.ok(m.index.every(i=>i<m.position.length/3))
  // Recesses must sit inside their supporting armor, not protrude through it.
  for(const bay of BOSS_KEEL_DESIGNS[stage].bays)assert.ok(sampleBossKeel(BOSS_KEEL_DESIGNS[stage],bay.x/512,bay.y/512,1)>-.012-bay.depth-.001)
 }
 g.dispose()
}
console.log('Verified 15 byte-identical upper hulls/normals/UVs; 12 sculpted keels; 3 unchanged special shells')
