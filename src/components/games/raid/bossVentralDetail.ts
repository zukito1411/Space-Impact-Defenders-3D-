import { Float32BufferAttribute, LatheGeometry, Vector2, type BufferGeometry, type Mesh, type MeshStandardMaterial } from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { BOSS_KEEL_DESIGNS, sampleBossKeel } from './bossKeelDesigns'

/** Closed, recessed machinery housings merge into the original hull draw.
 * Every addition lies below Z=0 and beneath opaque original artwork. */
export function addBossVentralDetail(body:Mesh<BufferGeometry,MeshStandardMaterial>,stage:number,source:CanvasImageSource,width:number,height:number) {
  const design=BOSS_KEEL_DESIGNS[stage]
  if(!design)return
  const sample=document.createElement('canvas');sample.width=sample.height=128
  const context=sample.getContext('2d',{willReadFrequently:true})!
  context.drawImage(source,0,0,128,128)
  const pixels=context.getImageData(0,0,128,128).data
  const covered=(u:number,v:number)=>u>0&&u<1&&v>0&&v<1&&pixels[(Math.floor(v*128)*128+Math.floor(u*128))*4+3]>235
  const parts:BufferGeometry[]=[body.geometry],span=Math.max(width,height)
  for(const reactor of design.reactors) {
    const u=reactor.x/512,v=reactor.y/512,r=reactor.radius/512
    let fits=true
    for(let y=-4;y<=4;y++)for(let x=-4;x<=4;x++) {
      if(!covered(u+x*r/4,v+y*r/4))fits=false
    }
    if(!fits)continue
    const depth=.019
    const profile=[[0,0],[r*.76,0],[r*.95,.004],[r,.009],[r,depth*.78],
      [r*.81,depth],[r*.6,depth],[r*.6,depth*.47],[0,depth*.47]]
    const geometry=new LatheGeometry(profile.map(([radius,z])=>new Vector2(radius,z)),32)
    geometry.rotateX(-Math.PI/2)
    geometry.translate((u-.5)*width/span,(.5-v)*height/span,sampleBossKeel(design,u,v,1)+.003)
    const count=geometry.getAttribute('position').count,uv=geometry.getAttribute('uv')
    const colors=new Float32Array(count*3)
    for(let i=0;i<count;i++) {
      const interior=i%profile.length>=7,shade=interior?.085:i%profile.length===5?1:.72
      colors.set([shade,shade,shade],i*3)
      uv.setXY(i,u,1-v)
    }
    geometry.setAttribute('color',new Float32BufferAttribute(colors,3))
    geometry.setAttribute('hullWall',new Float32BufferAttribute(new Float32Array(count).fill(1),1))
    parts.push(geometry)
  }
  const metadata={...body.geometry.userData}
  const geometry=mergeGeometries(parts,false)
  if(!geometry)return
  for(const part of parts)part.dispose()
  body.geometry=geometry
  geometry.userData={...metadata,ventralDesign:design.name,ventralHousings:parts.length-1}
  geometry.computeBoundingSphere()
  // Existing deck normals are copied verbatim by mergeGeometries.
}
