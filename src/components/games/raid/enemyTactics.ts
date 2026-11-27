import type { Enemy, Vec } from './types'
import { CROSSFIRE_LOCK_AGE, CROSSFIRE_WARNING_SECONDS } from './cruiseEncounters'
import { getRaidFighter, LEGACY_FIGHTER_COUNT } from './stageEncounters'

type Wing = { seen:number; leader:number; members:Enemy[]; regroup:number; age:number; attackX:number; attackY:number; cycle:number; disrupted:boolean }
const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n))
/** Host-only wing decisions. Movement still uses the existing smooth integrator,
 * shot budgets and committed aim; clients receive the authoritative positions. */
export class EnemyTactics {
  private readonly wings=new Map<number,Wing>()
  private readonly cruiseLeaders = new Map<number, Enemy>()
  private frame=0
  private epoch=''
  update(enemies:readonly Enemy[],dt:number,stage:number,run:number,target:Vec) {
    const epoch=stage+':'+run
    if(this.epoch!==epoch){this.wings.clear();this.epoch=epoch}
    this.frame++
    for(const wing of this.wings.values())wing.members.length=0
    this.cruiseLeaders.clear()
    let protectedHull:Enemy|undefined
    for(const enemy of enemies) {
      enemy.tacticX=undefined;enemy.tacticSpeed=1;enemy.tacticHoldFire=false
      if(enemy.hp<=0)continue
      if((enemy.isBoss || enemy.isMiniBoss) && enemy.hp/enemy.maxHp<.48) {
        if(!protectedHull || enemy.isBoss && !protectedHull.isBoss || enemy.isBoss===protectedHull.isBoss && enemy.hp/enemy.maxHp<protectedHull.hp/protectedHull.maxHp)protectedHull=enemy
      }
      if (enemy.isMiniBoss && (enemy.cruiseEliteAge !== undefined || enemy.miniBossKind === 'brood')) {
        this.cruiseLeaders.set(enemy.squadId ?? -enemy.id, enemy)
      }
      if(enemy.isBoss || enemy.isMiniBoss)continue
      const id=enemy.squadId ?? -enemy.id
      let wing=this.wings.get(id)
      if(!wing){wing={seen:this.frame,leader:enemy.id,members:[],regroup:0,age:0,attackX:target.x,attackY:target.y,cycle:0,disrupted:false};this.wings.set(id,wing)}
      wing.seen=this.frame;wing.members.push(enemy)
    }
    for(const [id,wing] of this.wings) {
      if(wing.seen!==this.frame){this.wings.delete(id);continue}
      const previousAge = wing.age
      wing.age+=dt;wing.regroup=Math.max(0,wing.regroup-dt)
      let leader=wing.members[0],leaderAlive=false,center=0
      for(const enemy of wing.members){
        if(enemy.id===wing.leader)leaderAlive=true
        if(enemy.maxHp>leader.maxHp)leader=enemy
        center+=enemy.x
      }
      center/=wing.members.length
      if(!leaderAlive){wing.regroup=2.4;wing.leader=leader.id;wing.disrupted=true}
      if (previousAge < CROSSFIRE_LOCK_AGE && wing.age >= CROSSFIRE_LOCK_AGE && wing.members[0].cruiseManeuver === 'crossfire') {
        wing.attackX = clamp(target.x, 20, 80)
        wing.attackY = clamp(target.y, 64, 92)
      }
      const elite = this.cruiseLeaders.get(id)
      const cycle=Math.floor(wing.age/10)
      if(cycle!==wing.cycle){wing.cycle=cycle;if(!wing.members[0].cruiseManeuver)wing.attackX=target.x}
      const phase=wing.age%10
      for(let i=0;i<wing.members.length;i++) {
        const enemy=wing.members[i],role=enemy.variant-LEGACY_FIGHTER_COUNT
        const side=(enemy.trainSlot%2 ? 1 : -1)
        const flank = enemy.cruiseFlank ?? side
        if (enemy.cruiseManeuver === 'crossfire') {
          // Both flanks fire toward fixed marks on either side of the pilot's
          // lane. Destroying the lead ship aborts any shots still winding up.
          const fireAge = CROSSFIRE_LOCK_AGE + CROSSFIRE_WARNING_SECONDS + Math.floor(enemy.trainSlot / 2) * .14
          const ready = !wing.disrupted && Boolean(getRaidFighter(enemy.variant)?.shots)
          const fire = ready && previousAge < fireAge && wing.age >= fireAge
          enemy.tacticX = wing.disrupted ? enemy.originX + flank * 15 : enemy.originX
          enemy.tacticSpeed = wing.disrupted ? 1.3 : enemy.y >= 20 && wing.age < fireAge ? .35 : 1
          enemy.tacticHoldFire = !fire
          enemy.chargeTimer = ready && wing.age >= CROSSFIRE_LOCK_AGE ? Math.max(0, fireAge - wing.age) : 0
          enemy.chargeLane = wing.attackX - flank * 8
          enemy.chargeTargetY = wing.attackY
          if (fire) enemy.fireCooldown = 0
          continue
        }
        if (enemy.cruiseManeuver === 'sweep' && enemy.y >= 8) {
          const progress = clamp((enemy.y - 8) / 44, 0, 1)
          const spread = (enemy.trainSlot % 3 - 1) * 5
          const sweepX = enemy.originX - flank * 60 * progress
          enemy.tacticX = clamp(sweepX + spread * progress, 9, 91)
          enemy.tacticSpeed = enemy.y < 26 ? .77 : 1.23
          enemy.tacticHoldFire = enemy.y < 25
          continue
        }
        if (enemy.cruiseManeuver === 'escort' && !elite) {
          enemy.tacticX = flank < 0 ? 5 : 95
          enemy.tacticSpeed = 1.45
          enemy.tacticHoldFire = true
          continue
        }
        if (enemy.cruiseManeuver === 'barrage') {
          enemy.tacticX = enemy.originX
          enemy.tacticSpeed = enemy.y < 24 ? .87 : enemy.y < 43 ? .53 : 1.14
          enemy.tacticHoldFire = enemy.y < 21
          continue
        }
        if(enemy.y<4 || enemy.y>76)continue
        if (enemy.cruiseManeuver === 'escort' && elite) {
          enemy.tacticX = clamp(elite.x + flank * (11 + Math.floor(i / 2) * 6), 6, 94)
          enemy.tacticSpeed = enemy.y > elite.y + 9 ? .12 : enemy.y > elite.y ? .52 : .95
          continue
        }
        if (enemy.cruiseManeuver === 'pincer') {
          const rank = Math.floor(enemy.trainSlot / 2)
          enemy.tacticX = clamp(wing.attackX + flank * (enemy.y < 40 ? 16 + rank * 5 : 7 + rank * 5), 7, 93)
          enemy.tacticSpeed = enemy.y < 25 ? .88 : 1.23
          continue
        }
        if (enemy.cruiseManeuver === 'dive') {
          if (enemy.y >= 20) {
            enemy.tacticX = clamp(wing.attackX + flank * (10 - enemy.trainSlot * 3), 8, 92)
            enemy.tacticSpeed = enemy.y < 32 ? .72 : 1.49
            enemy.tacticHoldFire = enemy.y < 32
          }
          continue
        }
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
