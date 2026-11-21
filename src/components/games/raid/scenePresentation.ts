import { destructionProfile, destructionHullAlpha, type DestructionProfile } from './destructionProfile'
import { DestructionEffects } from './destructionEffects'
import { AdaptiveScore, SampleScene, warmImmersionAudio } from '../presentationAudio'
import type { ImmersionClip } from '../presentationAssets'
import { getGameSoundEnabled } from '../sound'
import { submitHullDestruction, submitLiveHull } from './liveHullBridge'
import { enemyHullKey, ENEMY_HULL_SPECS } from './enemyHulls'
import { getEnemyCanvasSize } from './assets'
import { fighterHullHeading } from './fighterHulls'
import { cosmicRegionIndex } from './cosmos'
import { raidStereoPan } from './flightEffects'
import { clearPlayerConditions, recordPlayerFeedback, validPlayerFeedback } from './playerCondition'
import type { DestructionPresentationEvent, Enemy, GamePhase, Player, PlayerFeedbackKind, RaidRandomEventKind, Vec } from './types'

type SceneState = {
  phase: GamePhase; stage: number; carrier: boolean; stageClear: boolean; player: Player; ally: Player | null
  enemies: readonly Enemy[]; hostileShots: number; event?: RaidRandomEventKind; landscape: boolean; elite: boolean
  bgm: HTMLAudioElement | null; track: string
}
type Burst = DestructionPresentationEvent & { at: number; poseSeconds: number; profile: DestructionProfile; finalePlayed: boolean }

/** Audio and cosmetic timelines share authoritative events, never combat decisions. */
export class RaidScenePresentation {
  private readonly destructionEffects = new DestructionEffects()
  private sounds = new SampleScene()
  private score = new AdaptiveScore()
  private sequence = 0
  private received = 0
  private stream: DestructionPresentationEvent[] = []
  private bursts: Burst[] = []
  private defeated = new Set<number>()
  private feedback = new Set<number>()
  private nextAmbience = 0
  private nextFault = 0
  private pressure = 0
  private clock = 0
  private previous = 0
  private landscape = false
  private lastPhase: GamePhase = 'select'

  warm() { void warmImmersionAudio() }

  playerEvent(player: Player, kind: PlayerFeedbackKind, contact?: Vec) {
    recordPlayerFeedback(player, kind, contact)
    this.observePlayer(player)
  }

  observePlayer(player: Player) {
    const event = player.feedback
    if (!validPlayerFeedback(event) || this.feedback.has(event.serial)) return
    this.feedback.add(event.serial)
    if (this.feedback.size > 64) this.feedback.delete(this.feedback.values().next().value!)
    this.sounds.play(event.kind, event.kind === 'repair' ? .3 : event.kind.endsWith('break') ? .58 : .36,
      raidStereoPan(player.x, player.y, this.landscape), 'impact', 3)
  }

  defeat(enemy: Enemy) {
    if (this.defeated.has(enemy.id)) return
    this.defeated.add(enemy.id)
    if (this.defeated.size > 512) this.defeated.delete(this.defeated.values().next().value!)
    const event: DestructionPresentationEvent = { serial: ++this.sequence, x: enemy.x, y: enemy.y,
      radius: Math.max(1, Math.min(20, enemy.radius)), tier: enemy.isBoss ? 'capital' : enemy.isMiniBoss || enemy.radius >= 4 ? 'armored' : 'fighter', seed: enemy.id % 997, enemyId:enemy.id,hull:enemyHullKey(enemy) ?? undefined,
      elite:enemy.isMiniBoss,variant:enemy.variant,bossKind:enemy.bossKind,vx:enemy.isBoss?0:enemy.vx,vy:enemy.isBoss?3.5:enemy.isMiniBoss?5:enemy.vy*(enemy.tacticSpeed ?? 1) }
    this.stream.push(event)
    if (this.stream.length>12) {
      // Keep a fresh capital event in co-op packets during simultaneous kills.
      const expendable=this.stream.findIndex(e=>e.tier!=='capital' || e!==event && !this.bursts.some(b=>b.serial===e.serial && this.clock-b.at<6000))
      this.stream.splice(expendable<0?0:expendable,1)
    }
    this.ingest([event])
    const profile=this.bursts.find(b=>b.serial===event.serial)?.profile
    if(profile){enemy.defeatStyle=profile.style;enemy.defeatFinale=profile.finale}
    return profile
  }

  snapshot() { return this.stream.slice() }

