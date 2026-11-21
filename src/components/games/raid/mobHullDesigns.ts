/** Authored anatomy/armor coordinates in the original paint's UV frame.
 * Evaluated only by the admission worker; silhouettes and gameplay stay native. */
type Form={u:number;v:number;rx:number;ry:number;rise:number;power:number}
export type MobLowerModule={u:number;v:number;rx:number;ry:number;depth:number;kind:'plate'|'hinge'|'reactor'}
export type MobHullDesign={name?:string;forms:Form[];organic:boolean;canopy?:readonly number[];guns?:readonly (readonly number[])[];
  keel?:Form[];armorPaint?:readonly [number,number,number,number];modules?:MobLowerModule[]}
const form=(u:number,v:number,rx:number,ry:number,rise:number,power=2):Form=>({u,v,rx,ry,rise,power})
const pair=(u:number,v:number,rx:number,ry:number,rise:number,power=2)=>
  [form(u,v,rx,ry,rise,power),form(1-u,v,rx,ry,rise,power)]
const carapace=(rx:number,cy:number,rise:number)=>[
  form(.5,cy,rx,.27,rise),form(.5,.57,.115,.15,.125),form(.5,.57,.07,.075,.165),
  ...pair(.29,.47,.085,.17,.055),...pair(.41,.76,.035,.13,.065),
]
const module=(u:number,v:number,rx:number,ry:number,depth:number,kind:MobLowerModule['kind']='plate'):MobLowerModule=>({u,v,rx,ry,depth,kind})
const pairedModules=(u:number,v:number,rx:number,ry:number,depth:number,kind:MobLowerModule['kind']='hinge')=>[
  module(u,v,rx,ry,depth,kind),module(1-u,v,rx,ry,depth,kind)]
const designs:Record<string,MobHullDesign>={
  alienHull0:{organic:true,forms:[...carapace(.245,.29,.12),...pair(.31,.24,.07,.12,.07)]},
  alienHull1:{organic:true,forms:[...carapace(.165,.31,.14),...pair(.37,.24,.05,.2,.085),form(.5,.15,.06,.12,.15)]},
  alienHull2:{organic:true,forms:[...carapace(.215,.39,.13),form(.5,.49,.145,.135,.17),...pair(.27,.31,.07,.16,.07)]},
  alienHull3:{organic:true,forms:[...carapace(.25,.28,.145),...pair(.29,.3,.10,.19,.08)]},
  alienHull4:{organic:true,forms:[...carapace(.19,.3,.135),form(.5,.20,.065,.20,.17),...pair(.32,.38,.075,.18,.09)]},
  alienHull5:{organic:true,forms:[...carapace(.24,.31,.12),...pair(.27,.49,.1,.17,.09),form(.5,.72,.05,.14,.1)]},
  alienHull6:{organic:true,forms:[form(.5,.43,.27,.255,.16),form(.5,.47,.12,.12,.18),...pair(.28,.63,.08,.13,.07)]},
  alienHull7:{organic:true,forms:[form(.5,.37,.12,.27,.17),...pair(.31,.39,.07,.22,.115),...pair(.25,.7,.06,.17,.08),form(.5,.7,.055,.22,.125)]},
  fighterNeedle:{organic:false,canopy:[.5,.24,.035,.13],forms:[
    form(.5,.46,.065,.4,.085,4),form(.5,.25,.038,.14,.115),...pair(.40,.30,.045,.14,.045,4)],guns:[[.5,.72,.16,.009]]},
  fighterCinder:{organic:false,canopy:[.5,.39,.04,.14],forms:[
    form(.5,.45,.09,.32,.1,4),...pair(.34,.43,.12,.17,.065,4),...pair(.4,.25,.055,.14,.075,4),form(.5,.36,.04,.14,.12)],guns:[[.28,.59,.11,.015],[.72,.59,.11,.015]]},
  fighterViolet:{organic:false,canopy:[.5,.35,.055,.12],forms:[
    form(.5,.48,.115,.3,.09,4),...pair(.25,.44,.17,.16,.055,4),...pair(.30,.58,.07,.15,.085,4),...pair(.37,.24,.05,.15,.09,4),form(.5,.35,.055,.12,.12)],guns:[[.25,.66,.19,.019],[.75,.66,.19,.019]]},
  fighterCrimson:{organic:false,canopy:[.5,.37,.055,.1],forms:[
    form(.5,.55,.13,.32,.11,4),...pair(.27,.40,.12,.20,.07,4),...pair(.39,.24,.06,.12,.085,4),form(.5,.37,.055,.1,.125)],guns:[[.20,.44,.13,.016],[.80,.44,.13,.016]]},
  fighterJade:{organic:false,canopy:[.5,.27,.055,.1],forms:[
    form(.5,.44,.16,.3,.095),...pair(.24,.55,.11,.25,.045,4),form(.5,.46,.095,.105,.14),form(.5,.23,.055,.12,.105)],guns:[[.5,.71,.15,.017]]},
  fighterAuric:{organic:false,canopy:[.5,.25,.055,.12],forms:[
    form(.5,.42,.125,.28,.1,4),...pair(.22,.47,.12,.21,.07,4),...pair(.18,.63,.055,.11,.085,4),form(.5,.25,.055,.12,.125)],guns:[[.16,.65,.25,.019],[.5,.66,.27,.021],[.84,.65,.25,.019]]},
}

