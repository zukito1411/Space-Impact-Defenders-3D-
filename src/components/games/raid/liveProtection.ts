import { Mesh, Vector3, type Object3D } from 'three'
import { RAID_FIGHTER_MAX_BANK, SHIELDED_FIGHTER_HULLS } from './fighterHulls'
import { loadHull } from './liveHullAssets'
import { blendProtection, PROTECTION_DEFAULT_BANK_RANGE, PROTECTION_POINTS, PROTECTION_STRIDE } from './liveProtectionGeometry'
import type { ProtectionContour } from './protectionGeometry'

export type LiveProtectionContours = { hull: ProtectionContour; field: ProtectionContour; shield: ProtectionContour }
type Entry = { frames: Float32Array; poses: number; bankRange: number; output: Float32Array; contours: LiveProtectionContours }
const entries = new Map<string,Entry>()
const pending = new Map<string,Promise<void>>()
const warming = new Set<string>()
let worker: Worker | null = null, serial = 0
const jobs = new Map<number,{ resolve(frames: Float32Array): void; reject(error: Error): void }>()
const smooth = (a: number,b: number,x: number) => { const t = Math.max(0,Math.min(1,(x-a)/(b-a))); return t*t*(3-2*t) }

/** Prepare small CPU contours from shared mesh buffers before mission launch. */
export function prepareLiveProtection(key: string, asset: { object: Object3D; registration: { registration: number[] } }) {
  if (entries.has(key)) return Promise.resolve()
  const existing = pending.get(key)
  if (existing) return existing
  const operation = (async () => {
    const mech = key === 'godGundam' || key === 'godGundamBurning' || key === 'spiegel'
    const positions: number[][] = Array.from({length:mech ? 4 : 1},()=>[])
    const indices: number[] = [], point = new Vector3()
    asset.object.updateMatrixWorld(true)
    asset.object.traverse(child => {
      if (!(child instanceof Mesh)) return
      const position = child.geometry.getAttribute('position'), index = child.geometry.index
      const offset = positions[0].length/3
      for (let pose = 0; pose < positions.length; pose++) for (let i = 0; i < position.count; i++) {
        const x = position.getX(i), y = position.getY(i), z = position.getZ(i)
        const leg = mech ? 1-smooth(-.08,.04,y) : 0
        const arm = mech ? smooth(.13,.28,Math.abs(x))*smooth(-.1,.04,y) : 0
        // Same vertex deformation as mechHullRig; includes attack and crouch.
        point.set(x-Math.sign(x)*arm*(pose&1)*.065,
          y+arm*(pose&1)*.12-y*.31*leg*Number(Boolean(pose&2)),
          z+arm*(pose&1)*.17+Math.abs(y)*.52*leg*Number(Boolean(pose&2))).applyMatrix4(child.matrixWorld)
        positions[pose].push(point.x,point.y,point.z)
      }
      for (let i = 0; i < (index?.count ?? position.count); i++) indices.push(offset+(index ? index.getX(i) : i))
    })
    if (!worker) {
      worker = new Worker(new URL('./liveProtection.worker.ts',import.meta.url),{type:'module'})
      worker.onmessage = (event: MessageEvent<{ id: number; frames: Float32Array }>) => {
        jobs.get(event.data.id)?.resolve(event.data.frames); jobs.delete(event.data.id)
      }
      worker.onerror = event => {
        for (const job of jobs.values()) job.reject(new Error(event.message))
        jobs.clear(); worker?.terminate(); worker = null
      }
    }
    const bankRange = SHIELDED_FIGHTER_HULLS.has(key) ? RAID_FIGHTER_MAX_BANK : PROTECTION_DEFAULT_BANK_RANGE
    const id = serial++, variants = positions.map(p=>new Float32Array(p)), triangles = new Uint32Array(indices)
    const frames = await new Promise<Float32Array>((resolve,reject) => {
      jobs.set(id,{resolve,reject})
      worker!.postMessage({id,variants,indices:triangles,registration:asset.registration.registration,bankRange},
        [...variants.map(v=>v.buffer),triangles.buffer])
    })
    const output = new Float32Array(PROTECTION_STRIDE), n = PROTECTION_POINTS*2
    if (entries.size >= 12 + SHIELDED_FIGHTER_HULLS.size) {
      for (const cached of entries.keys()) {
        if (SHIELDED_FIGHTER_HULLS.has(cached)) continue
        entries.delete(cached)
        break
      }
    }
    entries.set(key,{frames,poses:variants.length,bankRange,output,contours:{
      hull:{points:output.subarray(0,n),nose:0},field:{points:output.subarray(n,n*2),nose:0},
      shield:{points:output.subarray(n*2,n*3),nose:0},
    }})
  })().finally(()=>pending.delete(key))
  pending.set(key,operation)
  return operation
}

export function sampleLiveProtection(key: string, bank: number, landscape: boolean, attack = 0, crouch = 0) {
  key = key === 'mesiah' ? 'mesiahBlack' : key
  const entry = entries.get(key)
  if (!entry) {
    if (!warming.has(key)) {
      warming.add(key)
      void loadHull(key).then(asset=>prepareLiveProtection(key,asset))
        .catch(error=>console.warn('Ship protection preparation:',key,error)).finally(()=>warming.delete(key))
    }
    return undefined
  }
  blendProtection(entry.frames,entry.poses,bank,landscape,attack,crouch,entry.output,entry.bankRange)
  return entry.contours
}
