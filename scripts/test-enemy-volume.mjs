import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const compile = source => ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
const dataUrl = source => 'data:text/javascript;base64,'+Buffer.from(compile(source)).toString('base64')
const designUrl = dataUrl(readFileSync('src/components/games/raid/bossHullDesigns.ts','utf8'))
const { BOSS_HULL_DESIGNS, sampleBossDeck } = await import(designUrl)
const source = readFileSync('src/components/games/raid/volumeGeometry.worker.ts','utf8')
  .replace("'./bossHullDesigns'",JSON.stringify(designUrl))
globalThis.self = {}
const compiled = ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
const { buildVolumeGeometry } = await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'))
const resolution=32, pixels=new Uint8ClampedArray(resolution*resolution*4)
// A swept nose and two separate wings exercise fractional silhouette clipping.
for(let y=2;y<30;y++) for(let x=0;x<32;x++) {
  const span=y<16?2+y*.38:11-(y-16)*.5
  const opacity=Math.max(0,Math.min(1,span-Math.abs(x-15.5)))
  const p=(y*resolution+x)*4
  pixels.set([160,190,220,Math.round(opacity*255)],p)
}
for(const profile of ['fighter','organic','capital']) {
  const mesh=buildVolumeGeometry({pixels,resolution,aspectX:.7,aspectY:1,profile})
  assert.ok(mesh.index.length>1000)
  assert.ok(mesh.position.every(Number.isFinite))
  assert.ok(mesh.uv.every(v=>v>=0&&v<=1))
  assert.ok(mesh.index.every(i=>i<mesh.position.length/3))
  assert.ok(mesh.sideStart>0&&mesh.sideStart<mesh.index.length)
  let fractional=false
  for(let i=0;i<mesh.uv.length;i+=2) {
    if(Math.abs(mesh.uv[i]*31-Math.round(mesh.uv[i]*31))>.01)fractional=true
  }
  assert.ok(fractional,'the mesh must follow the antialiased edge instead of whole pixel blocks')
  assert.ok(Math.max(...mesh.position.filter((_,i)=>i%3===2))<.13,'avoid ballooned shells')
}
// Capital reconstructions retain the exact clipped footprint and UV paint,
// while giving each encounter its own depth, recesses and physical armament.
const capital=buildVolumeGeometry({pixels,resolution,aspectX:1,aspectY:1,profile:'capital'})
assert.deepEqual(Object.keys(BOSS_HULL_DESIGNS).map(Number),[1,2,3,4,6,7,8,9,11,12,13,14])
for(const [stage,design] of Object.entries(BOSS_HULL_DESIGNS)) {
  const mesh=buildVolumeGeometry({pixels,resolution,aspectX:1,aspectY:1,profile:'capital',bossStage:Number(stage)})
  assert.deepEqual(mesh.index,capital.index,'boss changed its clipped topology')
  assert.deepEqual(mesh.uv,capital.uv,'boss lost registered paint coordinates')
  let max=0,delta=0
  for(let i=0;i<mesh.position.length;i+=3) {
    assert.equal(mesh.position[i],capital.position[i]);assert.equal(mesh.position[i+1],capital.position[i+1])
    max=Math.max(max,mesh.position[i+2]);delta=Math.max(delta,Math.abs(mesh.position[i+2]-capital.position[i+2]))
  }
  assert.ok(max>.13&&max<.28,'boss '+stage+' lost its bounded superstructure')
  assert.ok(delta>.04,'boss '+stage+' retained a generic slab')
  for(const part of design.recesses) {
    if(part.inner)continue
    assert.ok(sampleBossDeck(design,part.x/512,part.y/512)<=part.height+1e-8,'bay was filled in')
  }
  for(const gun of design.barrels) {
    assert.ok(Math.hypot(gun.root[0]-gun.muzzle[0],gun.root[1]-gun.muzzle[1])>30,'degenerate cannon')
    assert.ok(gun.radius>0&&gun.height>0)
  }
}
console.log('Enemy decks, clipped silhouettes, UV bounds, wall groups and bounded hull depth verified')
