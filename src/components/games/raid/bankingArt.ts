import { isRaid2DMech } from './mechArtwork'
import { liveHullsEnabled, sampleLiveHullPoints } from './liveHullBridge'
import { getPublicAssetUrl } from '../sound'
import anchors from './bankingAnchors.json'

export type BankingPoint = readonly [number,number]
type Outlet = readonly [number,number,number]
type Registration = {nozzles:Outlet[][];wing?:BankingPoint[][]}
const registrations=anchors as unknown as Readonly<Record<string,Registration>>
const keyFor=(key:string)=>key==='mesiah'?'mesiahBlack':key
export const PLAYER_HULL_KEYS=Object.keys(registrations)
export function raidBankingPreviewAngle(landscape:boolean){return landscape?90:0}
export function raidBankingPreviewNozzle(x:number,y:number,landscape:boolean){return landscape?{x:-y,y:x}:{x,y}}
/** UI-only renders of the actual models; never a gameplay-body fallback. */
export function getRaidPicker3DPreviewPath(shipKey:string,landscape:boolean){
  const key=keyFor(shipKey)
  if(isRaid2DMech(key)||!registrations[key])return null
  if (key === 'gatling' || key === 'gatlingElite') return `assets/ships/previews/${key}-${landscape?'landscape':'portrait'}-v11.webp`
  if (key === 'fast' || key === 'fastElite') return `assets/ships/previews/${key}-${landscape?'landscape':'portrait'}-v10.webp`
  if (key === 'xwing' || key === 'xwingElite') return `assets/ships/previews/${key}-${landscape?'landscape':'portrait'}-v9.webp`
  const version=landscape?7:5
  return `assets/ships/previews/${key}-${landscape?'landscape':'portrait'}-v${version}.webp`
}
export function getRaidPicker3DPreviewUrl(shipKey:string,landscape:boolean){
  const path=getRaidPicker3DPreviewPath(shipKey,landscape)
  return path?getPublicAssetUrl(path):null
}
export function raidBankingFrameIndex(bank:number,landscape:boolean,reduced:boolean,poses=21){
  const amount=reduced?0:Math.max(-1,Math.min(1,bank/.14))
  return (landscape?poses:0)+Math.round((poses-1)*.5*(1+amount))
}
export function getRaidBankingNozzles(shipKey:string,landscape:boolean){
  const data=registrations[keyFor(shipKey)]
  return data?.nozzles[raidBankingFrameIndex(0,landscape,false,data.nozzles.length/2)]??null
}
export type RaidBankingFrame={key:string;bank:number;landscape:boolean;nozzles:readonly Outlet[];wing?:readonly BankingPoint[]}
/** Registered mesh hardpoints only. There is no ship sprite or banking atlas. */
export function getRaidBankingFrame(shipKey:string,bank:number,landscape:boolean,reduced:boolean):RaidBankingFrame|null{
  if(!liveHullsEnabled())return null
  const key=keyFor(shipKey),actualBank=reduced?0:bank,points=sampleLiveHullPoints(key,actualBank,landscape)
  return points?{key,bank:actualBank,landscape,...points}:null
}
