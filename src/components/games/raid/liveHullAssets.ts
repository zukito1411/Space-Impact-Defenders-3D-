import { prepareHullLampAnchors } from './hullLampAnchors'
import { addBossVentralDetail } from './bossVentralDetail'
import { prepareHullOcclusion } from './hullOcclusion'
import { isRaid2DMech } from './mechArtwork'
import { Group, Mesh, MeshStandardMaterial, type Object3D } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { getPublicAssetUrl } from '../sound'
import { ENEMY_HULL_SPECS } from './enemyHulls'
import { getBossArmorTexture, loadBossArmorTexture, loadMothershipKeelTexture } from './bossHullMaterials'
import { buildBossWeapons } from './bossHullWeapons'
import { paintedVolume } from './paintedVolume'
import { prepareHullDocking, type HullDocking } from './hullDocking'
import { buildOrganicAppendages, connectSquidBody, specialBossBodySource, SERPENT_HEAD_ELEVATION } from './specialBossGeometry'
import { SERPENT_SKIN_ART, SQUID_SKIN_ART } from './specialBossCatalog'
import { addMobHullDetail } from './mobHullDetail'

export type HullRegistration = {
  registration: number[]
  nozzles: number[][]
  wing: number[][]
}
type HullAsset = { object: Group; registration: HullRegistration; docking?: HullDocking; references: number; lastUse: number }
const assets = new Map<string, HullAsset>()
const pending = new Map<string, Promise<HullAsset>>()
const loader = new GLTFLoader()
let manifest: Promise<Record<string, HullRegistration>> | null = null
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

export const CRUISE_HULL_KEYS = ['rockyFlyby', 'graceFlyby'] as const
export const isCruiseHull = (key: string) => key === CRUISE_HULL_KEYS[0] || key === CRUISE_HULL_KEYS[1]

export function hullKey(key: string) { return key === 'mesiah' ? 'mesiahBlack' : key }

export function loadHull(key: string): Promise<HullAsset> {
  key = hullKey(key)
  if (isRaid2DMech(key)) return Promise.reject(new Error(key + ' uses authored 2D artwork'))
  const existing = assets.get(key)
  if (existing) { existing.lastUse = performance.now(); return Promise.resolve(existing) }
  const request = pending.get(key)
  if (request) return request
  const cruise = isCruiseHull(key)
  const operation = admittedLoad(async () => {
    const object = new Group()
    let registration: HullRegistration
    const enemy = ENEMY_HULL_SPECS[key]
    if (enemy) {
      const image = new Image()
      image.src = getPublicAssetUrl(enemy.assetPath)
      await image.decode()
      const source=enemy.special ? specialBossBodySource(image,enemy.special) : image
      const body = await paintedVolume(source, image.naturalWidth, image.naturalHeight, enemy.resolution, enemy.profile, enemy.filter, enemy.bossStage,enemy.hullDesign)
      if(enemy.bossStage!==undefined)addBossVentralDetail(body,enemy.bossStage,source,image.naturalWidth,image.naturalHeight)
      if(enemy.hullDesign)addMobHullDetail(body,enemy.hullDesign,image.naturalWidth,image.naturalHeight)
      const assembly=new Group();assembly.scale.setScalar(288);object.add(assembly)
      if(enemy.special==='squid') {
        const skin=new Image();skin.src=getPublicAssetUrl(SQUID_SKIN_ART);await skin.decode()
        assembly.add(connectSquidBody(body,skin))
      } else assembly.add(body)
      if(enemy.special==='snake') {
        body.name='boss-organic-head-v1';body.userData.organicKind=enemy.special
        let skin=image
        if(enemy.special==='snake') {
          skin=new Image();skin.src=getPublicAssetUrl(SERPENT_SKIN_ART);await skin.decode()
          body.position.set(0,.12,SERPENT_HEAD_ELEVATION);body.scale.setScalar(.9)
        }
        assembly.add(buildOrganicAppendages(skin,enemy.special))
      }
      if(enemy.special==='final')await loadMothershipKeelTexture()
      if (enemy.bossStage !== undefined) {
        const weapons = buildBossWeapons(enemy.bossStage, await loadBossArmorTexture())
        if (weapons) assembly.add(weapons)
      }
      registration = { registration: [448/288,448/288,0,0], nozzles: [], wing: [] }
    } else {
      if (!cruise) manifest ??= fetch(getPublicAssetUrl('assets/ships/models/v1/manifest.json')).then(response => {
        if (!response.ok) throw new Error('Live hull manifest unavailable')
        return response.json() as Promise<Record<string, HullRegistration>>
      }).catch(error => { manifest = null; throw error })
      const folder = cruise ? 'assets/ships/scenery/' : 'assets/ships/models/v1/'
      const [gltf, registrations] = await Promise.all([
        loader.loadAsync(getPublicAssetUrl(folder + key + '.glb')), cruise ? null : manifest,
      ])
      // glTF uses Y-up. Restore the authored flight X/Y plane and Z elevation.
      gltf.scene.rotation.x = Math.PI / 2
      object.add(gltf.scene)
      const registered = cruise ? { registration: [448/288,448/288,0,0], nozzles: [], wing: [] } : registrations?.[key]
      if (!registered) throw new Error('Missing live hull registration for ' + key)
      registration = registered
      object.traverse(child => {
        if (child instanceof Mesh && child.material instanceof MeshStandardMaterial) {
          child.material.emissive.setHex(0xffffff)
          child.material.emissiveMap = child.material.map
          child.material.emissiveIntensity = .18
        }
      })
    }
    if (!cruise) prepareHullLampAnchors(object,key)
    await prepareHullOcclusion(object)
    const docking = enemy || cruise ? undefined : prepareHullDocking(object,key,registration)
    const asset = { object, registration, docking, references: 0, lastUse: performance.now() }
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
  if (assets.size <= 40) return
  const now = performance.now()
  let released = 0
  for (const [key, asset] of assets) {
    if (assets.size <= 40 || released >= 2) break
    if (asset.references || now - asset.lastUse < 6000) continue
    asset.object.traverse(child => {
      if (!(child instanceof Mesh)) return
      child.geometry.dispose()
      const materials = Array.isArray(child.material) ? child.material : [child.material]
      for (const material of materials) {
        if (material instanceof MeshStandardMaterial && material.map !== getBossArmorTexture()) material.map?.dispose()
        material.dispose()
      }
    })
    assets.delete(key)
    released++
  }
}

export function getHullRegistration(key: string) { return assets.get(hullKey(key))?.registration ?? null }

export function getHullDocking(key: string) { return assets.get(hullKey(key))?.docking }
