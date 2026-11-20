/** Authored anatomy/armor coordinates in the original paint's UV frame.
 * Evaluated only by the admission worker; silhouettes and gameplay stay native. */
type Form={u:number;v:number;rx:number;ry:number;rise:number;power:number}
export type MobHullDesign={forms:Form[];organic:boolean;canopy?:readonly number[];guns?:readonly (readonly number[])[]}
const form=(u:number,v:number,rx:number,ry:number,rise:number,power=2):Form=>({u,v,rx,ry,rise,power})
const pair=(u:number,v:number,rx:number,ry:number,rise:number,power=2)=>
  [form(u,v,rx,ry,rise,power),form(1-u,v,rx,ry,rise,power)]
const carapace=(rx:number,cy:number,rise:number)=>[
  form(.5,cy,rx,.27,rise),form(.5,.57,.115,.15,.125),form(.5,.57,.07,.075,.165),
  ...pair(.29,.47,.085,.17,.055),...pair(.41,.76,.035,.13,.065),
]
export const MOB_HULL_DESIGNS:Readonly<Record<string,MobHullDesign>>={
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
export function mobHullElevation(design:MobHullDesign,u:number,v:number,bevel=1) {
  let height=.012
  for(const f of design.forms) {
    const radius=(Math.abs((u-f.u)/f.rx)**f.power+Math.abs((v-f.v)/f.ry)**f.power)**(1/f.power)
    const coverage=Math.sqrt(Math.max(0,1-radius*radius))
    height=Math.max(height,f.rise*coverage)
  }
  return .006+bevel*height
}
