import { Material, Mesh, MeshStandardMaterial, type Object3D, type Texture, type WebGLRenderer } from 'three'
import { prepareVolumeSurface } from './volumeSurface'
import { prepareBossArmor } from './bossHullMaterials'
import { rigMechHull } from './mechHullRig'

export const isMechHull = (key: string) => key === 'godGundam' || key === 'godGundamBurning' || key === 'spiegel'
export type HullSurfaceBinding = { material: MeshStandardMaterial; opacity: number; emissiveIntensity: number; sunVisibility: { value: number } }

/** Own material instances, sharing the original mesh buffers and paint. */
export function prepareHullSurfaces(object: Object3D, key: string, renderer: WebGLRenderer,
  preparedTextures: WeakSet<Texture>) {
  const owned: Material[] = [], bindings: HullSurfaceBinding[] = []
  object.traverse(child => {
    if (!(child instanceof Mesh)) return
    const copies = (Array.isArray(child.material) ? child.material : [child.material]).map(material => {
      const copy = material.clone()
      copy.alphaHash = true
      owned.push(copy)
      return copy
    })
    child.material = Array.isArray(child.material) ? copies : copies[0]
  })
  // Install the pose callback before wrapping it with the lighting callback.
  if (isMechHull(key)) rigMechHull(object)
  const anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy())
  for (const material of owned) {
    if (!(material instanceof MeshStandardMaterial)) continue
    material.roughness = Math.max(.46, Math.min(.64, material.roughness))
    material.metalness = Math.max(.14, Math.min(.32, material.metalness))
    material.envMapIntensity = .8
    // A low paint floor preserves the authored details on the night side.
    // Direct light and reflections still describe the hull's shape.
    if (material.map && material.emissiveMap === material.map) material.emissiveIntensity = isMechHull(key) ? .035 : .12
    prepareVolumeSurface(material)
    const bossArmor = prepareBossArmor(material)
    for (const texture of [material.map, material.emissiveMap, bossArmor]) {
      if (!texture || preparedTextures.has(texture)) continue
      if (texture.anisotropy !== anisotropy) { texture.anisotropy = anisotropy; texture.needsUpdate = true }
      renderer.initTexture(texture)
      preparedTextures.add(texture)
    }
    const sunVisibility = { value: 1 }, previousCompile = material.onBeforeCompile
    const baseKey = material.customProgramCacheKey()
    material.onBeforeCompile = (shader, context) => {
      previousCompile.call(material, shader, context)
      shader.uniforms.raidSunVisibility = sunVisibility
      shader.fragmentShader = 'uniform float raidSunVisibility;\n' + shader.fragmentShader
      shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_end>', `
        #include <lights_fragment_end>
        reflectedLight.directDiffuse *= raidSunVisibility;
        reflectedLight.directSpecular *= raidSunVisibility;
      `)
    }
    material.customProgramCacheKey = () => 'sid-hull-light-v1:' + baseKey
    bindings.push({ material, opacity: material.opacity, emissiveIntensity: material.emissiveIntensity, sunVisibility })
  }
  return { owned, bindings }
}