// Lower anatomy follows each painting's actual armor and propulsion layout.
// Centers/radii are UV coordinates; depth is measured in the native model frame.
const lower:Record<string,Pick<MobHullDesign,'name'|'keel'|'armorPaint'|'modules'>>={
  alienHull0:{name:'Ruby scarab — segmented abdomen',armorPaint:[.5,.29,.13,.11],
    keel:[form(.5,.35,.23,.26,.135),form(.5,.61,.105,.21,.15),...pair(.33,.48,.07,.13,.10)],
    modules:[module(.5,.36,.095,.075,.026),module(.5,.51,.08,.065,.028),module(.5,.65,.055,.06,.022)]},
  alienHull1:{name:'Azure lancer — ribbed narrow sternum',armorPaint:[.5,.30,.08,.12],
    keel:[form(.5,.37,.14,.31,.16),form(.5,.66,.075,.19,.14),...pair(.39,.47,.055,.18,.115)],
    modules:[module(.5,.35,.055,.10,.025),module(.5,.56,.045,.075,.025),...pairedModules(.39,.61,.03,.045,.018)]},
  alienHull2:{name:'Violet crown — jaw and horn-root sockets',armorPaint:[.5,.32,.12,.09],
    keel:[form(.5,.43,.21,.24,.15),form(.5,.67,.085,.18,.145),...pair(.30,.35,.07,.13,.105)],
    modules:[module(.5,.46,.09,.075,.026),...pairedModules(.37,.40,.035,.045,.024),module(.5,.64,.05,.06,.024)]},
  alienHull3:{name:'Jade horn beetle — split breastplate',armorPaint:[.5,.28,.14,.10],
    keel:[form(.5,.31,.23,.24,.155),...pair(.43,.57,.075,.19,.145),...pair(.29,.38,.075,.13,.10)],
    modules:[...pairedModules(.43,.48,.04,.065,.027),module(.5,.64,.06,.07,.025)]},
  alienHull4:{name:'Bronze rhino — twin keel ridges',armorPaint:[.5,.31,.10,.12],
    keel:[form(.5,.32,.17,.29,.16),...pair(.45,.55,.045,.21,.155),...pair(.32,.40,.055,.15,.12)],
    modules:[module(.5,.32,.06,.09,.028),...pairedModules(.43,.55,.03,.075,.025),module(.5,.70,.04,.055,.023)]},
  alienHull5:{name:'Cyan spindle — articulated thoracic plates',armorPaint:[.5,.31,.10,.12],
    keel:[form(.5,.39,.20,.29,.15),form(.5,.67,.065,.23,.155),...pair(.30,.48,.07,.15,.115)],
    modules:[module(.5,.38,.075,.07,.025),module(.5,.54,.065,.06,.028),module(.5,.68,.04,.06,.024)]},
  alienHull6:{name:'Orb weaver — round abdomen and radial joints',armorPaint:[.5,.32,.13,.08],
    keel:[form(.5,.43,.24,.24,.19),...pair(.31,.55,.07,.12,.125),form(.5,.66,.07,.13,.13)],
    modules:[module(.5,.43,.09,.09,.034,'reactor'),...pairedModules(.35,.55,.035,.045,.028)]},
  alienHull7:{name:'Spined predator — armored lower jaw',armorPaint:[.5,.38,.08,.14],
    keel:[form(.5,.47,.115,.31,.175),...pair(.33,.42,.065,.19,.13),form(.5,.73,.05,.17,.15)],
    modules:[module(.5,.45,.055,.085,.03),module(.5,.62,.04,.075,.026),...pairedModules(.35,.44,.028,.06,.025)]},
  fighterNeedle:{name:'Needle — diamond keel and thrust socket',armorPaint:[.5,.62,.035,.08],
    keel:[form(.5,.47,.067,.36,.14,4),form(.5,.38,.052,.15,.165,4)],
    modules:[module(.5,.42,.025,.07,.027),module(.5,.57,.022,.055,.024,'reactor')]},
  fighterCinder:{name:'Cinder — twin engine nacelles',armorPaint:[.5,.57,.065,.09],
    keel:[form(.5,.48,.085,.28,.15,4),...pair(.39,.38,.075,.19,.135,4),...pair(.29,.47,.10,.13,.07,4)],
    modules:[...pairedModules(.41,.36,.035,.075,.03,'reactor'),module(.5,.55,.04,.075,.026)]},
  fighterViolet:{name:'Violet — gunship box spar and armored bays',armorPaint:[.5,.55,.08,.075],
    keel:[form(.5,.48,.10,.26,.16,4),...pair(.27,.45,.10,.18,.14,4),form(.5,.43,.30,.075,.10,4)],
    modules:[...pairedModules(.28,.45,.05,.065,.034),module(.5,.48,.055,.075,.03,'reactor')]},
  fighterCrimson:{name:'Crimson ram — reinforced wedge and cooling rails',armorPaint:[.5,.61,.075,.11],
    keel:[form(.5,.54,.12,.31,.18,4),...pair(.32,.39,.085,.17,.12,4),form(.5,.71,.065,.14,.16,4)],
    modules:[module(.5,.59,.05,.10,.038),...pairedModules(.38,.40,.035,.06,.028)]},
  fighterJade:{name:'Jade — recessed sensor gondola',armorPaint:[.5,.69,.035,.08],
    keel:[form(.5,.45,.14,.27,.15),form(.5,.48,.10,.12,.195),...pair(.29,.53,.10,.20,.065,4)],
    modules:[module(.5,.47,.065,.065,.04,'reactor'),module(.5,.65,.03,.065,.025)]},
  fighterAuric:{name:'Auric — three armored artillery channels',armorPaint:[.5,.48,.07,.085],
    keel:[form(.5,.46,.095,.27,.155,4),...pair(.23,.48,.095,.19,.145,4),...pair(.20,.63,.045,.12,.12,4)],
    modules:[...pairedModules(.23,.46,.04,.075,.033,'reactor'),module(.5,.49,.04,.075,.034)]},
  eliteHull0:{name:'Elite lance scarab — layered longitudinal sternum',armorPaint:[.5,.32,.085,.11],
    keel:[form(.5,.37,.15,.28,.20),form(.5,.62,.075,.23,.175),...pair(.36,.50,.055,.14,.13)],
    modules:[module(.5,.35,.06,.075,.035),module(.5,.51,.055,.065,.034),module(.5,.66,.035,.06,.03)]},
  eliteHull1:{name:'Elite claw crab — horseshoe thorax and hinge sockets',armorPaint:[.5,.36,.13,.08],
    keel:[form(.5,.43,.20,.24,.21),...pair(.28,.55,.11,.17,.15),form(.5,.67,.07,.15,.155)],
    modules:[module(.5,.45,.075,.075,.04,'reactor'),...pairedModules(.32,.53,.04,.05,.034)]},
  eliteHull2:{name:'Elite siege crab — transverse armored bridge',armorPaint:[.5,.35,.16,.075],
    keel:[form(.5,.51,.28,.22,.215),...pair(.25,.47,.13,.16,.16),form(.5,.68,.08,.15,.175)],
    modules:[module(.5,.51,.075,.065,.043),...pairedModules(.27,.47,.05,.05,.035)]},
  eliteHull3:{name:'Elite thorn spear — deep tapered ventral spine',armorPaint:[.5,.32,.085,.11],
    keel:[form(.5,.43,.13,.32,.21),...pair(.37,.46,.06,.20,.15),form(.5,.72,.045,.16,.17)],
    modules:[module(.5,.37,.05,.08,.037),module(.5,.56,.045,.075,.036),module(.5,.70,.03,.05,.03)]},
  eliteHull4:{name:'Elite shield beetle — crescent breastplate and lower reactor',armorPaint:[.5,.65,.16,.07],
    keel:[form(.5,.55,.30,.21,.225),...pair(.27,.49,.13,.17,.165),form(.5,.37,.10,.15,.18)],
    modules:[module(.5,.57,.08,.065,.043,'reactor'),...pairedModules(.28,.52,.045,.05,.036)]},
}

