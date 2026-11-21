import { Box3, BufferAttribute, BufferGeometry, DoubleSide, DynamicDrawUsage, Group, InstancedBufferAttribute,
  InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, Vector3, type Object3D } from 'three'
import { bindCombatLighting, type CombatLightField } from './combatLighting'

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
      const materials=(input as MeshStandardMaterial[]).map(source=>{
        const material=source.clone()
        material.side=DoubleSide;material.alphaHash=true;material.transparent=false
        material.onBeforeCompile=shader=>{
          shader.vertexShader=`attribute vec3 raidBreakPivot;attribute vec4 raidBreakMotion,raidBreakSpin,raidDeathState;
varying vec4 raidDeath;
vec3 raidTurn(vec3 p,vec3 axis,float a){float c=cos(a),s=sin(a);return p*c+cross(axis,p)*s+axis*dot(axis,p)*(1.-c);}
`+shader.vertexShader
          shader.vertexShader=shader.vertexShader.replace('#include <beginnormal_vertex>',`
            #include <beginnormal_vertex>
            raidDeath=raidDeathState;
            float raidAge=max(0.,raidDeath.x-raidBreakMotion.w*raidDeath.w);
            float raidAngle=raidAge*raidBreakSpin.w*(.85+fract(raidDeath.y*.618)*.3);
            vec3 raidAxis=normalize(raidBreakSpin.xyz);
            objectNormal=raidTurn(objectNormal,raidAxis,raidAngle);
            #ifdef USE_TANGENT
              objectTangent=raidTurn(objectTangent,raidAxis,raidAngle);
            #endif
          `).replace('#include <begin_vertex>',`
            #include <begin_vertex>
            transformed=raidBreakPivot+raidTurn(transformed-raidBreakPivot,raidAxis,raidAngle)+raidBreakMotion.xyz*raidAge;
          `)
          shader.fragmentShader='varying vec4 raidDeath;\n'+shader.fragmentShader
          shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`
            #include <color_fragment>
            diffuseColor.rgb*=mix(1.,.28,smoothstep(.04,.85,raidDeath.x));
            if(!gl_FrontFacing) diffuseColor.rgb*=.15;
            diffuseColor.a*=raidDeath.z;
          `).replace('vec3 totalEmissiveRadiance = emissive;',`
            float raidHeat=exp(-max(0.,raidDeath.x-.12)*3.)*.22;
            vec3 totalEmissiveRadiance=emissive+vec3(1.,.15,.025)*raidHeat;
          `)
        }
        material.customProgramCacheKey=()=> 'sid-rigid-hull-breakup-v1'
        bindCombatLighting(material,lights)
        return material
      })
      const mesh=new InstancedMesh(geometry,Array.isArray(child.material)?materials:materials[0],CAPACITY)
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);mesh.frustumCulled=false;mesh.count=0;mesh.visible=false
      this.meshes.push(mesh);this.root.add(mesh)
    })
  }
  reset(){this.count=0;for(const mesh of this.meshes){mesh.visible=false;mesh.count=0}}
  add(matrix:Matrix4,age:number,seed:number,alpha:number,tempo=1) {
    if(this.count>=CAPACITY)return false
    const index=this.count++
    this.state.setXYZW(index,age,seed,alpha,tempo)
    for(const mesh of this.meshes){mesh.setMatrixAt(index,matrix);mesh.visible=true;mesh.count=this.count}
    return this.meshes.length>0
  }
  present(){
    if(!this.count)return
    this.state.clearUpdateRanges();this.state.addUpdateRange(0,this.count*4);this.state.needsUpdate=true
    for(const mesh of this.meshes){mesh.instanceMatrix.clearUpdateRanges();mesh.instanceMatrix.addUpdateRange(0,this.count*16);mesh.instanceMatrix.needsUpdate=true}
  }
  destroy(){
    this.root.removeFromParent()
    for(const mesh of this.meshes){mesh.geometry.dispose();for(const m of Array.isArray(mesh.material)?mesh.material:[mesh.material])m.dispose();mesh.dispose()}
    this.root.clear();this.meshes.length=0
  }
}
