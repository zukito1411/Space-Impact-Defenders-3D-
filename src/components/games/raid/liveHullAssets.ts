import { Group, Mesh, MeshStandardMaterial, type Object3D } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { getPublicAssetUrl } from '../sound'
import { paintedVolume } from './paintedVolume'

export type HullRegistration = {
  registration: number[]
  nozzles: number[][]
  wing: number[][]
}
type HullAsset = { object: Group; registration: HullRegistration; references: number; lastUse: number }
const assets = new Map<string, HullAsset>()
const pending = new Map<string, Promise<HullAsset>>()
const loader = new GLTFLoader()
let manifest: Promise<Record<string, HullRegistration>> | null = null
const mechArt: Record<string, string> = {
  godGundam: 'god-gundam.png', godGundamBurning: 'god-gundam-burning.png', spiegel: 'spiegel.png',
}

let activeLoads = 0
const loadQueue: Array<() => void> = []
function admittedLoad<T>(work: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const start = () => {
      activeLoads++
      void work().then(resolve, reject).finally(() => {
        activeLoads--
        loadQueue.shift()?.()
      })
    }
    if (activeLoads < 2) start()
    else loadQueue.push(start)
  })
}

export function hullKey(key: string) { return key === 'mesiah' ? 'mesiahBlack' : key }

export function loadHull(key: string): Promise<HullAsset> {
  key = hullKey(key)
  const existing = assets.get(key)
  if (existing) { existing.lastUse = performance.now(); return Promise.resolve(existing) }
  const request = pending.get(key)
  if (request) return request
  const operation = admittedLoad(async () => {
    const object = new Group()
    let registration: HullRegistration
    if (mechArt[key]) {
      const image = new Image()
      image.src = getPublicAssetUrl('assets/ships/' + mechArt[key])
      await image.decode()
      const body = await paintedVolume(image, image.naturalWidth, image.naturalHeight)
      body.scale.setScalar(288)
      object.add(body)
      registration = { registration: [1.3, 1.3, 36, 36], nozzles: [[-12, -95, 0, 12], [12, -95, 0, 12]], wing: [] }
    } else {
      manifest ??= fetch(getPublicAssetUrl('assets/ships/models/v1/manifest.json')).then(response => {
        if (!response.ok) throw new Error('Live hull manifest unavailable')
        return response.json() as Promise<Record<string, HullRegistration>>
      }).catch(error => { manifest = null; throw error })
      const [gltf, registrations] = await Promise.all([
        loader.loadAsync(getPublicAssetUrl('assets/ships/models/v1/' + key + '.glb')), manifest,
      ])
      // glTF uses Y-up. Restore the authored flight X/Y plane and Z elevation.
      gltf.scene.rotation.x = Math.PI / 2
      object.add(gltf.scene)
      registration = registrations[key]
      if (!registration) throw new Error('Missing live hull registration for ' + key)
      object.traverse(child => {
        if (child instanceof Mesh && child.material instanceof MeshStandardMaterial) {
          child.material.emissive.setHex(0xffffff)
          child.material.emissiveMap = child.material.map
          child.material.emissiveIntensity = .18
        }
      })
    }
    const asset = { object, registration, references: 0, lastUse: performance.now() }
    assets.set(key, asset)
    return asset
  }).finally(() => pending.delete(key))
  pending.set(key, operation)
  return operation
}

export function acquireHull(key: string) {
  const asset = assets.get(hullKey(key))
  if (!asset) return null
  asset.references++
  asset.lastUse = performance.now()
  return { object: asset.object.clone(true), registration: asset.registration }
}

export function releaseHull(key: string, object: Object3D) {
  object.removeFromParent()
  const asset = assets.get(hullKey(key))
  if (asset) { asset.references = Math.max(0, asset.references - 1); asset.lastUse = performance.now() }
}

export function trimHullAssets() {
  if (assets.size <= 12) return
  const now = performance.now()
  let released = 0
  for (const [key, asset] of assets) {
    if (assets.size <= 12 || released >= 2) break
    if (asset.references || now - asset.lastUse < 6000) continue
    asset.object.traverse(child => {
      if (!(child instanceof Mesh)) return
      child.geometry.dispose()
      const materials = Array.isArray(child.material) ? child.material : [child.material]
      for (const material of materials) {
        if (material instanceof MeshStandardMaterial) material.map?.dispose()
        material.dispose()
      }
    })
    assets.delete(key)
    released++
  }
}

export function getHullRegistration(key: string) { return assets.get(hullKey(key))?.registration ?? null }