const eliteForms:Record<string,Form[]>={
  eliteHull0:[form(.5,.31,.145,.29,.20),form(.5,.58,.10,.14,.215),...pair(.35,.47,.055,.16,.115)],
  eliteHull1:[form(.5,.42,.20,.27,.22),...pair(.27,.54,.115,.18,.15),form(.5,.65,.065,.18,.17)],
  eliteHull2:[form(.5,.48,.28,.23,.23),...pair(.24,.46,.12,.17,.16),form(.5,.61,.09,.16,.19)],
  eliteHull3:[form(.5,.36,.14,.30,.215),...pair(.36,.44,.065,.20,.14),form(.5,.65,.065,.20,.19)],
  eliteHull4:[form(.5,.55,.30,.23,.225),...pair(.27,.48,.13,.18,.165),form(.5,.34,.08,.16,.20)],
}
for(const [key,forms] of Object.entries(eliteForms))designs[key]={organic:true,forms}
for(const [key,details] of Object.entries(lower))Object.assign(designs[key],details)
export const MOB_HULL_DESIGNS:Readonly<Record<string,MobHullDesign>>=designs

function sampleForms(forms:readonly Form[],u:number,v:number,mechanical=false) {
  let height=.012
  for(const f of forms) {
    const radius=(Math.abs((u-f.u)/f.rx)**f.power+Math.abs((v-f.v)/f.ry)**f.power)**(1/f.power)
    // Machined bays have broad armor planes and bevel shoulders, rather than
    // inflating every fighter into an ellipsoid. Organic shells remain rounded.
    const profile=mechanical&&f.power>=4
      ? radius<.72 ? 1-.12*radius/.72 : Math.max(0,(1-radius)*.88/.28)
      : Math.sqrt(Math.max(0,1-radius*radius))
    height=Math.max(height,f.rise*profile)
  }
  return height
}
export function mobHullElevation(design:MobHullDesign,u:number,v:number,bevel=1) {
  return .006+bevel*sampleForms(design.forms,u,v,!design.organic)*(design.organic?1.13:1.08)
}
export function mobHullKeelElevation(design:MobHullDesign,u:number,v:number,bevel=1) {
  const relief=sampleForms(design.keel??design.forms,u,v,!design.organic)
  const ribs=design.organic ? 1-.055*Math.sin(v*66)**8 : 1-.035*Math.sin((v+Math.abs(u-.5)*.4)*58)**8
  return -.006-bevel*relief*ribs
}
export function mobHullPaintUV(design:MobHullDesign,u:number,v:number,wallHeight?:number):readonly[number,number] {
  const [x,y,rx,ry]=design.armorPaint??[.5,.4,.10,.1]
  if(wallHeight===undefined){
    // Keep the full-resolution panel artwork on the lower armor, replacing only
    // dorsal eyes/cockpit glass with adjacent shell paint. A tiny repeated swatch
    // would smear the original detail across the whole belly.
    const mask=design.organic ? [.5,.57,.13,.14]
      : design.canopy??[.5,.4,.07,.14]
    const glass=((u-mask[0])/mask[2])**2+((v-mask[1])/mask[3])**2<1.35
    const sensor=!design.organic&&design.modules?.some(m=>m.kind==='reactor'&&Math.abs(u-m.u)<m.rx*1.25&&Math.abs(v-m.v)<m.ry*1.25)
    if(!glass&&!sensor)return[u,v]
    return[x+(u-.5)*rx,y+(v-.5)*ry]
  }
  return [x+(v-.5)*2*rx,y+(wallHeight-.5)*1.3*ry]
}
