import { MULTIPLAYER_INPUT_INTERVAL_MS, MULTIPLAYER_MAX_BUFFERED_BYTES, MULTIPLAYER_STATE_INTERVAL_MS } from './constants'
import type { MultiplayerInput, Vec } from './types'

type InputAck = {seq:number;x:number;y:number}
const bounded=(n:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,n))

/** Per-session transport timing. No changes to combat authority or rendering quality. */
export class CoopLink {
  private configured=false
  private sessionKey=''
  private local=false
  private lastArrival=0
  private lastSource=0
  private offset=Infinity
  private timeline=0
  private cursor=0
  private interval=50
  private jitter=0
  private delay=85
  private packetBytes=0
  private peerRtt:number|null=null
  private pingAt=0
  private pingId=0
  private pingSent=0
  private inputSeq=0
  private acknowledged=0
  private receivedInput=0
  private readonly history=Array.from({length:64},()=>({seq:0,x:0,y:0}))
  sourceStepMs=50

  configure(local:boolean,sessionKey:string){
    if(this.configured && this.local===local && this.sessionKey===sessionKey)return false
    this.configured=true;this.sessionKey=sessionKey;this.local=local
    this.lastArrival=0;this.lastSource=0;this.offset=Infinity;this.timeline=0;this.cursor=0
    this.interval=local?33:MULTIPLAYER_STATE_INTERVAL_MS;this.jitter=0;this.delay=local?45:85
    this.peerRtt=null;this.pingAt=0;this.pingId=0;this.pingSent=0;this.packetBytes=0
    this.inputSeq=0;this.acknowledged=0;this.receivedInput=0
    for(const entry of this.history)entry.seq=0
    return true
  }
  get rtt(){return this.peerRtt}
  get stateInterval(){return this.local && this.packetBytes<20000?33:MULTIPLAYER_STATE_INTERVAL_MS}
  recordPacket(bytes:number){this.packetBytes=bytes}
  get inputInterval(){return this.local?25:MULTIPLAYER_INPUT_INTERVAL_MS}
  get canQueueBytes(){return MULTIPLAYER_MAX_BUFFERED_BYTES*(this.local?.5:.75)}

  observeState(sentAt:number|undefined,arrival:number){
    const source=Number.isFinite(sentAt)?sentAt!:arrival
    if(this.lastArrival && arrival-this.lastArrival<2500){
      const step=bounded(source-this.lastSource,8,500)
      this.sourceStepMs=step
      this.interval+=.15*(step-this.interval)
      this.jitter+=.15*(Math.abs((arrival-this.lastArrival)-step)-this.jitter)
    }
    const sample=arrival-source
    if(!this.lastArrival || arrival-this.lastArrival>2500)this.offset=sample
    else this.offset=Math.min(this.offset+.025,sample)
    this.timeline=Math.min(arrival,Math.max(this.timeline+.01,source+this.offset))
    this.lastArrival=arrival;this.lastSource=source
    const target=bounded(this.interval*1.2+this.jitter*2+(this.peerRtt ?? 0)*.04,this.local?35:55,180)
    this.delay+=(target-this.delay)*(target>this.delay?.3:.035)
    return this.timeline
  }

  renderAt(now:number){this.cursor=Math.max(this.cursor,now-this.delay);return this.cursor}

  ping(now:number){
    if(now-this.pingAt<1800 || this.pingSent && now-this.pingSent<5000)return null
    this.pingAt=now;this.pingSent=now
    return {type:'link-ping',id:++this.pingId}
  }
  pong(id:unknown,now:number){
    if(id!==this.pingId || !this.pingSent)return
    const elapsed=bounded(now-this.pingSent,1,5000)
    this.peerRtt=this.peerRtt===null?elapsed:this.peerRtt*.75+elapsed*.25
    this.pingSent=0
  }

  remember(position:Vec|null){
    const seq=++this.inputSeq,slot=this.history[seq%this.history.length]
    slot.seq=position?seq:0;slot.x=position?.x ?? 0;slot.y=position?.y ?? 0
    return seq
  }
  acceptInput(seq:number|undefined){
    if(seq===undefined)return true // Older LAN clients remain compatible.
    if(!Number.isSafeInteger(seq) || seq<=this.receivedInput)return false
    this.receivedInput=seq;return true
  }
  correction(ack:InputAck){
    if(!Number.isSafeInteger(ack.seq) || ack.seq<=this.acknowledged || !Number.isFinite(ack.x) || !Number.isFinite(ack.y))return null
    this.acknowledged=ack.seq
    const slot=this.history[ack.seq%this.history.length]
    return slot.seq===ack.seq?{x:ack.x-slot.x,y:ack.y-slot.y}:null
  }
}

/** Public rooms can receive arbitrary input; accept only bounded movement data. */
export function readCoopInput(value:unknown):MultiplayerInput|null {
  if(!value || typeof value!=='object')return null
  const v=value as Partial<MultiplayerInput>
  if(!Array.isArray(v.keys) || !Number.isFinite(v.at) || !Number.isFinite(v.nuke))return null
  const point=(p:Vec|null|undefined)=>p && Number.isFinite(p.x) && Number.isFinite(p.y)
    ?{x:bounded(p.x,0,100),y:bounded(p.y,0,100)}:null
  return {target:point(v.target),pointer:point(v.pointer),position:point(v.position),
    keys:v.keys.slice(0,16).filter((key):key is string=>typeof key==='string' && key.length<=16),
    nuke:bounded(Math.trunc(v.nuke!),0,1e9),at:v.at!,shipSizeScale:v.shipSizeScale,
    seq:Number.isSafeInteger(v.seq)?v.seq:undefined}
}
