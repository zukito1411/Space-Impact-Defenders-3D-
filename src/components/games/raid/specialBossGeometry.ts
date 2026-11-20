import { BufferGeometry, Float32BufferAttribute, Mesh, MeshStandardMaterial, Sphere, Vector3,
  SRGBColorSpace, Texture, LinearMipmapLinearFilter, RepeatWrapping, type Object3D } from 'three'
import type { SpecialBossKind } from './specialBossCatalog'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

/** Admission-only separation of mantle from the painted tentacles. The original
 * contour still clips the crown/fins; the animated mesh owns all lower limbs. */
export function specialBossBodySource(image: HTMLImageElement, kind: SpecialBossKind) {
  const canvas=document.createElement('canvas')
  canvas.width=image.naturalWidth;canvas.height=image.naturalHeight
  const ctx=canvas.getContext('2d',{willReadFrequently:true})!
  ctx.drawImage(image,0,0)
  if(kind==='squid') {
    const data=ctx.getImageData(0,0,canvas.width,canvas.height)
    for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++) {
      const u=x/canvas.width,v=y/canvas.height
      const limit=.515+.22*Math.max(0,1-Math.abs(u-.5)/.16)
      if(v>limit)data.data[(y*canvas.width+x)*4+3]=0
    }
    ctx.putImageData(data,0,0)
  } else if(kind==='snake') {
    // The old pointed painted tip is replaced by the round, continuous neck.
    ctx.clearRect(0,canvas.height*.83,canvas.width,canvas.height*.17)
  }
  return canvas
}

function skinTexture(image: HTMLImageElement, kind: 'squid'|'snake') {
  const texture=new Texture(image);texture.colorSpace=SRGBColorSpace
  texture.name=kind+'-skin-v1';texture.wrapS=texture.wrapT=RepeatWrapping
  texture.generateMipmaps=true;texture.minFilter=LinearMipmapLinearFilter;texture.needsUpdate=true
  return texture
}

// A cobra's expanded hood joins a round neck above broad muscular coils.
// The same cubic control points generate GPU deformation and admission UVs.
export const SERPENT_BODY_PATH = [
  [[.42,-.62,-.015],[.12,-.82,-.015],[-.48,-.70,.015],[-.26,-.55,.025]],
  [[-.26,-.55,.025],[-.04,-.40,.045],[.48,-.48,.015],[.24,-.33,.025]],
  [[.24,-.33,.025],[.12,-.25,.035],[0,-.27,.035],[0,-.08,.035]],
] as const
// The hood is physically above its coils, including the extended bite pose.
// Its lower shell meets the lifted neck while the face clears the tube surface.
export const SERPENT_HEAD_ELEVATION = .28
export const SQUID_ROOTS=Array.from({length:8},(_,n)=>{
  const pair=Math.floor(n/2),side=n%2?1:-1
  return [side*(.11-pair*.027),-.022*pair,.065] as const
})
const serpentBreaks=[0,.4,.73,1]
export function sampleSerpentBody(p:number) {
  const segment=p<.4?0:p<.73?1:2
  const t=(p-serpentBreaks[segment])/(serpentBreaks[segment+1]-serpentBreaks[segment]),q=1-t
  const points=SERPENT_BODY_PATH[segment]
  return [0,1,2].map(axis=>q*q*q*points[0][axis]+3*q*q*t*points[1][axis]
    +3*q*t*t*points[2][axis]+t*t*t*points[3][axis])
}

/** Immutable tube buffers. Eight squid limbs share one draw; the snake uses
 * one continuous 88-ring body. No per-frame tessellation or CPU buffer upload. */