  ingest(events: readonly DestructionPresentationEvent[]) {
    for (const event of events.slice(-12)) {
      if (!event || !Number.isSafeInteger(event.serial) || event.serial <= this.received || !Number.isFinite(event.seed) || !Number.isFinite(event.x) || !Number.isFinite(event.y)
        || Math.abs(event.x)>160 || Math.abs(event.y)>160 || !Number.isFinite(event.radius) || !['fighter', 'armored', 'capital'].includes(event.tier)) continue
      this.received = event.serial
      const normalized = { ...event, seed:Math.abs(event.seed)%997,
        enemyId:Number.isSafeInteger(event.enemyId)?event.enemyId:undefined,
        variant:Number.isFinite(event.variant)?Math.max(0,Math.min(32,event.variant!)):0,
        vx:Number.isFinite(event.vx)?Math.max(-300,Math.min(300,event.vx!)):0,
        vy:Number.isFinite(event.vy)?Math.max(-300,Math.min(300,event.vy!)):1,
        hull:typeof event.hull==='string' && ENEMY_HULL_SPECS[event.hull] ? event.hull : undefined, radius: Math.max(1, Math.min(20, event.radius)), at: this.clock }
      const profile=destructionProfile(normalized)
      this.bursts.push({...normalized,poseSeconds:performance.now()/1000,profile,finalePlayed:false})
      if(this.bursts.length>24){
        const expendable=this.bursts.findIndex(b=>b.tier!=='capital')
        this.bursts.splice(expendable<0?0:expendable,1)
      }
      if(profile.style===6 || profile.style===4)continue
      this.sounds.play(`${event.tier}-death`, event.tier === 'capital' ? .62 : event.tier === 'armored' ? .42 : .26,
        raidStereoPan(event.x, event.y, this.landscape), 'explosion', event.tier === 'capital' ? 4 : 2, 0, event.tier === 'fighter' ? 110 : 180)
    }
  }

  update(state: SceneState) {
    this.landscape = state.landscape
    const paused = state.phase === 'paused' || document.hidden || !getGameSoundEnabled()
    if (paused) { this.sounds.stop(); this.score.update(null, '', 0, false); return }
    if (state.phase === 'select' && this.lastPhase !== 'select') {
      this.bursts.length = 0; this.stream.length = 0; this.defeated.clear(); this.feedback.clear(); this.pressure = 0
      this.sequence = 0; this.received = 0
      this.sounds.stop()
    }
    this.lastPhase = state.phase
    const active = state.phase === 'playing' && !state.carrier
    const alive = state.enemies.filter(enemy => enemy.hp > 0)
    const boss = alive.find(enemy => enemy.isBoss)
    const target = state.stageClear || !active ? 0 : boss ? .65 + (1 - boss.hp / Math.max(1, boss.maxHp)) * .35
      : Math.min(1, alive.length / 22 + state.hostileShots / 100)
    this.pressure += (target - this.pressure) * (target > this.pressure ? .24 : .14)
    this.score.update(state.bgm, state.track, this.pressure, active && !state.stageClear)
    if (!active) { this.sounds.stop(); return }
    const now = performance.now()
    const engine = (pilot: Player | null, slot: string, gain: number) => {
      const clip = pilot ? `engine-${pilot.ship.key}` as ImmersionClip : null
      const boost = Math.min(1, Math.max(0, (pilot?.engineBoost ?? 0) / 1.35))
      const critical = pilot && pilot.hp <= pilot.maxHp * .35
      const sputter = critical ? .76 + .24 * Math.sin(now / 85) ** 2 : 1
      this.sounds.loop(slot, pilot && pilot.hp > 0 ? clip : null,
        gain * (.38 + boost * .62) * sputter, .82 + boost * .28,
        pilot ? raidStereoPan(pilot.x, pilot.y, state.landscape) * .28 : 0, 'player')
      if (pilot) this.observePlayer(pilot)
    }
    engine(state.player, 'engine', .29)
    engine(state.ally, 'ally-engine', .14)
    const boost = Math.min(1, Math.max(0, state.player.engineBoost / 1.35))
    this.sounds.loop('elite-harmonic', state.elite && state.player.hp > 0 ? `engine-${state.player.ship.key}` as ImmersionClip : null,
      .034 * (.4 + boost * .6), 1.34 + boost * .18, 0, 'player')
    const region = cosmicRegionIndex(state.stage)
    const sector = state.event === 'ion' ? 'ion' : state.event === 'wreck' ? 'wreck'
      : state.stage === 5 || state.stage === 9101 ? 'ocean' : state.stage === 10 || state.stage === 9102 ? 'volcanic'
        : (['stellar', 'asteroid', 'wreck', 'ion'] as const)[region]
    this.sounds.loop('sector', `sector-${sector}`, (boss ? .055 : .105) * (state.stageClear ? .45 : 1), 1, 0, 'bgm')
    if (!boss && !state.stageClear && now >= this.nextAmbience) {
      this.nextAmbience = now + 17000 + region * 3100
      this.sounds.play(region >= 2 ? 'radio-fragment' : 'hull-tick', .09, Math.sin(now / 4000) * .6, 'bgm', 0, 0, 15000)
    }
    if (state.player.hp > 0 && state.player.hp <= state.player.maxHp * .35 && now >= this.nextFault) {
      this.nextFault = now + 2700
      this.sounds.play('hull-tick', .13, 0, 'impact', 1, 0, 2400)
    }
  }

