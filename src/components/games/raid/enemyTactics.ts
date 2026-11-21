import type { Enemy, Vec } from './types'
import { LEGACY_FIGHTER_COUNT } from './stageEncounters'

type Wing = { seen:number; leader:number; members:Enemy[]; regroup:number; age:number; attackX:number; cycle:number }
const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n))
/** Host-only wing decisions. Movement still uses the existing smooth integrator,
 * shot budgets and committed aim; clients receive the authoritative positions. */
export class EnemyTactics {
  private readonly wings=new Map<number,Wing>()
  private frame=0
  private epoch=''
  update(enemies:readonly Enemy[],dt:number,stage:number,run:number,target:Vec) {
    const epoch=stage+':'+run
    if(this.epoch!==epoch){this.wings.clear();this.epoch=epoch}
    this.frame++
    for(const wing of this.wings.values())wing.members.length=0
    let protectedHull:Enemy|undefined
    for(const enemy of enemies) {
      enemy.tacticX=undefined;enemy.tacticSpeed=1;enemy.tacticHoldFire=false
      if(enemy.hp<=0)continue
      if((enemy.isBoss || enemy.isMiniBoss) && enemy.hp/enemy.maxHp<.48) {
        if(!protectedHull || enemy.isBoss && !protectedHull.isBoss || enemy.isBoss===protectedHull.isBoss && enemy.hp/enemy.maxHp<protectedHull.hp/protectedHull.maxHp)protectedHull=enemy
      }
      if(enemy.isBoss || enemy.isMiniBoss)continue
      const id=enemy.squadId ?? -enemy.id
      let wing=this.wings.get(id)
      if(!wing){wing={seen:this.frame,leader:enemy.id,members:[],regroup:0,age:0,attackX:target.x,cycle:0};this.wings.set(id,wing)}
      wing.seen=this.frame;wing.members.push(enemy)
    }
    for(const [id,wing] of this.wings) {
      if(wing.seen!==this.frame){this.wings.delete(id);continue}
      wing.age+=dt;wing.regroup=Math.max(0,wing.regroup-dt)
      let leader=wing.members[0],leaderAlive=false,center=0
      for(const enemy of wing.members){
        if(enemy.id===wing.leader)leaderAlive=true
        if(enemy.maxHp>leader.maxHp)leader=enemy
        center+=enemy.x
      }
      center/=wing.members.length
      if(!leaderAlive){wing.regroup=2.4;wing.leader=leader.id}
      const cycle=Math.floor(wing.age/10)
      if(cycle!==wing.cycle){wing.cycle=cycle;wing.attackX=target.x}
      const phase=wing.age%10
      for(let i=0;i<wing.members.length;i++) {
        const enemy=wing.members[i],role=enemy.variant-LEGACY_FIGHTER_COUNT
        if(enemy.y<4 || enemy.y>76)continue
        const side=(enemy.trainSlot%2 ? 1 : -1)
        if(wing.regroup>0 && wing.members.length>1) {
          enemy.tacticX=clamp(center+(i-(wing.members.length-1)/2)*6,7,93)
          enemy.tacticSpeed=.78;enemy.tacticHoldFire=wing.regroup>1.65
        } else if(protectedHull && (role===0 || role===1 || role===4) && Math.abs(enemy.y-protectedHull.y)<24) {
          enemy.tacticX=clamp(protectedHull.x+side*(protectedHull.radius+8+(i%2)*3),6,94)
          enemy.tacticSpeed=enemy.y>protectedHull.y+8?.55:.9
        } else if(wing.members.length>1 && (role===0 || role===1 || role===4) && phase>2+i*.16 && phase<5.4+i*.16) {
          enemy.tacticX=clamp(wing.attackX+side*(11+(i%3)*4),6,94)
          enemy.tacticSpeed=1.06
        }
      }
    }
  }
  /** Surviving escorts break away after command loss instead of freezing in place. */
  retreat(enemies:readonly Enemy[],dt:number) {
    for(const enemy of enemies)if(enemy.hp>0 && !enemy.isBoss && !enemy.isMiniBoss){
      const side=enemy.x<50?-1:1
      enemy.x+=side*(12+enemy.trainSlot%3*3)*dt
      enemy.y+=Math.max(16,enemy.vy)*dt*1.1
      enemy.vx=side*12
    }
  }
}
