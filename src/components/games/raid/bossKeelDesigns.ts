/** Lower-only architecture, registered to the existing painted silhouettes.
 * Dimensions use the same 512px plan as the deck; depth is hull-span space. */
export type KeelSection = { x:number; y:number; rx:number; ry:number; depth:number; round:number; angle:number; inner?:number }
export type KeelReactor = { x:number; y:number; radius:number }
export type BossKeelDesign = { name:string; armor:KeelSection[]; bays:KeelSection[]; reactors:KeelReactor[]; warm:boolean }
const plate=(x:number,y:number,rx:number,ry:number,depth:number,round=4,angle=0):KeelSection=>({x,y,rx,ry,depth,round,angle})
const twin=(x:number,y:number,rx:number,ry:number,depth:number,round=4)=>
  [plate(x,y,rx,ry,depth,round),plate(512-x,y,rx,ry,depth,round)]
function carrier(stage:number):BossKeelDesign {
  const armor=[plate(256,248,57,170,.102),plate(256,357,38,94,.122),
    ...twin(145,240,49,145,.079),...twin(193,140,25,65,.07)]
  for(let i=0;i<4;i++)armor.push(plate(256,146+i*62,79,12,.083+i*.006))
  if(stage===7)armor.push(...twin(144,185,37,102,.112))
  if(stage===13)armor.push(plate(256,230,43,127,.146),...twin(116,280,43,43,.104,2))
  return {name:stage===1?'armored carrier cradle':stage===7?'twin hangar keel':'dreadnought armored citadel',armor,
    bays:[...twin(141,256,23,76,.026),plate(256,225,19,43,.049)],
    reactors:[{x:256,y:224,radius:19}],warm:stage!==1}
}
function radial(stage:number):BossKeelDesign {
  const armor=[plate(256,256,96,96,.106,2),{...plate(256,256,135,135,.08,2),inner:.69}],bays:KeelSection[]=[]
  for(let i=0;i<8;i++) {
    const a=i*Math.PI/4,c=Math.cos(a),s=Math.sin(a)
    armor.push(plate(256+c*142,256+s*142,72,stage===8?25:32,stage===14?.098:.078,4,a),
      plate(256+c*90,256+s*90,28,19,.102,4,a))
    bays.push(plate(256+c*159,256+s*159,31,10,.035,4,a))
  }
  return {name:stage===8?'prismatic reactor cage':stage===14?'segmented nexus underframe':'radial reactor underframe',
    armor,bays,reactors:[{x:256,y:256,radius:30}],warm:stage!==2}
}
function reaper(stage:number):BossKeelDesign {
  const armor=[plate(256,203,43,139,.112),...twin(122,209,38,59,.079,2),
    ...twin(79,244,18,129,.059),...twin(187,307,18,63,.078)]
  for(let i=0;i<4;i++)armor.push(plate(256,123+i*43,50,11,.08+i*.009))
  if(stage===9)armor.push(...twin(188,253,24,72,.105))
  return {name:stage===3?'split scythe keel':'reinforced scythe power frame',armor,
    bays:[plate(256,235,13,64,.035),...twin(78,266,8,54,.025)],
    reactors:[{x:256,y:156,radius:15}],warm:false}
}
function razor():BossKeelDesign {
  const armor=[plate(256,229,39,168,.098),...twin(145,323,25,73,.082)]
  for(let i=0;i<6;i++)armor.push(plate(256,108+i*40,52,12,.079+i*.006))
  return {name:'segmented blade keel',armor,bays:[plate(256,213,10,89,.036)],
    reactors:[{x:256,y:161,radius:14}],warm:false}
}
function fortress(stage:number):BossKeelDesign {
  const armor=[...twin(96,236,49,154,stage===12?.14:.119),plate(256,218,34,118,.116),
    plate(256,290,95,38,.077),...twin(174,329,24,52,.083)]
  for(let i=0;i<4;i++)armor.push(...twin(96,143+i*66,58,11,.095+i*.005))
  return {name:stage===12?'cathedral suspended bastions':'fortress engine bastions',armor,
    bays:[...twin(96,257,23,72,.039),plate(256,270,17,35,.033)],
    reactors:[{x:256,y:193,radius:18}],warm:stage===12}
}
function hydra():BossKeelDesign {
  const armor=[plate(256,237,39,150,.126),...twin(118,299,26,107,.102),
    ...twin(130,196,51,43,.079)]
  for(let i=0;i<4;i++)armor.push(plate(256,197+i*47,52,10,.095+i*.007),
    ...twin(118,264+i*32,31,9,.086+i*.005))
  return {name:'three-prong reactor keel',armor,
    bays:[plate(256,291,12,66,.043),...twin(117,309,9,51,.036)],
    reactors:[{x:256,y:167,radius:19},{x:121,y:208,radius:12},{x:391,y:208,radius:12}],warm:false}
}
export const BOSS_KEEL_DESIGNS:Readonly<Record<number,BossKeelDesign>>={
  1:carrier(1),2:radial(2),3:reaper(3),4:razor(),6:fortress(6),7:carrier(7),
  8:radial(8),9:reaper(9),11:hydra(),12:fortress(12),13:carrier(13),14:radial(14),
}
function coverage(p:KeelSection,x:number,y:number) {
  const dx=x-p.x,dy=y-p.y,c=Math.cos(p.angle),s=Math.sin(p.angle)
  const a=Math.abs((c*dx+s*dy)/p.rx),b=Math.abs((-s*dx+c*dy)/p.ry)
  const r=(a**p.round+b**p.round)**(1/p.round)
  const t=Math.max(0,Math.min(1,(1-r)/.22)),edge=t*t*(3-2*t)
  const inner=p.inner?Math.max(0,Math.min(1,(r-p.inner)/.10)):1
  return edge*inner
}
/** A shallow rolled perimeter, deeper independent load-bearing members and
 * recessed service wells. Never infer the underside from painted highlights. */
export function sampleBossKeel(design:BossKeelDesign,u:number,v:number,bevel:number) {
  const x=u*512,y=v*512
  let depth=.025
  for(const p of design.armor)depth=Math.max(depth,.025+(p.depth-.025)*coverage(p,x,y))
  for(const p of design.bays)depth+=(Math.min(depth,p.depth)-depth)*coverage(p,x,y)
  return -.012-bevel*depth
}
