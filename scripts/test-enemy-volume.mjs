import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const source = readFileSync('src/components/games/raid/volumeGeometry.worker.ts','utf8')
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
console.log('Enemy decks, clipped silhouettes, UV bounds, wall groups and bounded hull depth verified')
