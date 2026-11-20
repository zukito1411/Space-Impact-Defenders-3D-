import assert from 'node:assert/strict'
import {chromium} from 'playwright'
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,
 args:['--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader']})
try {
 const page=await browser.newPage({viewport:{width:844,height:390}}),errors=[]
 page.on('pageerror',error=>errors.push(error.message))
 page.on('console',message=>{if(message.type()==='error'&&/THREE\.|WebGL|shader|program/i.test(message.text()))errors.push(message.text())})
 await page.goto((process.env.RAID_TEST_URL??'http://127.0.0.1:5198')+'/')
 const result=await page.evaluate(async()=>{
  const {ThreeShipPresentation}=await import('/src/components/games/raid/threeShipPresentation.ts')
  const host=document.createElement('div');document.body.replaceChildren(host)
  const scene=new ThreeShipPresentation(),keys=['abyssSquidHull','serpentGuardianHull','mirageMothershipHull']
  // Bound this shader/fade regression to the three changed bosses. Other enemy
  // hulls were already checked in the gameplay gallery and are not reloaded.
  const prepare=scene.prepareHull.bind(scene)
  scene.prepareHull=key=>keys.includes(key)||key==='rocket'?prepare(key):Promise.resolve()
  if(!await scene.init(host))throw Error('Special material initialization failed')
  const sample=document.createElement('canvas');sample.width=844;sample.height=390
  const ctx=sample.getContext('2d',{willReadFrequently:true})
  const counts=[]
  for(const alpha of [1,.45,0]) {
   scene.render({width:844,height:390,dpr:1})
   keys.forEach((key,i)=>{
    if(!scene.submitHull({id:key,key,x:150+i*270,y:175,size:180,bank:0,angle:0,alpha,landscape:true,
      bossPose:i<2?{seconds:2,attack:0,targetX:0,targetY:-1,motion:1}:undefined}))throw Error('Missing special '+key)
   })
   scene.present();ctx.clearRect(0,0,844,390);ctx.drawImage(host.querySelector('canvas'),0,0)
   const pixels=ctx.getImageData(0,0,844,390).data
   let visible=0;for(let i=3;i<pixels.length;i+=4)if(pixels[i]>0)visible++
   counts.push(visible)
  }
  const before=scene.getShipStats()
  scene.destroy()
  return {counts,before}
 })
 assert.ok(result.counts[0]>10000,'Boss paint did not render')
 assert.ok(result.counts[1]>0&&result.counts[1]<result.counts[0]*.85,'Defeat fade lost stochastic coverage')
 assert.equal(result.counts[2],0,'Defeated boss did not clear')
 assert.deepEqual(errors,[])
 console.log('Special boss shader compilation, progressive defeat fade and final clear passed',JSON.stringify(result))
}finally{await browser.close()}
