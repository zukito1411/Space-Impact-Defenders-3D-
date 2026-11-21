import assert from 'node:assert/strict'
import {readFileSync,readdirSync} from 'node:fs'
import ts from 'typescript'
import {BufferGeometry,BufferAttribute,Mesh,MeshStandardMaterial,Group,Matrix4} from 'three'
const compile=source=>'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64')
const designs=compile(readFileSync('src/components/games/raid/hullLampDesigns.ts','utf8'))
const anchors=compile(readFileSync('src/components/games/raid/hullLampAnchors.ts','utf8').replace("'three'",JSON.stringify(import.meta.resolve('three'))).replace("'./hullLampDesigns'",JSON.stringify(designs)))
const {getHullLampDesign}=await import(designs)
const {prepareHullLampAnchors,bindHullLamps}=await import(anchors)
const {HullLampBatch,HULL_LAMP_CAPACITY}=await import(compile(readFileSync('src/components/games/raid/hullLampBatch.ts','utf8').replace("'three'",JSON.stringify(import.meta.resolve('three')))))
const assets='public/assets/ships/models/v1/'
const results=[]
for(const file of readdirSync(assets).filter(file=>file.endsWith('.glb'))){
 const key=file.slice(0,-4),raw=readFileSync(assets+file),length=raw.readUInt32LE(12),json=JSON.parse(raw.subarray(20,20+length).toString())
 const binary=raw.subarray(28+length)
 function accessor(index){
  const a=json.accessors[index],view=json.bufferViews[a.bufferView]
  const constructors={5126:Float32Array,5125:Uint32Array,5123:Uint16Array,5121:Uint8Array},sizes={SCALAR:1,VEC2:2,VEC3:3,VEC4:4}
  const Type=constructors[a.componentType],size=sizes[a.type],out=new Type(a.count*size)
  const start=(view.byteOffset??0)+(a.byteOffset??0),stride=view.byteStride??size*Type.BYTES_PER_ELEMENT
  for(let i=0;i<a.count;i++)for(let c=0;c<size;c++)out[i*size+c]=new Type(binary.buffer,binary.byteOffset+start+i*stride+c*Type.BYTES_PER_ELEMENT,1)[0]
  return new BufferAttribute(out,size)
 }
 const object=new Group(),scene=new Group();scene.rotation.x=Math.PI/2;object.add(scene)
 for(const node of json.nodes)if(node.mesh!==undefined){
  const primitive=json.meshes[node.mesh].primitives[0],geometry=new BufferGeometry()
  geometry.setAttribute('position',accessor(primitive.attributes.POSITION));geometry.setIndex(accessor(primitive.indices))
  const mesh=new Mesh(geometry,new MeshStandardMaterial())
  if(node.matrix){mesh.applyMatrix4(new Matrix4().fromArray(node.matrix))}
  else{if(node.translation)mesh.position.fromArray(node.translation);if(node.rotation)mesh.quaternion.fromArray(node.rotation);if(node.scale)mesh.scale.fromArray(node.scale)}
  scene.add(mesh)
 }
 prepareHullLampAnchors(object,key)
 const bindings=bindHullLamps(object),count=bindings.reduce((n,b)=>n+b.sites.length,0)
 results.push({key,count})
 assert.ok(count>=2,'Navigation lamps missed actual hull: '+key)
 for(const binding of bindings)for(const site of binding.sites)assert.ok(site.point.every(Number.isFinite))
 object.traverse(child=>{child.geometry?.dispose();child.material?.dispose()})
}
assert.deepEqual(getHullLampDesign('devil'),[])
assert.deepEqual(getHullLampDesign('alienHull0'),[])
assert.deepEqual(getHullLampDesign('eliteHull0'),[])
for(const key of ['commandHull1','commandHull2','commandHull3','commandHull4','commandHull6','commandHull7','commandHull8','commandHull9','commandHull11','commandHull12','commandHull13','commandHull14','abyssSquidHull','serpentGuardianHull','mirageMothershipHull']){
 assert.ok(getHullLampDesign(key).length>=3&&getHullLampDesign(key).length<=9)
}
const batch=new HullLampBatch(),buffers=Object.values(batch.geometry.attributes).map(a=>a.array)
const object=new Group(),mesh=new Mesh();object.add(mesh)
const bindings=[{mesh,sites:[{point:[0,0,0],rgb:[1,.3,.1],spec:getHullLampDesign('rocket')[0]}]}]
batch.begin(0,390,2,false)
for(let i=0;i<HULL_LAMP_CAPACITY+20;i++)batch.add(object,bindings,80,1)
batch.present();assert.equal(batch.count,HULL_LAMP_CAPACITY);assert.equal(batch.geometry.drawRange.count,HULL_LAMP_CAPACITY)
assert.ok(batch.points.visible);assert.equal(batch.material.depthTest,true);assert.equal(batch.material.depthWrite,false)
batch.begin(1,390,2,true);batch.add(object,bindings,80,.5);batch.present()
Object.values(batch.geometry.attributes).forEach((a,i)=>assert.equal(a.array,buffers[i],'reallocated a frame buffer'))
batch.clear();batch.present();assert.equal(batch.count,0);assert.equal(batch.points.visible,false)
batch.destroy()
console.log(JSON.stringify(results))
console.log('Lamp coverage: all 24 shipped player hulls, all 15 boss designs, Devil exclusion, shared bounded buffers and teardown passed')
