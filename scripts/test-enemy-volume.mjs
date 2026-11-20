import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const compile = source => ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
const dataUrl = source => 'data:text/javascript;base64,'+Buffer.from(compile(source)).toString('base64')
const keelUrl=dataUrl(readFileSync('src/components/games/raid/bossKeelDesigns.ts','utf8'))
const designUrl = dataUrl(readFileSync('src/components/games/raid/bossHullDesigns.ts','utf8').replace("'./bossKeelDesigns'",JSON.stringify(keelUrl)))
const mobUrl = dataUrl(readFileSync('src/components/games/raid/mobHullDesigns.ts','utf8'))
const {MOB_HULL_DESIGNS}=await import(mobUrl)
const { BOSS_HULL_DESIGNS, sampleBossDeck, bossKeelElevation } = await import(designUrl)
const source = readFileSync('src/components/games/raid/volumeGeometry.worker.ts','utf8')
  .replace("'./bossHullDesigns'",JSON.stringify(designUrl))
  .replace("'./mobHullDesigns'",JSON.stringify(mobUrl))
  .replace("'./bossKeelDesigns'",JSON.stringify(keelUrl))
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
assert.equal(Object.keys(MOB_HULL_DESIGNS).length,14)
for(const key of Object.keys(MOB_HULL_DESIGNS)) {
 const mesh=buildVolumeGeometry({pixels,resolution,aspectX:1,aspectY:1,profile:'fighter',hullDesign:key})
 assert.deepEqual(mesh.index,capital.index,'mob changed its registered silhouette')
 assert.deepEqual(mesh.uv,capital.uv,'mob lost original paint coordinates')
 assert.ok(mesh.position.every(Number.isFinite))
 const heights=Array.from(mesh.position).filter((_,i)=>i%3===2)
 assert.ok(Math.max(...heights)>.09&&Math.max(...heights)<.2,'mob lost its shaped cockpit/carapace')
}
assert.deepEqual(Object.keys(BOSS_HULL_DESIGNS).map(Number),[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15])
for(const [stage,design] of Object.entries(BOSS_HULL_DESIGNS)) {
  const mesh=buildVolumeGeometry({pixels,resolution,aspectX:1,aspectY:1,profile:'capital',bossStage:Number(stage)})
  assert.deepEqual(mesh.index.subarray(0,mesh.deckIndexCount),capital.index.subarray(0,capital.deckIndexCount),'boss changed its upper topology')
  assert.deepEqual(mesh.uv.subarray(0,mesh.deckVertexCount*2),capital.uv.subarray(0,capital.deckVertexCount*2),'boss lost upper paint coordinates')
  let max=0,delta=0
  for(let i=0;i<mesh.deckVertexCount*3;i+=3) {
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
const saucer=BOSS_HULL_DESIGNS[15]
const keelCenter=bossKeelElevation(saucer,.5,.5),keelShoulder=bossKeelElevation(saucer,.86,.5)
const keelRim=bossKeelElevation(saucer,.94,.5,0)
assert.ok(keelCenter<-.1&&keelCenter<keelShoulder-.02,'saucer needs a curved lower lens')
assert.ok(keelShoulder<keelRim-.04,'saucer keel must roll upward toward the rim')
assert.ok(keelRim>-.01,'saucer contour must meet a thin edge, not an extruded skirt')
console.log('Enemy decks, clipped silhouettes, UV bounds, wall groups and bounded hull depth verified')
