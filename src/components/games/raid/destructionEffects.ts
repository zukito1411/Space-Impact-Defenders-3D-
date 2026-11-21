import type { DestructionProfile } from './destructionProfile'
import { COMBAT_TILE, drawRaidCombatTexture, getRaidCombatFrame, getRaidExplosionFrame } from './combatArt'
import type { DestructionPresentationEvent } from './types'

export const DESTRUCTION_FX_CAPACITY = 256
export type DestructionParticle = {
  kind: 'smoke' | 'spark' | 'explosion'; x: number; y: number
  width: number; height: number; rotation: number; alpha: number; progress: number
}

/** Analytic, client-only particles share the authoritative death timeline.
 * Fixed storage, no emitters, timers, extra textures or network particles. */
export class DestructionEffects {
  readonly particles: DestructionParticle[] = []
  private readonly pool: DestructionParticle[] = Array.from({length:DESTRUCTION_FX_CAPACITY},()=>
    ({kind:'smoke',x:0,y:0,width:0,height:0,rotation:0,alpha:0,progress:0}))

  clear(){this.particles.length=0}

  add(event: DestructionPresentationEvent, seconds: number, hullSize: number, width: number, height: number, reduced: boolean, profile: DestructionProfile) {
    if(profile.style===6)return
    const capital=event.tier==='capital',armored=Boolean(event.elite),style=profile.style
    const sx=width/100,sy=height/100,extent=Math.max(12,hullSize*.42)
    const driftX=(event.vx ?? 0)*sx,driftY=(event.vy ?? 1)*sy
    const seed=event.seed*.61803398875,variation=.85+(event.seed%11)*.03
    const bursts=profile.blasts
    for(let i=0;i<bursts;i++){
      const delay=style===0?i*.045:style===1?i*.1:style===2?(i===0?0:profile.finale+(i-1)*.07)
        :style===4?profile.finale+i*.075:i/Math.max(1,bursts-1)*profile.finale
      const age=seconds-delay,duration=capital?.75:.5
      if(age<0 || age>=duration)continue
      const a=seed+i*2.399,offset=style===2 && i===0?extent*.6:i===bursts-1?0:extent*(.2+(i%3)*.14)
      const partial=style===2 && i===0
      const size=extent*(partial?.38:profile.scale)*(1+age/duration*.45)*variation
      this.put('explosion',event.x+(Math.cos(a)*offset+driftX*seconds)/sx,
        event.y+(Math.sin(a)*offset+driftY*seconds)/sy,size,size,a,
        (reduced?.55:1)*(1-age/duration)**.55,age/duration)
    }
    const smokeCount=profile.smoke,start=style===4?profile.finale:0
    const smokeLife=capital?2.1:armored?1.65:1.3
    const interval=Math.min(capital?.19:.09,Math.max(.03,(profile.lifetime-start-smokeLife)/(smokeCount-1)))
    for(let i=0;i<smokeCount;i++){
      const birth=start+i*interval,age=seconds-birth
      if(age<0 || age>=smokeLife)continue
      const a=seed+i*2.399,spread=extent*(.14+(i%3)*.1)+(reduced?0:age*extent*(style===0?.42:style===5?.17:.24))
      const size=extent*(.55+age/smokeLife*.95)*variation*(style===0?1.18:1)
      const alpha=Math.min(1,age/.12)*(1-age/smokeLife)**1.3*(capital?.48:.38)
      this.put('smoke',event.x+(Math.cos(a)*spread+driftX*(birth+age*.8))/sx,
        event.y+(Math.sin(a)*spread+driftY*(birth+age*.8))/sy,size,size*.87,a+(reduced?0:age*.12),alpha,0)
    }
    const sparkCount=profile.sparks
    for(let i=0;i<sparkCount;i++){
      const delay=style===4?profile.finale+(i%3)*.07:style===2?(i%3===0?0:profile.finale):style===3?i%3*profile.finale/2:style===0?0:i%3*.1
      const age=seconds-delay,life=.42+(i%5)*.13
      if(age<0 || age>=life)continue
      const a=style===5?seed+(i%2?Math.PI:0)+(i%5-2)*.13:seed+i*2.399
      const speed=extent*(1.15+(i%4)*.43)*variation
      const travel=reduced?extent*.18:speed*age
      const length=Math.max(5,Math.min(28,extent*.18))*(1-age/life*.6)
      this.put('spark',event.x+(Math.cos(a)*travel+driftX*seconds)/sx,
        event.y+(Math.sin(a)*travel+driftY*seconds)/sy,length,Math.max(2,length*.2),a,
        (1-age/life)**1.4*(reduced?.5:1),0)
    }
  }

  private put(kind:DestructionParticle['kind'],x:number,y:number,width:number,height:number,rotation:number,alpha:number,progress:number){
    if(this.particles.length>=this.pool.length)return
    const p=this.pool[this.particles.length]
    p.kind=kind;p.x=x;p.y=y;p.width=width;p.height=height;p.rotation=rotation;p.alpha=alpha;p.progress=progress
    this.particles.push(p)
  }
}

export function destructionParticleTexture(p:DestructionParticle){
  return p.kind==='explosion'?getRaidExplosionFrame(p.progress):getRaidCombatFrame(p.kind==='smoke'?COMBAT_TILE.smoke:COMBAT_TILE.spark)
}

export function drawDestructionEffects(ctx:CanvasRenderingContext2D,particles:readonly DestructionParticle[],width:number,height:number){
  for(const p of particles){
    if(p.alpha<=.002)continue
    const texture=destructionParticleTexture(p)
    if(texture)drawRaidCombatTexture(ctx,texture,p.x*width/100,p.y*height/100,p.width,p.height,p.rotation,p.kind!=='smoke',p.alpha)
  }
}
