import type { BossKind, DestructionPresentationEvent } from './types'

// IDs are also consumed by the shared breakup shader; no per-style geometry.
export type DestructionStyle = 0 | 1 | 2 | 3 | 4 | 5 | 6
export type DestructionProfile = {
  style: DestructionStyle; lifetime: number; finale: number; tempo: number
  blasts: number; smoke: number; sparks: number; scale: number
}
export const isOrganicBoss = (enemy: {bossKind?: BossKind | null}) => enemy.bossKind==='squid' || enemy.bossKind==='snake'

// Flash, shatter, part loss, progressive rupture, core overload, split hull.
const profiles: readonly (readonly DestructionProfile[])[] = [
  [
    {style:0,lifetime:1.8,finale:0,tempo:.8,blasts:1,smoke:5,sparks:8,scale:1.7},
    {style:1,lifetime:2.5,finale:.12,tempo:.8,blasts:2,smoke:6,sparks:14,scale:1.1},
    {style:2,lifetime:2.7,finale:.65,tempo:.8,blasts:2,smoke:7,sparks:10,scale:1.65},
    {style:3,lifetime:2.9,finale:.9,tempo:.8,blasts:3,smoke:8,sparks:12,scale:1.2},
    {style:4,lifetime:2.8,finale:.55,tempo:.8,blasts:2,smoke:7,sparks:14,scale:1.8},
    {style:5,lifetime:2.7,finale:.35,tempo:.8,blasts:2,smoke:6,sparks:10,scale:1.15},
  ],
  [
    {style:0,lifetime:2.5,finale:0,tempo:1.1,blasts:1,smoke:8,sparks:12,scale:1.85},
    {style:1,lifetime:3.7,finale:.16,tempo:1.1,blasts:3,smoke:10,sparks:20,scale:1.2},
    {style:2,lifetime:3.6,finale:.95,tempo:1.1,blasts:3,smoke:11,sparks:16,scale:1.7},
    {style:3,lifetime:4.1,finale:1.25,tempo:1.1,blasts:4,smoke:12,sparks:18,scale:1.3},
    {style:4,lifetime:3.9,finale:1,tempo:1.1,blasts:3,smoke:11,sparks:20,scale:1.9},
    {style:5,lifetime:3.8,finale:.5,tempo:1.1,blasts:3,smoke:10,sparks:16,scale:1.3},
  ],
  [
    {style:0,lifetime:3.5,finale:0,tempo:1.5,blasts:2,smoke:14,sparks:18,scale:2},
    {style:1,lifetime:5.3,finale:.22,tempo:1.5,blasts:4,smoke:16,sparks:24,scale:1.35},
    {style:2,lifetime:4.9,finale:1.35,tempo:1.5,blasts:4,smoke:17,sparks:22,scale:1.85},
    {style:3,lifetime:5.7,finale:1.85,tempo:1.5,blasts:5,smoke:18,sparks:24,scale:1.45},
    {style:4,lifetime:5.5,finale:1.6,tempo:1.5,blasts:4,smoke:18,sparks:26,scale:2.1},
    {style:5,lifetime:5.4,finale:.8,tempo:1.5,blasts:4,smoke:16,sparks:22,scale:1.4},
  ],
  [
    {style:0,lifetime:4.1,finale:0,tempo:1.9,blasts:3,smoke:18,sparks:22,scale:2.2},
    {style:1,lifetime:6,finale:.3,tempo:1.9,blasts:5,smoke:20,sparks:28,scale:1.5},
    {style:2,lifetime:5.7,finale:1.7,tempo:1.9,blasts:5,smoke:20,sparks:26,scale:2},
    {style:3,lifetime:6,finale:2.1,tempo:1.9,blasts:6,smoke:22,sparks:28,scale:1.65},
    {style:4,lifetime:6,finale:1.95,tempo:1.9,blasts:5,smoke:22,sparks:30,scale:2.3},
    {style:5,lifetime:6,finale:1.1,tempo:1.9,blasts:5,smoke:20,sparks:26,scale:1.6},
  ],
]
const retreat: DestructionProfile = {style:6,lifetime:3.1,finale:0,tempo:1,blasts:0,smoke:0,sparks:0,scale:1}

/** Stable per kill on host and guest, without transmitting particle state.
 * Hull identity, enemy ID and serial avoid synchronizing an entire formation. */
export function destructionProfile(event: DestructionPresentationEvent): DestructionProfile {
  if(isOrganicBoss(event))return retreat
  const big=event.bossKind==='final' || event.bossKind==='devil' || event.bossKind==='super'
  const family=event.tier==='capital'?(big?3:2):event.elite?1:0
  let hash=Math.imul(Math.trunc(event.seed)+1,0x45d9f3b)^Math.imul((event.variant ?? 0)+1,0x27d4eb2d)^Math.imul(event.serial,0x165667b1)
  for(let i=0;i<(event.hull?.length ?? 0);i++)hash=Math.imul(hash^event.hull!.charCodeAt(i),31)
  hash=Math.imul(hash^(hash>>>16),0x45d9f3b);hash^=hash>>>16
  return profiles[family][(hash>>>0)%6]
}

export function destructionHullAlpha(profile:DestructionProfile,seconds:number){
  if(profile.style===0 || profile.style===6)return 0
  const end=profile.style===2?profile.finale+.22:profile.lifetime
  return Math.max(0,Math.min(1,(end-seconds)/(profile.style===2?.22:.65)))
}

/** Authored actors without a fragment mesh disappear inside their chosen blast. */
export function authoredDefeatAlpha(style:number|undefined,finale:number|undefined,seconds:number,fallback:number){
  if(style===undefined)return fallback
  const end=style===0?.12:(finale ?? .9)+.28
  return Math.max(0,Math.min(1,(end-seconds)/(style===0?.12:.28)))
}
