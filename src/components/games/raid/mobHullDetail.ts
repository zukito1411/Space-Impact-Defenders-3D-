import { Float32BufferAttribute,LatheGeometry,Vector2,type Mesh,type BufferGeometry,type MeshStandardMaterial } from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { MOB_HULL_DESIGNS,mobHullElevation } from './mobHullDesigns'

/** Physical jackets and recessed bores merge into the actor's existing draw. */
export function addMobHullDetail(body:Mesh<BufferGeometry,MeshStandardMaterial>,key:string,width:number,height:number) {
  const design=MOB_HULL_DESIGNS[key]
  if(!design)return
  body.material.userData.mobHullDesign=key
  if(!design.guns?.length)return
  const parts:BufferGeometry[]=[body.geometry],scale=Math.max(width,height)
  for(const [u,v,length,r] of design.guns) {
    const points=[[0,0],[r*1.3,0],[r*1.3,length*.16],[r,length*.25],[r,length*.82],
      [r*1.13,length*.86],[r*1.13,length],[r*.66,length],[r*.66,length*.76],[0,length*.76]]
    const geometry=new LatheGeometry(points.map(([radius,y])=>new Vector2(radius,y)),20)
    geometry.rotateX(Math.PI)
    geometry.translate((u-.5)*width/scale,(.5-v)*height/scale,mobHullElevation(design,u,v)+r*.55)
    const count=geometry.getAttribute('position').count,uv=geometry.getAttribute('uv')
    const colors=new Float32Array(count*3)
    for(let i=0;i<count;i++) {
      const shade=i%points.length>=7?.075:.65
      colors.set([shade,shade,shade],i*3);uv.setXY(i,.5,.5)
    }
    geometry.setAttribute('color',new Float32BufferAttribute(colors,3))
    geometry.setAttribute('hullWall',new Float32BufferAttribute(new Float32Array(count),1))
    parts.push(geometry)
  }
  body.geometry=mergeGeometries(parts,false)!
  for(const part of parts)part.dispose()
  body.geometry.computeBoundingSphere()
}

/** Colored flanks sample opaque armor, preserving species paint at the edge.
 * Mechanical cockpits get restrained glass response in their authored region. */
export function prepareMobHullSurface(material:MeshStandardMaterial) {
  const design=MOB_HULL_DESIGNS[material.userData.mobHullDesign]
  if(!design)return
  const prior=material.onBeforeCompile,key=material.customProgramCacheKey()
  material.customProgramCacheKey=()=>key+':mob-surface-v1'
  material.onBeforeCompile=(shader,renderer)=>{
    prior.call(material,shader,renderer)
    shader.uniforms.mobSidePaint={value:design.organic?[.5,.7]:[.5,.5]}
    shader.uniforms.mobCanopy={value:design.canopy??[0,0,.001,.001]}
    shader.fragmentShader='uniform vec2 mobSidePaint;\nuniform vec4 mobCanopy;\n'+shader.fragmentShader
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`
      #include <map_fragment>
      if(volumeWall>.5) {
        diffuseColor.rgb=texture2D(map,mobSidePaint).rgb;
        diffuseColor.a=opacity;
      }
    `)
    shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',`
      #include <roughnessmap_fragment>
      vec2 cockpit=(vMapUv-vec2(mobCanopy.x,1.-mobCanopy.y))/mobCanopy.zw;
      float mobGlass=(1.-smoothstep(.65,1.,dot(cockpit,cockpit)))*(1.-volumeWall);
      roughnessFactor=mix(roughnessFactor,.28,mobGlass);
    `)
  }
}