export function buildOrganicAppendages(image: HTMLImageElement, kind: 'squid'|'snake') {
  const limbs=kind==='squid'?8:1, rings=kind==='squid'?64:88, sides=24
  const positions:number[]=[],uv:number[]=[],limb:number[]=[],indices:number[]=[]
  const distances=[0]
  if(kind==='snake')for(let ring=1;ring<=rings;ring++) {
    const a=sampleSerpentBody((ring-1)/rings),b=sampleSerpentBody(ring/rings)
    distances.push(distances[ring-1]+Math.hypot(...b.map((value,i)=>value-a[i])))
  }
  for(let n=0;n<limbs;n++)for(let ring=0;ring<=rings;ring++)for(let side=0;side<=sides;side++) {
    const p=ring/rings,a=side/sides*Math.PI*2
    positions.push(Math.cos(a)*.04,-p,Math.sin(a)*.04)
    limb.push(n,p,Math.cos(a),Math.sin(a))
    // Arc-length mapping keeps scale size consistent through tight curves;
    // the dedicated skin tiles instead of stretching one hood over the body.
    uv.push(side/sides*(kind==='snake'?2:1),kind==='snake'?distances[ring]/.43:p*2.2)
    if(ring<rings&&side<sides) {
      const i=(n*(rings+1)+ring)*(sides+1)+side,j=i+sides+1
      indices.push(i,i+1,j,j,i+1,j+1)
    }
  }
  const geometry=new BufferGeometry()
  geometry.setAttribute('position',new Float32BufferAttribute(positions,3))
  geometry.setAttribute('uv',new Float32BufferAttribute(uv,2))
  geometry.setAttribute('bossLimb',new Float32BufferAttribute(limb,4));geometry.setIndex(indices)
  geometry.computeVertexNormals()
  // GPU deformation can extend to a charged attack target. Do not cull using
  // the neutral buffer's bounds or mutate simulation visibility.
  geometry.boundingSphere=new Sphere(new Vector3(),6)
  const map=skinTexture(image,kind)
  const material=new MeshStandardMaterial({map,roughness:kind==='snake'?.56:.5,metalness:kind==='snake'?.08:.16})
  material.userData.bossOrganicLimb=kind
  material.emissive.setHex(0xffffff);material.emissiveMap=map;material.emissiveIntensity=.025
  const mesh=new Mesh(geometry,material);mesh.name='boss-organic-appendages-v1';mesh.frustumCulled=false
  return mesh
}

/** One connected indexed squid: each arm's root fan joins a mantle vertex
 * inside the tissue. Two paint groups preserve full-resolution mantle/skin
 * without extra draws or alpha-plane attachments. All roots stay fixed on GPU. */
export function connectSquidBody(body:Mesh<BufferGeometry,MeshStandardMaterial>,skin:HTMLImageElement) {
  const arms=buildOrganicAppendages(skin,'squid'),base=body.geometry
  const baseCount=base.getAttribute('position').count
  const fixed=new Float32Array(baseCount*4)
  for(let i=0;i<baseCount;i++)fixed[i*4]=-1
  base.setAttribute('bossLimb',new Float32BufferAttribute(fixed,4))
  const armCount=arms.geometry.getAttribute('position').count
  arms.geometry.setAttribute('color',new Float32BufferAttribute(new Float32Array(armCount*3).fill(1),3))
  arms.geometry.setAttribute('hullWall',new Float32BufferAttribute(new Float32Array(armCount),1))
  const geometry=mergeGeometries([base,arms.geometry],true)!
  const indices=Array.from(geometry.index!.array),positions=base.getAttribute('position')
  const anchors:number[]=[]
  for(let n=0;n<8;n++) {
    const root=SQUID_ROOTS[n]
    let anchor=0,distance=Infinity
    for(let i=0;i<baseCount;i++) {
      if(positions.getZ(i)<=0)continue
      const d=(positions.getX(i)-root[0])**2+(positions.getY(i)-root[1])**2+(positions.getZ(i)-root[2])**2
      if(d<distance){distance=d;anchor=i}
    }
    anchors.push(anchor)
    const ring=baseCount+n*65*25
    for(let side=0;side<24;side++)indices.push(anchor,ring+side,ring+side+1)
  }
  geometry.setIndex(indices)
  geometry.groups[1].count=indices.length-geometry.groups[1].start
  geometry.boundingSphere=new Sphere(new Vector3(),6)
  body.material.userData.bossOrganicLimb='squid'
  const mesh=new Mesh(geometry,[body.material,arms.material]);mesh.name='boss-organic-squid-v1'
  mesh.userData.squidAnchors=anchors;mesh.userData.mantleVertices=baseCount;mesh.frustumCulled=false
  base.dispose();arms.geometry.dispose()
  return mesh
}

