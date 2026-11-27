import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const read = name => readFileSync('src/components/games/raid/'+name,'utf8').replace(/^import .*\n/gm,'')
const code = ts.transpileModule(read('protectionGeometry.ts')+'\n'+read('liveProtectionGeometry.ts'),{
  compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022},
}).outputText
const { projectProtection,blendProtection,PROTECTION_STRIDE,PROTECTION_BANKS } =
  await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'))

// A pointed nose, swept wings and a tall dorsal fin make roll-dependent
// silhouettes visibly different, including on the landscape camera.
const vertices = new Float32Array([0,120,0,-12,20,0,-90,-70,0,-20,-90,0,
  20,-90,0,90,-70,0,12,20,0,90,-25,35])
const indices = new Uint32Array([0,1,6,1,2,7,2,3,7,3,4,7,4,5,7,5,6,7,1,7,6])
const registration = [1.3,1.3,36,36]
for (const bankRange of [.14, .24]) {
  const frames = new Float32Array(2*PROTECTION_BANKS*PROTECTION_STRIDE)
  for (let view = 0; view < 2; view++) for (let i = 0; i < PROTECTION_BANKS; i++) {
    const roll = (2 * i / (PROTECTION_BANKS - 1) - 1) * bankRange * 150
    frames.set(projectProtection(vertices,indices,registration,((view ? -56 : 0)+roll)*Math.PI/180),
      (view*PROTECTION_BANKS+i)*PROTECTION_STRIDE)
  }
  for (const landscape of [false,true]) {
    const a = new Float32Array(PROTECTION_STRIDE), b = new Float32Array(PROTECTION_STRIDE)
    blendProtection(frames,1,-bankRange,landscape,0,0,a,bankRange)
    blendProtection(frames,1,bankRange,landscape,0,0,b,bankRange)
    assert.notDeepEqual(a,b,'the real projected profile must change with bank')
    if (bankRange > .14) {
      blendProtection(frames,1,.20,landscape,0,0,a,bankRange)
      assert.notDeepEqual(a,b,'fighter contours must follow steep banking through the full range')
    }
    blendProtection(frames,1,.101,landscape,0,0,a,bankRange)
    blendProtection(frames,1,.102,landscape,0,0,b,bankRange)
    assert.notDeepEqual(a,b,'shell must follow continuous turns between sampled contours')
    assert.ok(Math.max(...a.map((x,i)=>Math.abs(x-b[i]))) < .015,'small banks must not jump')
    assert.ok(a.every(Number.isFinite))
    assert.ok(Math.max(...a.slice(512,1024).filter((_,i)=>i%2===0)) > .17,'shell must reach the swept wing')
    assert.ok(Math.min(...a.slice(512,1024).filter((_,i)=>i%2===1)) < -.30,'shell must follow the long nose')
  }
}
console.log('Projected mesh protection: nose, wings, landscape roll, full fighter bank and reusable buffers passed')
