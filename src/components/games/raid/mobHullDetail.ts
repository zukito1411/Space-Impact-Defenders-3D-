import { ExtrudeGeometry,Float32BufferAttribute,LatheGeometry,Shape,Vector2,type Mesh,type BufferGeometry,type MeshStandardMaterial } from 'three'
import { mergeGeometries,mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js'
import { MOB_HULL_DESIGNS,mobHullElevation,mobHullKeelElevation } from './mobHullDesigns'

type Coverage=(u:number,v:number)=>boolean
/** Closed hardware and anatomy merge into the actor's one instanced material. */
export function addMobHullDetail(body:Mesh<BufferGeometry,MeshStandardMaterial>,key:string,width:number,height:number,coverage?:Coverage) {
  const design=MOB_HULL_DESIGNS[key]
  if(!design)return
  body.material.userData.mobHullDesign=key
  let covered=coverage
  if(!covered&&typeof document!=='undefined'&&body.material.map?.image){
    const sample=document.createElement('canvas');sample.width=sample.height=96
    const context=sample.getContext('2d',{willReadFrequently:true})!
    context.drawImage(body.material.map.image as CanvasImageSource,0,0,96,96)
    const pixels=context.getImageData(0,0,96,96).data
    covered=(u,v)=>u>0&&u<1&&v>0&&v<1&&pixels[(Math.floor(v*96)*96+Math.floor(u*96))*4+3]>220
  }
  covered??=()=>true
  const parts:BufferGeometry[]=[body.geometry],span=Math.max(width,height),ax=width/span,ay=height/span
  const [wantedU,wantedV,prx,pry]=design.armorPaint??[.5,.4,.08,.08]
  let pu=wantedU,pv=wantedV
  if(!covered(pu,pv)){
    let nearest=Infinity
    for(let row=0;row<96;row++)for(let column=0;column<96;column++){
      const u=(column+.5)/96,v=(row+.5)/96,d=(u-wantedU)**2+(v-wantedV)**2
      if(d<nearest&&covered(u,v)){nearest=d;pu=u;pv=v}
    }
  }
  let lowerModules=0
  const finish=(geometry:BufferGeometry,centerX:number,centerY:number,rx:number,ry:number,lower:boolean,dark?:(index:number)=>boolean)=>{
    const position=geometry.getAttribute('position'),uv=geometry.getAttribute('uv'),count=position.count
    const colors=new Float32Array(count*3)
    for(let i=0;i<count;i++){
      const u=pu+(position.getX(i)-centerX)/Math.max(.001,rx)*prx*.65
      const v=pv-(position.getY(i)-centerY)/Math.max(.001,ry)*pry*.65
      const safe=covered!(u,v)?[u,v]:[pu,pv]
      uv.setXY(i,safe[0],1-safe[1])
      const shade=dark?.(i) ? .15 : .96
      colors.set([shade,shade,shade],i*3)
    }
    geometry.setAttribute('color',new Float32BufferAttribute(colors,3))
    geometry.setAttribute('hullWall',new Float32BufferAttribute(new Float32Array(count),1))
    geometry.setAttribute('hullVentral',new Float32BufferAttribute(new Float32Array(count).fill(lower?1:0),1))
    if(!geometry.index){const indexed=mergeVertices(geometry);geometry.dispose();geometry=indexed}
    parts.push(geometry)
  }
  for(const [u,v,length,r] of design.guns??[]){
    const points=[[0,0],[r*1.3,0],[r*1.3,length*.16],[r,length*.25],[r,length*.82],
      [r*1.13,length*.86],[r*1.13,length],[r*.66,length],[r*.66,length*.76],[0,length*.76]]
    const geometry=new LatheGeometry(points.map(([radius,y])=>new Vector2(radius,y)),20)
    const x=(u-.5)*ax,y=(.5-v)*ay
    geometry.rotateX(Math.PI);geometry.translate(x,y,mobHullElevation(design,u,v)+r*.55)
    finish(geometry,x,y,r,length,false,i=>i%points.length>=7)
  }
  for(const component of design.modules??[]){
    const {u,v,rx,ry,depth,kind}=component
    let fits=true
    for(let y=-2;y<=2;y++)for(let x=-2;x<=2;x++)if(!covered(u+x*rx*.92/2,v+y*ry*.92/2))fits=false
    if(!fits)continue
    const x=(u-.5)*ax,y=(.5-v)*ay,wx=rx*ax,wy=ry*ay
    const seat=mobHullKeelElevation(design,u,v,1)+.008
    if(kind==='plate'&&!design.organic){
      const shape=new Shape(),points=[[-wx*.68,-wy],[wx*.68,-wy],[wx,-wy*.55],[wx,wy*.55],
        [wx*.68,wy],[-wx*.68,wy],[-wx,wy*.55],[-wx,-wy*.55]]
      points.forEach(([px,py],i)=>i?shape.lineTo(px,py):shape.moveTo(px,py));shape.closePath()
      const geometry=new ExtrudeGeometry(shape,{depth,bevelEnabled:true,bevelSize:Math.min(wx,wy)*.12,
        bevelThickness:.0025,bevelSegments:1,steps:1,curveSegments:4})
      geometry.translate(x,y,seat-depth)
      finish(geometry,x,y,wx,wy,true)
    }else{
      const profile=kind==='reactor'
        ? [[0,0],[wx*.78,0],[wx,.004],[wx,depth*.74],[wx*.85,depth],[wx*.59,depth],[wx*.59,depth*.43],[0,depth*.43]]
        : [[0,0],[wx*.80,0],[wx,.005],[wx*.94,depth*.65],[wx*.65,depth],[0,depth]]
      const geometry=new LatheGeometry(profile.map(([r,z])=>new Vector2(r,z)),design.organic?20:24)
      geometry.rotateX(-Math.PI/2);geometry.scale(1,wy/wx,1);geometry.translate(x,y,seat)
      finish(geometry,x,y,wx,wy,true,i=>kind==='reactor'&&i%profile.length>=6)
    }
    lowerModules++
  }
  const metadata={...body.geometry.userData}
  if(parts.length>1){
    const geometry=mergeGeometries(parts,false)
    if(!geometry){for(const part of parts.slice(1))part.dispose();return}
    for(const part of parts)part.dispose()
    body.geometry=geometry
  }
  body.geometry.userData={...metadata,mobDesign:design.name,ventralModules:lowerModules}
  if (/^eliteHull[0-4]$/.test(key)) {
    // Tuck the complete underside, including its armor modules, toward the
    // deck. Keep the original upper hull, paint, footprint and vertex count.
    const position=body.geometry.getAttribute('position'),normal=body.geometry.getAttribute('normal')
    const originalNormals=new Float32Array(normal.array)
    for(let i=0;i<position.count;i++)if(position.getZ(i)<0)position.setZ(i,position.getZ(i)*.74)
    position.needsUpdate=true
    body.geometry.computeVertexNormals()
    for(let i=0;i<position.count;i++)if(position.getZ(i)>=0)
      normal.setXYZ(i,originalNormals[i*3],originalNormals[i*3+1],originalNormals[i*3+2])
    normal.needsUpdate=true
    body.geometry.computeBoundingBox()
  }
  body.geometry.computeBoundingSphere()
}

/** Preserve original paint on curved flanks and armor-only underside UVs. */
export function prepareMobHullSurface(material:MeshStandardMaterial) {
  const design=MOB_HULL_DESIGNS[material.userData.mobHullDesign]
  if(!design)return
  const prior=material.onBeforeCompile,key=material.customProgramCacheKey()
  material.customProgramCacheKey=()=>key+':mob-surface-v2'
  material.onBeforeCompile=(shader,renderer)=>{
    prior.call(material,shader,renderer)
    shader.uniforms.mobCanopy={value:design.canopy??[0,0,.001,.001]}
    shader.uniforms.mobOrganic={value:design.organic?1:0}
    shader.vertexShader='attribute float hullVentral;\nvarying float mobLower;\nvarying vec3 mobLocal;\n'+shader.vertexShader
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`
      #include <begin_vertex>
      mobLower=hullVentral;
      mobLocal=position;
    `)
    shader.fragmentShader='uniform vec4 mobCanopy;\nuniform float mobOrganic;\nvarying float mobLower;\nvarying vec3 mobLocal;\n'+shader.fragmentShader
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`
      #include <map_fragment>
      if(volumeWall>.5)diffuseColor.a=opacity;
      float ribs=pow(.5+.5*sin(mobLocal.y*185.+abs(mobLocal.x)*22.),14.);
      float panels=pow(.5+.5*sin((mobLocal.y+abs(mobLocal.x)*.35)*150.),22.);
      diffuseColor.rgb*=1.-mobLower*mix(panels*.14,ribs*.09,mobOrganic);
    `)
    shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',`
      #include <roughnessmap_fragment>
      vec2 cockpit=(vMapUv-vec2(mobCanopy.x,1.-mobCanopy.y))/mobCanopy.zw;
      float mobGlass=(1.-smoothstep(.65,1.,dot(cockpit,cockpit)))*(1.-volumeWall)*(1.-mobLower);
      roughnessFactor=mix(roughnessFactor,mix(.56,.62,mobOrganic),mobLower);
      roughnessFactor=mix(roughnessFactor,.28,mobGlass);
    `)
  }
}
