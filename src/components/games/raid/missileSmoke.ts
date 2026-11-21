import { getRaidProjectileMaterial } from './combatArt'
import { missileVisualScale } from './missilePresentation'
import type { Shot } from './types'

export const MISSILE_SMOKE_CAPACITY = 256
const INTERVAL = .028, LIFETIME = .4
export type MissileSmokePuff = { x: number; y: number; age: number; size: number; alpha: number; rotation: number }
type Emitter = { id: number; x: number; y: number; elapsed: number; seen: number }

/** Client-only exhaust history: fixed storage, no simulation or network fields.
 * Puffs stay on the flown path, expand and fade even after the missile hits. */
export class MissileSmokeTrails {
  readonly puffs: MissileSmokePuff[] = Array.from({length:MISSILE_SMOKE_CAPACITY}, () =>
    ({x:0,y:0,age:LIFETIME,size:0,alpha:0,rotation:0}))
  private readonly emitters = new Map<number,Emitter>()
  private readonly slots: Emitter[] = Array.from({length:64}, () => ({id:-1,x:0,y:0,elapsed:0,seen:0}))
  private cursor = 0
  private frame = 0
  private previous: number | null = null
  private run = -1

  clear() {
    this.emitters.clear()
    for (const slot of this.slots) slot.id=-1
    for (const puff of this.puffs) { puff.age=LIFETIME;puff.alpha=0 }
    this.previous=null;this.cursor=0
  }
  update(time: number, paused: boolean, run: number, shots: readonly Shot[], guestShots: readonly Shot[],
    width: number, height: number, visualScale: number) {
    if (this.run!==run) { this.clear();this.run=run }
    const dt = this.previous===null || paused ? 0 : Math.max(0,Math.min(.05,(time-this.previous)/1000))
    this.previous=time;this.frame++
    for (const puff of this.puffs) puff.age=Math.min(LIFETIME,puff.age+dt)
    if (!paused) {
      this.sample(shots,0,dt,width,height,visualScale)
      this.sample(guestShots,1,dt,width,height,visualScale)
      for (const slot of this.slots) if (slot.id>=0 && slot.seen!==this.frame) {
        this.emitters.delete(slot.id);slot.id=-1
      }
    }
    for (const puff of this.puffs) {
      const progress=puff.age/LIFETIME
      puff.size=24+38*progress
      puff.alpha=.48*(1-progress)*(1-progress)
    }
  }
  private sample(shots: readonly Shot[], channel: number, dt: number, width: number, height: number, scale: number) {
    const sx=width/100,sy=height/100
    for (const shot of shots) {
      if (shot.kind!=='rocket' && shot.kind!=='homing') continue
      if (shot.x < -10 || shot.x > 110 || shot.y < -10 || shot.y > 110) continue
      const vx=shot.vx*sx,vy=shot.vy*sy,speed=Math.hypot(vx,vy)
      if (speed<.001) continue
      const material=getRaidProjectileMaterial(shot.kind)
      const length=material?.width ?? (shot.kind==='rocket' ? 24 : 22)*missileVisualScale(shot.kind)
      const tail=length*scale*(material ? .44 : .4)
      const x=shot.x-vx/speed*tail/sx,y=shot.y-vy/speed*tail/sy
      const id=shot.id*3+channel
      let emitter=this.emitters.get(id)
      if (!emitter) {
        for (const slot of this.slots) if (slot.id<0) { emitter=slot;break }
        if (!emitter) continue
        emitter.id=id;emitter.x=x;emitter.y=y;emitter.elapsed=INTERVAL
        this.emitters.set(id,emitter)
      }
      // Rebase delayed co-op corrections instead of painting a teleport line.
      if (Math.hypot((x-emitter.x)*sx,(y-emitter.y)*sy)>Math.max(80,speed*.15)) {
        emitter.x=x;emitter.y=y;emitter.elapsed=0
      }
      emitter.seen=this.frame;emitter.elapsed+=dt
      while (emitter.elapsed>=INTERVAL) {
        emitter.elapsed-=INTERVAL
        const blend=dt>0 ? Math.max(0,Math.min(1,1-emitter.elapsed/dt)) : 1
        const puff=this.puffs[this.cursor]
        puff.x=emitter.x+(x-emitter.x)*blend;puff.y=emitter.y+(y-emitter.y)*blend
        puff.age=emitter.elapsed;puff.rotation=id*2.399+this.cursor*.37
        this.cursor=(this.cursor+1)%this.puffs.length
      }
      emitter.x=x;emitter.y=y
    }
  }
}
