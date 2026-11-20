import { LinearMipmapLinearFilter, SRGBColorSpace, Texture, type MeshStandardMaterial } from 'three'
import { getPublicAssetUrl } from '../sound'
import { BOSS_ARMOR_ASSET_PATH } from './bossCatalog'

let armor: Texture | null = null
let pending: Promise<Texture> | null = null
export function getBossArmorTexture() { return armor }
/** One shared generated atlas. Decode, mipmaps and GPU upload happen during
 * the existing enemy-admission warmup, never when a boss enters combat. */
export function loadBossArmorTexture(): Promise<Texture> {
  if (armor) return Promise.resolve(armor)
  if (pending) return pending
  pending=(async()=>{
    const image=new Image()
    image.src=getPublicAssetUrl(BOSS_ARMOR_ASSET_PATH)
    await image.decode()
    const texture=new Texture(image)
    texture.name='capital-armor-atlas-v1'
    texture.colorSpace=SRGBColorSpace
    texture.minFilter=LinearMipmapLinearFilter
    texture.generateMipmaps=true
    texture.needsUpdate=true
    armor=texture
    return texture
  })().finally(()=>{pending=null})
  return pending
}

export function prepareBossArmor(material: MeshStandardMaterial) {
  const stage=Number(material.userData.bossHullStage)
  if (!stage || !armor) return null
  const panel=[7,8,12,14].includes(stage) ? [.51,.51,.48,.48] : [.01,.51,.48,.48]
  const previous=material.onBeforeCompile
  material.onBeforeCompile=(shader,renderer)=>{
    previous.call(material,shader,renderer)
    shader.uniforms.bossArmorPanel={value:panel}
    shader.uniforms.bossArmorArt={value:armor}
    shader.vertexShader='varying vec3 bossSurface, bossNormal;\n'+shader.vertexShader
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`
      #include <begin_vertex>
      bossSurface=position;
      bossNormal=normal;
    `)
    shader.fragmentShader='uniform vec4 bossArmorPanel;\nuniform sampler2D bossArmorArt;\nvarying vec3 bossSurface, bossNormal;\n'+shader.fragmentShader
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`
      #include <map_fragment>
      vec3 armorNormal=normalize(bossNormal);
      float bossFlank=smoothstep(.28,.75,1.-abs(armorNormal.z));
      if(bossFlank>0.) {
        float along=abs(armorNormal.x)>abs(armorNormal.y)?bossSurface.y:bossSurface.x;
        vec2 panelUv=bossArmorPanel.xy+fract(vec2(along*1.9+.5,bossSurface.z*3.5))*bossArmorPanel.zw;
        vec3 panelPaint=texture2D(bossArmorArt,panelUv).rgb;
        diffuseColor.rgb=mix(diffuseColor.rgb,panelPaint,bossFlank);
      }
      // The geometry already clips every opaque contour and interior opening.
      // Don't stretch a partially transparent edge texel over a solid bulkhead.
      diffuseColor.a=opacity;
    `)
    shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>',`
      #include <emissivemap_fragment>
      totalEmissiveRadiance*=1.-bossFlank*.95;
    `)
  }
  return armor
}
