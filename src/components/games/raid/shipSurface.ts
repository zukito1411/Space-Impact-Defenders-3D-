import { bindCombatLighting, type CombatLightField } from './combatLighting'
import { ShaderChunk, Material, Mesh, MeshStandardMaterial, type Object3D, type Texture, type WebGLRenderer } from 'three'
import { prepareVolumeSurface } from './volumeSurface'
import { prepareBossArmor } from './bossHullMaterials'
import { rigMechHull } from './mechHullRig'
import { prepareOrganicRig } from './specialBossGeometry'
import { prepareMobHullSurface } from './mobHullDetail'

export const isMechHull = (key: string) => key === 'godGundam' || key === 'godGundamBurning' || key === 'spiegel'
export type HullSurfaceBinding = { material: MeshStandardMaterial; opacity: number; emissiveIntensity: number; sunVisibility: { value: number } }

/** Own material instances, sharing the original mesh buffers and paint. */
export function prepareHullSurfaces(object: Object3D, key: string, renderer: WebGLRenderer,
  preparedTextures: WeakSet<Texture>, combatLights?: CombatLightField) {
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
    prepareOrganicRig(material)
    prepareMobHullSurface(material)
    material.roughness = Math.max(.46, Math.min(.64, material.roughness))
    material.metalness = Math.max(.14, Math.min(.32, material.metalness))
    material.envMapIntensity = .8
    // A low paint floor preserves the authored details on the night side.
    // Direct light and reflections still describe the hull's shape.
    if (material.map && material.emissiveMap === material.map) material.emissiveIntensity = isMechHull(key) ? .035
      : material.userData.bossHullStage ? .065 : material.userData.bossOrganicLimb ? .025 : .035
    prepareVolumeSurface(material)
    const bossArmor = prepareBossArmor(material)
    for (const texture of [material.map, material.emissiveMap, ...(bossArmor??[])]) {
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
      shader.vertexShader = `attribute float raidOcclusion;
varying float raidCavity;
#ifdef USE_INSTANCING
attribute vec3 raidHullState;
varying vec3 raidCondition;
#endif
` + shader.vertexShader
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `
        #include <begin_vertex>
        raidCavity = raidOcclusion;
        #ifdef USE_INSTANCING
        raidCondition = raidHullState;
        #endif
      `)
      shader.fragmentShader = `uniform float raidSunVisibility;
varying float raidCavity;
#ifdef USE_INSTANCING
varying vec3 raidCondition;
#endif
` + shader.fragmentShader
      shader.fragmentShader = shader.fragmentShader.replace('#include <alphahash_pars_fragment>',
        ShaderChunk.alphahash_pars_fragment.replace('getAlphaHashThreshold( vec3 position )', 'getAlphaHashThreshold( vec3 position, float maxDeriv )')
          .replace(/float maxDeriv = max\([\s\S]*?\);/, ''))
      shader.fragmentShader = shader.fragmentShader.replace('#include <alphamap_fragment>', `
        #include <alphamap_fragment>
        #ifdef USE_INSTANCING
        diffuseColor.a *= raidCondition.x;
        #endif
      `).replace('vec3 totalEmissiveRadiance = emissive;', `
        vec3 totalEmissiveRadiance = emissive;
        #ifdef USE_INSTANCING
        totalEmissiveRadiance += vec3(raidCondition.z * .38);
        #endif
      `).replace('#include <alphahash_fragment>', `
        #ifdef USE_ALPHAHASH
        // Opaque pixels keep the exact same result without evaluating the
        // derivative/noise hash. Genuine fades and alpha edges still hash.
        float raidDeriv = max(length(dFdx(vPosition)),length(dFdy(vPosition)));
        if (diffuseColor.a < 1. && diffuseColor.a < getAlphaHashThreshold(vPosition,raidDeriv)) discard;
        #endif
      `)
      // Eclipse occludes the sun, while sky and planetary bounce remain.
      // The key is first in the directional-light list, including warmup.
      shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_begin>',
        ShaderChunk.lights_fragment_begin.replace('getDirectionalLightInfo( directionalLight, directLight );', `
          getDirectionalLightInfo( directionalLight, directLight );
          #if UNROLLED_LOOP_INDEX == 0
            #ifdef USE_INSTANCING
            directLight.color *= raidCondition.y;
            #else
            directLight.color *= raidSunVisibility;
            #endif
          #endif
        `))
      shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_end>', `
        #include <lights_fragment_end>
        reflectedLight.indirectDiffuse *= raidCavity;
        reflectedLight.indirectSpecular *= mix(.8, 1., raidCavity);
      `)
    }
    material.customProgramCacheKey = () => 'sid-hull-light-cavity-v1:' + baseKey
    if (combatLights) bindCombatLighting(material,combatLights)
    bindings.push({ material, opacity: material.opacity, emissiveIntensity: material.emissiveIntensity, sunVisibility })
  }
  return { owned, bindings }
}
