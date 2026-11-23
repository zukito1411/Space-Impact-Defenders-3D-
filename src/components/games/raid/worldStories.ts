import { SampleScene } from '../presentationAudio'
import { drawLiveHull } from './liveHullBridge'
import { CRUISE_HULL_KEYS } from './liveHullAssets'
import { CRUISE_FLYBY_START, GRACE_FLYBY_START, GRACE_FLYBY_LENGTH } from './cruiseTiming'
import { raidCameraFocal } from './raidView'
import { COMBAT_TILE, drawRaidCombatTexture, getRaidCombatFrame } from './combatArt'
import { raidStereoPan } from './flightEffects'

const clamp=(n:number)=>Math.max(0,Math.min(1,n))
// The leading contact is followed by a research ship in the same distant flight lane.
const FLYBY_DEPTH = 410
const HAIL_MARY_PASS = [
  { key: CRUISE_HULL_KEYS[0], start: CRUISE_FLYBY_START, length: 9.2, lane: .21, screenSize: .69, viewYaw: -.54 },
  { key: CRUISE_HULL_KEYS[1], start: GRACE_FLYBY_START, length: GRACE_FLYBY_LENGTH, lane: .225, screenSize: .72, viewYaw: -1.08 },
] as const

export function drawHailMaryFlyby(ctx: CanvasRenderingContext2D, stageAge: number, width: number,
  height: number, landscape: boolean, reducedMotion: boolean) {
  const span = Math.min(width, height)
  const depthScale = 1 + FLYBY_DEPTH / raidCameraFocal(height)
  for (const ship of HAIL_MARY_PASS) {
    const progress = (stageAge - ship.start) / ship.length
    if (progress < 0 || progress >= 1) continue
    const screenSize = span * ship.screenSize
    const margin = screenSize * .65
    const y = -margin + (height + margin * 2) * progress
    // Roll the hulls around their flight axis so Grace's wings stay in the distant lane.
    const bank = reducedMotion ? 0 : .018 * Math.sin(progress * Math.PI)
    drawLiveHull(ctx, ship.key, ship.lane * width, y, screenSize * depthScale, bank, 1,
      landscape, 'fx:' + ship.key, { depth: FLYBY_DEPTH, viewYaw: ship.viewYaw })
  }
}

/** Three finite, deterministic background encounters. Every hull enters beyond
 * the edge and leaves continuously; no combat entities or rewards are invented. */
export class WorldStories {
  private readonly sounds=new SampleScene()
  private last=0
  private visibility=0
  private cue=''
  private stage=0
  private run=-1
  draw(ctx:CanvasRenderingContext2D,time:number,stageAge:number,stage:number,run:number,landscape:boolean,
    paused:boolean,enabled:boolean,width:number,height:number,reduced:boolean) {
    if(this.stage!==stage || this.run!==run){this.visibility=0;this.cue='';this.stage=stage;this.run=run;this.sounds.stop()}
    const dt=this.last ? Math.max(0,Math.min(.05,(time-this.last)/1000)) : 0
    this.last=time
    const start=14+(stage%3)*3,age=stageAge-start,inside=age>=0 && age<23
    const target=enabled && inside ? 1 : 0
    if(!paused)this.visibility+=(target-this.visibility)*Math.min(1,dt*3)
    if(paused)this.sounds.stopLoops()
    if(this.visibility<.005 || !inside){this.sounds.stopLoops();return}
    const type=(stage-1)%3,alpha=this.visibility
    const carrierY=125-age*7
    const hull=(key:string,x:number,y:number,size:number,identity:string,bank=0,angle=0,opacity=alpha)=>{
      if(y < -24 || y > 124)return
      ctx.save();ctx.translate(x*width/100,y*height/100);ctx.rotate(angle)
      drawLiveHull(ctx,key,0,0,size,bank,opacity,landscape,'story:'+identity,{depth:340})
      ctx.restore()
    }
    const span=Math.min(width,height)
    let label:string
    if(type===0){
      label='SUPPLY CONVOY · Escorts clearing the sector'
      hull('mesiahBlack',15,carrierY,span*.32,'supply')
      hull('rocket',8,carrierY+11,span*.13,'escort-left')
      hull('rocket',23,carrierY+15,span*.13,'escort-right')
    } else if(type===1){
      const wreckY=125-age*7,blend=clamp((age-8.6)/1.4)
      const eased=blend*blend*(3-2*blend),incoming=135-Math.max(0,age-5)*18
      const catchUp=incoming+(wreckY+4-incoming)*eased
      label=age<10?'RESCUE BEACON · Recovery craft approaching':'RECOVERY CHANNEL · Disabled ship secured'
      hull('rocket',17,wreckY,span*.17,'disabled',reduced?0:Math.sin(age*.48)*.07,.24,alpha*.9)
      if(age>=5)hull('mesiahBlack',21,catchUp,span*.27,'recovery')
      const tether=getRaidCombatFrame(COMBAT_TILE.plasma)
      if(tether && age>9.3 && wreckY> -12 && wreckY<112){
        const dx=width*.04,dy=(catchUp-wreckY)*height/100
        drawRaidCombatTexture(ctx,tether,width*.19,(wreckY+catchUp)*height/200,
          Math.hypot(dx,dy)*1.35,Math.max(4,span*.01),Math.atan2(dy,dx),true,alpha*clamp(age-9.3)*.35)
      }
      const beacon=getRaidCombatFrame(COMBAT_TILE.charge)
      if(beacon && wreckY>-10 && wreckY<110)drawRaidCombatTexture(ctx,beacon,17*width/100,wreckY*height/100,
        span*.04,span*.04,0,true,alpha*(.25+.3*(reduced?1:Math.sin(age*3)**2)))
    } else {
      label='LONG RANGE CONTACT · Hostile wing withdrawing'
      for(let i=0;i<3;i++)hull(i===1?'fighterViolet':'fighterNeedle',12+i*7,130-age*(7+i*.35)+i*8,
        span*(i===1?.2:.12),'retreat-'+i,0,Math.PI)
    }
    const key=stage+':'+type+':'+Number(age>=9.1)
    if(!paused && enabled && key!==this.cue && age>3){
      this.cue=key;this.sounds.play('radio-fragment',.12,raidStereoPan(17,carrierY,landscape),'bgm',1,0,6000)
    }
    if(!paused)this.sounds.loop('passing-carrier',type===2?'engine-rocket':'engine-mesiah',alpha*.035,
      1.05-age*.012,raidStereoPan(17,carrierY,landscape),'bgm')
    const caption=alpha*clamp((age-3)*2)*clamp((type===1?15:10)-age)
    if(caption>.01){
      ctx.save()
      if(landscape){ctx.translate(0,height);ctx.rotate(-Math.PI/2)}
      const w=landscape?height:width,h=landscape?width:height
      ctx.globalAlpha=caption;ctx.fillStyle='rgba(3,15,24,.68)';ctx.fillRect(w*.035,h*.17,w*.56,38)
      ctx.fillStyle='#9bcedd';ctx.font=Math.max(10,Math.min(13,w*.009))+'px sans-serif'
      ctx.fillText(label,w*.045,h*.17+24,w*.54);ctx.restore()
    }
  }
  stop(){this.sounds.stop();this.visibility=0;this.last=0;this.cue=''}
}
