import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import ts from 'typescript'

const root='src/components/games/raid/'
const read=file=>readFileSync(file,'utf8')
const registrations=JSON.parse(read('public/assets/ships/models/v1/manifest.json'))
const anchors=JSON.parse(read(root+'bankingAnchors.json'))
const mechs=new Set(['godGundam','godGundamBurning','spiegel'])
const view=read(root+'raidView.ts').replace(/export /g,'')
const code=ts.transpileModule(view+'\n'+`
  const isRaid2DMech=key=>['godGundam','godGundamBurning','spiegel'].includes(key);
  const getHullRegistration=key=>registrations[key==='mesiah'?'mesiahBlack':key]??null;
  const registrations=${JSON.stringify(registrations)};
`+read(root+'liveHullBridge.ts').replace(/^import .*\n/gm,''),{
  compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022},
}).outputText
const bridge=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'))
const draws=[]
bridge.bindLiveHulls({submitHull(draw){draws.push(draw);return true}})
globalThis.window={devicePixelRatio:3}
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`)
for(const [key,data] of Object.entries(registrations)){
  const model=readFileSync('public/assets/ships/models/v1/'+key+'.glb')
  assert.equal(model.toString('ascii',0,4),'glTF',key)
  assert.equal(model.readUInt32LE(4),2,key)
  for(const landscape of [false,true])for(const bank of [-.14,0,.14]){
    const sampled=bridge.sampleLiveHullPoints(key,bank,landscape)
    const yaw=(landscape?-56:0)*Math.PI/180+bank*150*Math.PI/180
    const [sx,sy,ox,oy]=data.registration
    for(const [index,[x,y,z,aperture]] of data.nozzles.entries()){
      const point=sampled.nozzles[index]
      near(point[0],(sx*(Math.cos(yaw)*x+Math.sin(yaw)*z)+Math.cos(landscape?-56*Math.PI/180:0)*(144*sx+ox-224))/448)
      near(point[1],-(sy*y+224-144*sy-oy)/448)
      near(point[2],aperture*sx/448)
    }
    assert.equal(sampled.wing.length,data.wing.length)
  }
}
for(const key of Object.keys(anchors)){
  assert.ok(mechs.has(key)||registrations[key],'every selectable key requires a model')
  if (mechs.has(key)) continue
  for(const landscape of [false,true])assert.ok(existsSync(`public/assets/ships/previews/${key}-${landscape?'landscape':'portrait'}-v${mechs.has(key)?1:landscape?7:5}.webp`))
}
for(const file of ['god-gundam.png','god-gundam-burning.png','spiegel.png'])assert.ok(existsSync('public/assets/ships/'+file))
assert.equal(existsSync('public/assets/ships/sideview'),true)
assert.equal(existsSync('public/assets/ships/banking'),false)
const ctx={canvas:{dataset:{raidDpr:'2'}},globalAlpha:.5,getTransform(){return {a:0,b:2,c:-2,d:0,e:400,f:200}}}
bridge.drawLiveHull(ctx,'xwing',30,50,80,.1,.6,true,'pilot')
assert.deepEqual(draws.at(-1),{id:'pilot',key:'xwing',x:150,y:130,size:80,bank:.1,alpha:.3,landscape:true,angle:-Math.PI/2})
for (const key of mechs) for (const landscape of [false,true]) {
  assert.equal(bridge.drawLiveHull(ctx,key,0,0,100,0,1,landscape),false)
  assert.equal(bridge.sampleLiveHullPoints(key,0,landscape),null)
  assert.equal(bridge.submitLiveHull({key}),false)
}
bridge.bindLiveHulls(null)
assert.equal(bridge.drawLiveHull(ctx,'rocket',0,0,100,0,1,false),false)
const runtime=read(root+'playerRender.ts')
assert.doesNotMatch(runtime,/drawBankedHull|drawRaidBankingCell/)
assert.doesNotMatch(read(root+'effectsRender.tsx'),/drawLiveHull/)
assert.match(read(root+'effectsRender.tsx'),/getGodGundamBarrageCanvasSprite/)
assert.match(runtime,/!coreLanderCombatModel && drawLiveHull/)
assert.doesNotMatch(read(root+'background.ts'),/getRaidShipSpriteUrl/)
console.log('Live GLB coverage, registered hardpoints, view/DPR transforms, model thumbnails and 2D mech exceptions verified')
