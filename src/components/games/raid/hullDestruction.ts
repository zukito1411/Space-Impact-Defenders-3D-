import { Box3, BufferAttribute, BufferGeometry, DoubleSide, DynamicDrawUsage, Group, InstancedBufferAttribute,
  InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, Vector3, type Object3D } from 'three'
import { bindCombatLighting, type CombatLightField } from './combatLighting'
import type { DestructionStyle } from './destructionProfile'

const CAPACITY=12
/** Split by structural stations, duplicating only seam vertices. Every piece
 * retains its original position, normals, UVs and paint; no fragment sprites. */
function fractureGeometry(source: BufferGeometry, box: Box3) {
  const span=new Vector3();box.getSize(span)
  const position=source.getAttribute('position'), indices=source.index
  const count=indices?.count ?? position.count, mapping=new Map<number,number>()
  const originals:number[]=[], parts:number[]=[], output:number[]=[]
  const centers=Array.from({length:6},()=>new Vector3()), weights=new Uint32Array(6)
  for(let triangle=0;triangle<count;triangle+=3) {
    const ids=[0,1,2].map(j=>indices?indices.getX(triangle+j):triangle+j)
    const x=ids.reduce((sum,i)=>sum+position.getX(i),0)/3
    const y=ids.reduce((sum,i)=>sum+position.getY(i),0)/3
    const part=Math.min(2,Math.max(0,Math.floor((y-box.min.y)/Math.max(.001,span.y)*3)))*2+Number(x>(box.min.x+box.max.x)/2)
    for(const original of ids) {
      const key=original*6+part
      let index=mapping.get(key)
      if(index===undefined) {
        index=originals.length;mapping.set(key,index);originals.push(original);parts.push(part)
        centers[part].add(new Vector3(position.getX(original),position.getY(original),position.getZ(original)));weights[part]++
      }
      output.push(index)
    }
  }
  for(let i=0;i<6;i++) centers[i].divideScalar(Math.max(1,weights[i]))
  const geometry=new BufferGeometry()
  for(const [name,attribute] of Object.entries(source.attributes)) {
    const data=new Float32Array(originals.length*attribute.itemSize)
    for(let i=0;i<originals.length;i++) for(let c=0;c<attribute.itemSize;c++) data[i*attribute.itemSize+c]=attribute.getComponent(originals[i],c)
    geometry.setAttribute(name,new BufferAttribute(data,attribute.itemSize))
  }
  geometry.setIndex(output)
  for(const group of source.groups) geometry.addGroup(group.start,group.count,group.materialIndex)
  const pivot=new Float32Array(originals.length*3),motion=new Float32Array(originals.length*4),spin=new Float32Array(originals.length*4)
  const extent=Math.max(span.x,span.y,span.z,.01),center=new Vector3();box.getCenter(center)
  for(let i=0;i<originals.length;i++) {
    const part=parts[i],p=centers[part],side=part%2?1:-1,row=Math.floor(part/2)
    pivot.set([p.x,p.y,p.z],i*3)
    motion.set([side*extent*(.17+row*.035),(row-1)*extent*.17,extent*(part%3-1)*.15,row===1?.38:.09+row*.06],i*4)
    spin.set([.38+part*.11,side*.73,.24-row*.2,side*(.65+part*.17)],i*4)
  }
  geometry.setAttribute('raidBreakPivot',new BufferAttribute(pivot,3))
  geometry.setAttribute('raidBreakMotion',new BufferAttribute(motion,4))
  geometry.setAttribute('raidBreakSpin',new BufferAttribute(spin,4))
  return geometry
}

/** One instanced draw per original material, with rigid 3D chunk motion in the
 * vertex shader. Prepared beside the source hull, bounded to twelve deaths. */
