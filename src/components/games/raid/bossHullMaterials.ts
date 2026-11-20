import { BOSS_KEEL_DESIGNS } from './bossKeelDesigns'
import { LinearMipmapLinearFilter, SRGBColorSpace, Texture, type MeshStandardMaterial } from 'three'
import { getPublicAssetUrl } from '../sound'
import { BOSS_ARMOR_ASSET_PATH } from './bossCatalog'
import { MOTHERSHIP_KEEL_ART } from './specialBossCatalog'

let armor: Texture | null = null
let pending: Promise<Texture> | null = null
let keel:Texture|null=null
let pendingKeel:Promise<Texture>|null=null
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

/** One shared underbelly painting, decoded in hull admission and uploaded
 * alongside the deck. No texture conversion or fetch occurs during combat. */
export function loadMothershipKeelTexture():Promise<Texture> {
  if(keel)return Promise.resolve(keel)
  if(pendingKeel)return pendingKeel
  pendingKeel=(async()=>{
    const image=new Image();image.src=getPublicAssetUrl(MOTHERSHIP_KEEL_ART)
    await image.decode()
    const texture=new Texture(image);texture.name='mothership-keel-v1'
    texture.colorSpace=SRGBColorSpace;texture.minFilter=LinearMipmapLinearFilter
    texture.generateMipmaps=true;texture.needsUpdate=true
    keel=texture
    return texture
  })().finally(()=>{pendingKeel=null})
  return pendingKeel
}

export function prepareBossArmor(material: MeshStandardMaterial) {
  const stage=Number(material.userData.bossHullStage)
  if (!stage || !armor) return null
  const lower=BOSS_KEEL_DESIGNS[stage]
  const organic=stage===5||stage===10
  const paint=organic?material.map:armor
  const rounded=stage===15&&keel!==null
  // Curved chitin flanks retain their species' paint; capital bulkheads use
  // the shared metal atlas. The golden final hull keeps warm bronze sides.
  const panel=organic ? stage===5 ? [.39,.65,.2,.19] : [.12,.47,.22,.18]
    : [7,8,12,14,15].includes(stage) ? [.51,.51,.48,.48] : [.01,.51,.48,.48]
  const previous=material.onBeforeCompile,previousKey=material.customProgramCacheKey()
  material.customProgramCacheKey=()=>previousKey+(rounded?':rounded-saucer-v1':lower?':ventral-armor-v2':':capital-paint-v1')
  material.onBeforeCompile=(shader,renderer)=>{
    previous.call(material,shader,renderer)
    shader.uniforms.bossArmorPanel={value:panel}
    shader.uniforms.bossArmorArt={value:paint}
    shader.uniforms.bossArmorTint={value:stage===15?[1,.72,.31]:[1,1,1]}
    if(rounded)shader.uniforms.bossKeelArt={value:keel}
    shader.vertexShader='varying vec3 bossSurface, bossNormal;\n'+shader.vertexShader
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`
      #include <begin_vertex>
      bossSurface=position;
      bossNormal=normal;
    `)
    shader.fragmentShader=(rounded?'uniform sampler2D bossKeelArt;\n':'')+'uniform vec4 bossArmorPanel;\nuniform vec3 bossArmorTint;\nuniform sampler2D bossArmorArt;\nvarying vec3 bossSurface, bossNormal;\n'+shader.fragmentShader
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`
      #include <map_fragment>
      vec3 armorNormal=normalize(bossNormal);
      // The lofted deck keeps its registered artwork even on steep plates.
      // A normal-based mask replaced eyes, scale patterns and golden decks
      // with repeated bulkhead paint. Only actual contour walls need it.
      float bossFlank=volumeWall;
      float bossUnderside=${lower?'1.-smoothstep(-.003,0.,bossSurface.z)':rounded?'1.-smoothstep(-.15,.05,armorNormal.z)':'0.'};
      if(bossFlank>0.) {
        float along=abs(armorNormal.x)>abs(armorNormal.y)?bossSurface.y:bossSurface.x;
        vec2 panelUv=bossArmorPanel.xy+fract(vec2(along*1.9+.5,bossSurface.z*3.5))*bossArmorPanel.zw;
        vec3 panelPaint=texture2D(bossArmorArt,panelUv).rgb;
        panelPaint*=bossArmorTint;
        ${rounded?'panelPaint=texture2D(bossKeelArt,bossSurface.xy+vec2(.5)).rgb;':''}
        diffuseColor.rgb=mix(diffuseColor.rgb,panelPaint,bossFlank);
      }
      ${rounded?'if(bossUnderside>0.)diffuseColor.rgb=mix(diffuseColor.rgb,texture2D(bossKeelArt,bossSurface.xy+vec2(.5)).rgb,bossUnderside);':''}
      ${lower?`
      if(bossUnderside>0.) {
        // The full-resolution shared atlas has separate machinery and armor
        // quadrants. World-space mapping gives the keel its own surface paint.
        vec3 weights=pow(abs(armorNormal),vec3(4.));weights/=max(.001,weights.x+weights.y+weights.z);
        vec2 lowerTile=vec2(.01,.01);
        vec2 lowerUv=bossSurface.xy*1.35+vec2(.5);
        vec3 skin=texture2D(bossArmorArt,lowerTile+fract(lowerUv)*.48).rgb*weights.z;
        skin+=texture2D(bossArmorArt,vec2(.01,.51)+fract(vec2(bossSurface.y*1.8+.5,-bossSurface.z*6.))*.48).rgb*weights.x;
        skin+=texture2D(bossArmorArt,vec2(.01,.51)+fract(vec2(bossSurface.x*1.8+.5,-bossSurface.z*6.))*.48).rgb*weights.y;
        skin*=vec3(${lower.warm?'1.10,.97,.84':'.91,1.,1.08'});
        #ifdef USE_COLOR
        skin*=vColor.rgb;
        #endif
        diffuseColor.rgb=mix(diffuseColor.rgb,skin,bossUnderside);
      }`:''}

      // The geometry already clips every opaque contour and interior opening.
      // Don't stretch a partially transparent edge texel over a solid bulkhead.
      diffuseColor.a=opacity;
    `)
    shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>',`
      #include <emissivemap_fragment>
      totalEmissiveRadiance*=1.-max(bossFlank,bossUnderside)*.95;
    `)
  }
  return rounded?[paint,keel]:[paint]
}