const squidCurve=`
  float side=mod(n,2.)<.5?-1.:1.;
  float pair=floor(n*.5),phase=.8+n*.47;
  vec2 base=vec2(side*(.11-pair*.027),-.022*pair);
  vec2 tip=vec2(side*(.50-pair*.135),pair<.5?.13:-(.25+pair*.17));
  tip.x+=sin(uBossTime*2.1+phase)*.04*uBossMotion;
  vec2 c1=base+vec2(side*.16,-.18),c2=tip+vec2(-side*.14,.12);
  if(pair<.5)c2.y=tip.y-.16;
  bool strike=uBossAttack>.001&&((uBossTarget.x<0.&&n<.5)||(uBossTarget.x>=0.&&n>.5&&n<1.5));
  if(strike) {
    tip=mix(tip,uBossTarget.xy,uBossAttack);
    c1=mix(c1,base+vec2(side*.42,-.18),uBossAttack);
    c2=mix(c2,tip+vec2(-side*.2,.16),uBossAttack);
  }
  float q=1.-p;
  vec2 xy=q*q*q*base+3.*q*q*p*c1+3.*q*p*p*c2+p*p*p*tip;
  float anchored=sin(p*3.141593)*uBossMotion;
  xy.x+=side*sin(p*7.5-uBossTime*2.6+phase)*anchored*(.085+pair*.006);
  xy.y+=cos(p*8.2-uBossTime*2.3+phase)*anchored*.025;
  return vec3(xy,.065+sin(p*3.141593)*(.025+sin(uBossTime+phase)*.012*uBossMotion));
`
const glslPoint=(point:readonly number[])=>`vec3(${point.map(value=>value.toFixed(5)).join(',')})`
const snakeRest=SERPENT_BODY_PATH.map((points,i)=>`
  ${i===0?'if':i===1?'else if':'else'} ${i<2?`(p<${serpentBreaks[i+1]})`:''} {
    float t=(p-${serpentBreaks[i].toFixed(5)})/${(serpentBreaks[i+1]-serpentBreaks[i]).toFixed(5)},q=1.-t;
    rest=q*q*q*${glslPoint(points[0])}+3.*q*q*t*${glslPoint(points[1])}
      +3.*q*t*t*${glslPoint(points[2])}+t*t*t*${glslPoint(points[3])};
  }`).join('\n')
const snakeCurve=`
  vec3 rest;
  ${snakeRest}
  if(uBossAttack>.001) {
    float t=clamp((p-.4)/.6,0.,1.),q=1.-t;
    vec3 end=vec3(uBossTarget.xy,0.)+vec3(0.,-.08,.035);
    vec3 start=${glslPoint(SERPENT_BODY_PATH[1][0])},c1=start+vec3(.22,.15,.02);
    vec3 c2=end+vec3(.12,-.24,.025);
    vec3 bite=q*q*q*start+3.*q*q*t*c1+3.*q*t*t*c2+t*t*t*end;
    rest=mix(rest,bite,uBossAttack*smoothstep(.4,.53,p));
  }
  // A broad travelling wave follows the current body tangent, so bends travel
  // from the neck toward the tail instead of merely breathing in place.
  float envelope=pow(max(0.,sin(p*3.141593)),.8)*(1.-smoothstep(.82,1.,p));
  float wave=(sin(p*11.2+uBossTime*3.2)+.28*sin(p*20.4+uBossTime*4.4));
  float strength=envelope*uBossMotion*(1.-uBossAttack*.72);
  rest+=vec3(wave*.070*strength,cos(p*10.2+uBossTime*3.2)*.026*strength,wave*.012*strength);
  rest.z+=.10*smoothstep(.72,1.,p);
  return rest;
`

/** Material instances own their uniforms; immutable geometry and paint are
 * shared by pooled bosses/mirages. Lighting sees the deformed surface normals. */