export class HullDestructionBatch {
  readonly root=new Group()
  private readonly state=new InstancedBufferAttribute(new Float32Array(CAPACITY*4),4).setUsage(DynamicDrawUsage)
  private readonly mode=new InstancedBufferAttribute(new Float32Array(CAPACITY*4),4).setUsage(DynamicDrawUsage)
  private readonly meshes: InstancedMesh<BufferGeometry,MeshStandardMaterial|MeshStandardMaterial[]>[]=[]
  private count=0
  constructor(object:Object3D,lights:CombatLightField) {
    object.updateWorldMatrix(true,true)
    const bounds=new Box3().setFromObject(object)
    object.traverse(child=>{
      if(!(child instanceof Mesh)) return
      const input=Array.isArray(child.material)?child.material:[child.material]
      if(input.some(m=>!(m instanceof MeshStandardMaterial))) return
      const baked=child.geometry.clone().applyMatrix4(child.matrixWorld)
      const geometry=fractureGeometry(baked,bounds);baked.dispose()
      geometry.setAttribute('raidDeathState',this.state)
      geometry.setAttribute('raidDeathMode',this.mode)
      const materials=(input as MeshStandardMaterial[]).map(source=>{
        const material=source.clone()
        material.side=DoubleSide;material.alphaHash=true;material.transparent=false
        material.onBeforeCompile=shader=>{
          shader.uniforms.raidHullCenter={value:bounds.getCenter(new Vector3())}
          shader.uniforms.raidHullExtent={value:bounds.getSize(new Vector3()).length()}
          shader.vertexShader=`attribute vec3 raidBreakPivot;attribute vec4 raidBreakMotion,raidBreakSpin,raidDeathState,raidDeathMode;
uniform vec3 raidHullCenter;uniform float raidHullExtent;
varying vec4 raidDeath;varying vec2 raidFailure;
vec3 raidTurn(vec3 p,vec3 axis,float a){float c=cos(a),s=sin(a);return p*c+cross(axis,p)*s+axis*dot(axis,p)*(1.-c);}
`+shader.vertexShader
          shader.vertexShader=shader.vertexShader.replace('#include <beginnormal_vertex>',`
            #include <beginnormal_vertex>
            raidDeath=raidDeathState;raidFailure=raidDeathMode.xy;
            float raidStyle=raidDeathMode.x;
            float raidRow=raidBreakMotion.w>.3?1.:(raidBreakMotion.w>.15?2.:0.);
            float raidPart=raidRow*2.+step(0.,raidBreakMotion.x);
            float raidNoise=fract(sin((raidPart+1.)*12.9898+raidDeath.y*.73)*43758.5453);
            float raidOrder=mod(raidPart+floor(raidDeath.y),6.);
            float raidDelay=raidBreakMotion.w*raidDeath.w;
            if(raidStyle==1.)raidDelay=raidNoise*.13;
            if(raidStyle==3.)raidDelay=raidOrder*raidDeathMode.y/6.;
            if(raidStyle==4.)raidDelay=raidDeathMode.y+raidNoise*.11;
            float raidAge=max(0.,raidDeath.x-raidDelay);
            if(raidStyle==2.)raidAge=abs(raidPart-mod(floor(raidDeath.y),6.))<.1?max(0.,raidDeath.x-.06):0.;
            if(raidStyle==5.)raidAge=max(0.,raidDeath.x-.12);
            float raidAngle=raidAge*raidBreakSpin.w*(.65+raidNoise*.9);
            vec3 raidAxis=normalize(raidBreakSpin.xyz+vec3(raidNoise*.3));
            vec3 raidPivot=raidBreakPivot;
            vec3 raidVelocity=raidBreakMotion.xyz*(.7+raidNoise*.9);
            if(raidStyle==1. || raidStyle==4.){
              raidVelocity=raidTurn(raidVelocity,vec3(0.,0.,1.),(fract(raidDeath.y*.381)-.5)*2.1);
              raidVelocity*=raidStyle==4.?2.15:1.45;
            }
            if(raidStyle==5.){
              float raidSide=sign(raidBreakMotion.x);
              raidPivot=raidHullCenter+vec3(raidSide*raidHullExtent*.08,0.,0.);
              raidVelocity=vec3(raidSide*raidHullExtent*.16,raidHullExtent*.025,raidSide*raidHullExtent*.055);
              raidAxis=normalize(vec3(.2,1.,.15));raidAngle=raidSide*raidAge*.65;
            }
            objectNormal=raidTurn(objectNormal,raidAxis,raidAngle);
            #ifdef USE_TANGENT
              objectTangent=raidTurn(objectTangent,raidAxis,raidAngle);
            #endif
          `).replace('#include <begin_vertex>',`
            #include <begin_vertex>
            transformed=raidPivot+raidTurn(transformed-raidPivot,raidAxis,raidAngle)+raidVelocity*raidAge;
          `)
          shader.fragmentShader='varying vec4 raidDeath;varying vec2 raidFailure;\n'+shader.fragmentShader
          shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`
            #include <color_fragment>
            diffuseColor.rgb*=mix(1.,.28,smoothstep(.04,.85,raidDeath.x));
            if(!gl_FrontFacing) diffuseColor.rgb*=.15;
            diffuseColor.a*=raidDeath.z;
          `).replace('vec3 totalEmissiveRadiance = emissive;',`
            float raidHeat=exp(-max(0.,raidDeath.x-.12)*3.)*.22;
            if(raidFailure.x==4.)raidHeat=pow(min(1.,raidDeath.x/max(.1,raidFailure.y)),3.)*exp(-max(0.,raidDeath.x-raidFailure.y)*4.)*.7;
            vec3 totalEmissiveRadiance=emissive+vec3(1.,.15,.025)*raidHeat;
          `)
        }
        material.customProgramCacheKey=()=> 'sid-rigid-hull-breakup-v2'
        bindCombatLighting(material,lights)
        return material
      })
      const mesh=new InstancedMesh(geometry,Array.isArray(child.material)?materials:materials[0],CAPACITY)
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);mesh.frustumCulled=false;mesh.count=0;mesh.visible=false
      this.meshes.push(mesh);this.root.add(mesh)
    })
  }
  reset(){this.count=0;for(const mesh of this.meshes){mesh.visible=false;mesh.count=0}}
  add(matrix:Matrix4,age:number,seed:number,alpha:number,tempo=1,style:DestructionStyle=1,finale=.12) {
    if(this.count>=CAPACITY)return false
    const index=this.count++
    this.state.setXYZW(index,age,seed,alpha,tempo)
    this.mode.setXYZW(index,style,finale,0,0)
    for(const mesh of this.meshes){mesh.setMatrixAt(index,matrix);mesh.visible=true;mesh.count=this.count}
    return this.meshes.length>0
  }
  present(){
    if(!this.count)return
    this.state.clearUpdateRanges();this.state.addUpdateRange(0,this.count*4);this.state.needsUpdate=true
    this.mode.clearUpdateRanges();this.mode.addUpdateRange(0,this.count*4);this.mode.needsUpdate=true
    for(const mesh of this.meshes){mesh.instanceMatrix.clearUpdateRanges();mesh.instanceMatrix.addUpdateRange(0,this.count*16);mesh.instanceMatrix.needsUpdate=true}
  }
  destroy(){
    this.root.removeFromParent()
    for(const mesh of this.meshes){mesh.geometry.dispose();for(const m of Array.isArray(mesh.material)?mesh.material:[mesh.material])m.dispose();mesh.dispose()}
    this.root.clear();this.meshes.length=0
  }
}
