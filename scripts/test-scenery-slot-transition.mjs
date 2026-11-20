import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
const read = file => readFileSync('src/components/games/raid/'+file,'utf8').replace(/^import .*\n/gm,'')
const output = ts.transpileModule(read('raidView.ts')+'\n'+read('spaceWorld.ts'), {
  compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022},
}).outputText
const {SpaceCamera,createSpacePlacement}=await import('data:text/javascript;base64,'+Buffer.from(output).toString('base64'))
const camera=new SpaceCamera(), slot=createSpacePlacement(20,'stream')
camera.setView(844,390,0,0,false,0,0,1,true)
camera.admit(slot,120,80,100,100,844,390,10,0)
const localDistance=slot.zKm
camera.recycle(slot,844,390)
const recycled=[slot.xKm,slot.yKm,slot.zKm]
camera.admit(slot,140,100,100,100,844,390,10,0)
assert.deepEqual([slot.xKm,slot.yKm,slot.zKm],recycled,'retain a recycled pass for the same local art')
camera.admit(slot,160,180,280,280,844,390,11,0,1400000)
assert.ok(slot.zKm>localDistance*1000,'the sun must be placed at stellar distance')
assert.ok(Math.abs(slot.widthKm*camera.focal/camera.relativeDistance(slot)-280)<1e-8,
  'a reused local slot must not turn its new sun into a screen-filling flat color')
console.log('Local scenery recycling and stellar-scale slot changes remain correctly registered')