  prepareDestructionEffects(time:number,phase:GamePhase,width:number,height:number,reduced:boolean,carrier:boolean) {
    const delta = this.previous ? Math.max(0, Math.min(50, time - this.previous)) : 0
    this.previous = time
    if (phase !== 'paused' && !document.hidden) this.clock += delta
    this.destructionEffects.clear()
    if(carrier || phase!=='playing' && phase!=='paused') {
      this.clearDestruction()
      return this.destructionEffects.particles
    }
    for(const tier of ['capital','armored','fighter'] as const)for(let i=this.bursts.length-1;i>=0;i--){
      const burst=this.bursts[i]
      if(burst.tier!==tier)continue
      const seconds=(this.clock-burst.at)/1000
      if(seconds>burst.profile.lifetime || seconds<0 || burst.profile.style===6)continue
      const shape={isBoss:tier==='capital',isMiniBoss:Boolean(burst.elite),variant:burst.variant ?? 0,bossKind:burst.bossKind ?? null} as Enemy
      const size=getEnemyCanvasSize(shape,width,this.landscape)*(shape.isBoss && !['squid','snake','final','devil'].includes(shape.bossKind ?? '')?1.04:width>1100?.96:1)
      this.destructionEffects.add(burst,seconds,size,width,height,reduced,burst.profile)
      if(!burst.finalePlayed && burst.profile.finale>0 && seconds>=burst.profile.finale && phase==='playing') {
        burst.finalePlayed=true
        this.sounds.play(`${tier}-death`,tier==='capital'?.55:tier==='armored'?.34:.22,
          raidStereoPan(burst.x,burst.y,this.landscape),'explosion',tier==='capital'?4:2,0,0)
      }
    }
    return this.destructionEffects.particles
  }

  draw(_ctx: CanvasRenderingContext2D, _time: number, _phase: GamePhase, toX: (n: number) => number,
    toY: (n: number) => number, width: number, reduced: boolean, _low: boolean) {
    let write=0
    for(const burst of this.bursts){
      const lifetime=burst.profile.lifetime
      if((this.clock-burst.at)/1000<=lifetime)this.bursts[write++]=burst
    }
    this.bursts.length=write
    // Capital ruptures always get a slot, even during a simultaneous swarm kill.
    let admitted=0
    for(const tier of ['capital','armored','fighter'] as const)for(let i=this.bursts.length-1;i>=0 && admitted<12;i--){
      const burst=this.bursts[i]
      if(burst.tier!==tier || !burst.hull)continue
      const seconds=(this.clock-burst.at)/1000,profile=burst.profile
      const shape={isBoss:tier==='capital',isMiniBoss:Boolean(burst.elite),variant:burst.variant ?? 0,bossKind:burst.bossKind ?? null} as Enemy
      const size=getEnemyCanvasSize(shape,width,this.landscape)*(shape.isBoss && !['squid','snake','final','devil'].includes(shape.bossKind ?? '')?1.04:width>1100?.96:1)
      if(profile.style===6) {
        const t=Math.min(1,seconds/2.85),side=burst.seed%2?1:-1,escape=t*t
        const angle=(this.landscape?Math.PI/2:0)+(reduced?0:side*Math.sin(t*Math.PI)*.16)
        // Living bosses withdraw intact. Logical upstream remains the enemy
        // entry edge in either orientation; depth carries them into the distance.
        if(submitLiveHull({id:'enemy:'+burst.enemyId,key:burst.hull,x:toX(burst.x+side*18*Math.sin(t*Math.PI/2)),
          y:toY(burst.y-(burst.y+110)*escape),size:size*(burst.bossKind==='snake'?.8:1)*(1+Math.sin(burst.poseSeconds/1.1)*.03)*(1-t*.2),
          bank:0,angle,alpha:1,landscape:this.landscape,depth:t*260,
          bossPose:{seconds:burst.poseSeconds+seconds,attack:0,targetX:0,targetY:-1,motion:reduced?0:1}}))admitted++
        continue
      }
      const alpha=destructionHullAlpha(profile,seconds)
      if(alpha<=.005)continue
      const heading=shape.isBoss || shape.isMiniBoss ? 0 : fighterHullHeading(burst.vx ?? 0,burst.vy ?? 1,width,toY(100))
      if(submitHullDestruction({id:'death:'+burst.serial+':'+burst.enemyId,sourceId:'enemy:'+burst.enemyId,key:burst.hull,
        x:toX(burst.x),y:toY(burst.y),size,angle:heading,landscape:this.landscape,
        age:reduced?Math.min(.04,seconds):seconds,seed:burst.seed,alpha,tempo:profile.tempo,style:profile.style,finale:profile.finale,
        driftX:(burst.vx ?? 0)*width/100,driftY:(burst.vy ?? 1)*toY(100)/100}))admitted++
    }
  }

  clearDestruction(){this.bursts.length=0;this.previous=0;this.destructionEffects.clear()}

  stop() {
    this.sounds.stop(); this.score.stop(); this.bursts.length = 0; this.stream.length = 0
    this.defeated.clear(); this.feedback.clear(); this.sequence = 0; this.received = 0
    this.destructionEffects.clear()
    this.clock = 0; this.previous = 0; this.lastPhase = 'select'; clearPlayerConditions()
  }
}
