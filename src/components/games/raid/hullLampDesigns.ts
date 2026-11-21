/** Small, authored fittings in each original top painting's UV frame. */
export type HullLampSpec={u:number;v:number;color:number;channel:0|1|2;size:number;strength:number}
const led=(u:number,v:number,color:number,channel:0|1|2=0,size=.025,strength=.88):HullLampSpec=>({u,v,color,channel,size,strength})
const core=(u:number,v:number,color:number,size=.075)=>led(u,v,color,2,size,.65)
const pair=(u:number,v:number,color:number)=>[led(u,v,color,0),led(1-u,v,color,1)]
const ring=(color:number,radius=.33)=>Array.from({length:8},(_,i)=>{
 const a=i*Math.PI/4;return led(.5+Math.cos(a)*radius,.5+Math.sin(a)*radius,color,i%2?1:0,.022,.78)
})
const bosses:Record<string,HullLampSpec[]>={
 commandHull1:[core(.5,.34,0xffac36,.055),...pair(.25,.58,0xff853c)],
 commandHull2:[core(.5,.5,0xd779ff),...ring(0xb998f0)],
 commandHull3:[core(.5,.36,0xa4f04a,.055),...pair(.31,.53,0x91d849)],
 commandHull4:[core(.5,.33,0x6cd6dd,.05),...pair(.26,.32,0x69cadb)],
 commandHull6:[core(.5,.78,0xff9b3d,.06),...pair(.25,.37,0xff793b)],
 commandHull7:[core(.5,.35,0xffcf87,.05),...pair(.25,.39,0xffbf62)],
 commandHull8:[core(.5,.5,0x6edcff),...ring(0x75d4ff)],
 commandHull9:[core(.5,.30,0xff73c5,.055),...pair(.31,.48,0xe66aaa)],
 commandHull11:[core(.5,.66,0xd08aff,.05),...pair(.25,.58,0xb4a1ff)],
 commandHull12:[core(.5,.40,0xe49bfa,.055),...pair(.25,.29,0xffbc70)],
 commandHull13:[core(.5,.35,0xf76a85,.055),...pair(.28,.25,0xffba57)],
 commandHull14:[core(.5,.5,0xf071ea),...ring(0xd494ed)],
 abyssSquidHull:[core(.5,.43,0xd68aff,.045),...pair(.45,.48,0xf1b963)],
 serpentGuardianHull:[...pair(.46,.34,0xf5b250),core(.5,.43,0xf27566,.035)],
 mirageMothershipHull:[core(.5,.5,0xeb77c7,.06),...ring(0xffb94d,.35)],
}
const wings:Record<string,readonly[number,number,number]>={
 rocket:[.28,.63,0x77cfff],fast:[.36,.64,0xff886a],gatling:[.28,.63,0xff7d8c],
 laser:[.25,.62,0x8cd8ff],dreadnought:[.27,.61,0x9fbcff],xwing:[.15,.64,0xffc16d],
 spaceEt:[.27,.57,0x80e3df],mesiahBlack:[.22,.58,0x8cceee],mesiahWhite:[.22,.58,0x8bd5f3],
 mesiahRaptorBlack:[.32,.62,0x7bc9ed],mesiahRaptorWhite:[.32,.62,0x96dafa],
 coreLander:[.36,.41,0x8ee1ef],coreLanderBurning:[.36,.44,0xffc071],
}
const players:Record<string,HullLampSpec[]>={}
for(const [key,[u,v,color]] of Object.entries(wings))players[key]=[...pair(u,v,color),led(.5,.74,0xffd5a0,1,.022,.70)]
export function getHullLampDesign(key:string):readonly HullLampSpec[]{
 // Devil Gundam and ordinary enemies never acquire fittings.
 return bosses[key]??players[key.replace(/Elite$/,'')]??[]
}