export function prepareOrganicRig(material: MeshStandardMaterial) {
  const kind=material.userData.bossOrganicLimb
  if(kind!=='squid'&&kind!=='snake')return
  const time={value:0},attack={value:0},target={value:new Vector3(0,-1,0)},motion={value:1}
  material.userData.bossPose={time,attack,target,motion,owner:''}
  const prior=material.onBeforeCompile
  material.onBeforeCompile=(shader,renderer)=>{
    prior.call(material,shader,renderer)
    Object.assign(shader.uniforms,{uBossTime:time,uBossAttack:attack,uBossTarget:target,uBossMotion:motion})
    shader.vertexShader=`
      attribute vec4 bossLimb;
      uniform float uBossTime,uBossAttack,uBossMotion;
      uniform vec3 uBossTarget;
      vec3 bossCurve(float n,float p) { ${kind==='squid'?squidCurve:snakeCurve} }
      float bossRadius(float n,float p) {
        float base=${kind==='squid'?'.007+(.036-floor(n*.5)*.003)*pow(max(0.,1.-p),.72)':'.004+.080*smoothstep(0.,.38,p)*(1.-.12*smoothstep(.75,1.,p))'};
        float rib=${kind==='squid'?'1.+.075*pow(.5+.5*cos(p*138.23),8.)':'1.'};
        float cap=${kind==='squid'?'1.-smoothstep(.988,1.,p)':'smoothstep(0.,.012,p)'};
        return base*rib*max(.04,cap);
      }
    `+shader.vertexShader
    shader.vertexShader=shader.vertexShader.replace('#include <beginnormal_vertex>',`
      float limbT=bossLimb.y;
      vec3 center=position,crossAxis=vec3(1.,0.,0.),depthAxis=vec3(0.,0.,1.);
      vec3 objectNormal=normal;
      if(bossLimb.x>=0.) {
        center=bossCurve(bossLimb.x,limbT);
        vec3 tangent=normalize(bossCurve(bossLimb.x,min(1.,limbT+.002))-bossCurve(bossLimb.x,max(0.,limbT-.002)));
        crossAxis=normalize(vec3(-tangent.y,tangent.x,0.));
        depthAxis=normalize(cross(tangent,crossAxis));
        objectNormal=normalize(crossAxis*bossLimb.z+depthAxis*bossLimb.w);
      }
    `)
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`
      #include <begin_vertex>
      if(bossLimb.x>=0.)transformed=center+(crossAxis*bossLimb.z+depthAxis*bossLimb.w)*bossRadius(bossLimb.x,limbT);
    `)
  }
  material.customProgramCacheKey=()=>`raid-organic-rig-v1:${kind}`
}

export type OrganicBossPose={seconds:number;attack:number;targetX:number;targetY:number;motion:number}
export function poseOrganicBoss(object:Object3D,pose:OrganicBossPose,identity='') {
  object.traverse(child=>{
    if(!(child instanceof Mesh))return
    for(const material of Array.isArray(child.material)?child.material:[child.material]) {
      const uniforms=material.userData.bossPose
      if(!uniforms)continue
      const elapsed=pose.seconds-uniforms.time.value
      const recovering=material.userData.bossOrganicLimb==='squid'&&uniforms.owner===identity&&elapsed>0&&elapsed<.5
      uniforms.attack.value=recovering?Math.max(pose.attack,uniforms.attack.value-elapsed/.32):pose.attack
      uniforms.owner=identity
      uniforms.time.value=pose.seconds
      uniforms.target.value.set(pose.targetX,pose.targetY,0);uniforms.motion.value=pose.motion
    }
    if(child.name==='boss-organic-head-v1'&&child.userData.organicKind==='snake') {
      // Body endpoint and head move together during a bite, including retraction.
      child.position.set(pose.targetX*pose.attack,.12+(pose.targetY-.1)*pose.attack,SERPENT_HEAD_ELEVATION)
      child.scale.setScalar(.9*(1-pose.attack*.18))
    }
  })
}
