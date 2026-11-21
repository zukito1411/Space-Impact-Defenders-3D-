import {AdditiveBlending,BufferGeometry,DynamicDrawUsage,Float32BufferAttribute,Points,Scene,
 ShaderMaterial,Vector3,type Camera,type Object3D,type WebGLRenderer,type WebGLRenderTarget} from 'three'
import type {HullLampBinding} from './hullLampAnchors'
export const HULL_LAMP_CAPACITY=512
/** One tiny, depth-tested point batch for the entire live fleet. No point
 * lights, textures, bloom targets, geometry rebuilds or frame allocations. */
export class HullLampBatch{
 readonly geometry=new BufferGeometry()
 readonly material=new ShaderMaterial({transparent:true,depthWrite:false,depthTest:true,blending:AdditiveBlending,toneMapped:false,
  uniforms:{lampHeight:{value:1}},
  vertexShader:`attribute vec4 lampColor;attribute float lampSize;varying vec4 glow;
   uniform float lampHeight;void main(){vec4 view=modelViewMatrix*vec4(position,1.);
    gl_Position=projectionMatrix*view;gl_PointSize=clamp(lampSize*lampHeight*projectionMatrix[1][1]/max(1.,-2.*view.z),1.,32.);
    glow=lampColor;}`,
  fragmentShader:`varying vec4 glow;void main(){float radius=length(gl_PointCoord-vec2(.5))*2.;
   if(radius>=1.)discard;float lens=1.-smoothstep(.12,.58,radius);
   float halo=(1.-radius)*(1.-radius)*.16;
   gl_FragColor=vec4(glow.rgb,glow.a*(lens*.68+halo));
   #include <colorspace_fragment>
  }`,
 })
 readonly points=new Points(this.geometry,this.material)
 private readonly positions=new Float32BufferAttribute(new Float32Array(HULL_LAMP_CAPACITY*3),3).setUsage(DynamicDrawUsage)
 private readonly colors=new Float32BufferAttribute(new Float32Array(HULL_LAMP_CAPACITY*4),4).setUsage(DynamicDrawUsage)
 private readonly sizes=new Float32BufferAttribute(new Float32Array(HULL_LAMP_CAPACITY),1).setUsage(DynamicDrawUsage)
 private readonly attributes=[this.positions,this.colors,this.sizes]
 private readonly ranges=this.attributes.map(()=>({start:0,count:0}))
 private readonly point=new Vector3()
 private readonly pulse=new Float32Array(3)
 count=0
 constructor(){
  this.geometry.setAttribute('position',this.positions);this.geometry.setAttribute('lampColor',this.colors);this.geometry.setAttribute('lampSize',this.sizes)
  this.geometry.setDrawRange(0,0);this.points.frustumCulled=false;this.points.renderOrder=20;this.points.visible=false
 }
 begin(seconds:number,height:number,dpr:number,reduced:boolean){
  this.clear();this.material.uniforms.lampHeight.value=height*dpr
  for(let i=0;i<2;i++){
   const crest=Math.max(0,Math.cos(seconds*Math.PI*2/2.8+i*Math.PI*.8))
   this.pulse[i]=reduced ? .5 :.22+.78*crest*crest*crest*crest
  }
  this.pulse[2]=reduced ? .85 :.86+.14*Math.cos(seconds*Math.PI*2/4.8)
 }
 add(object:Object3D,bindings:readonly HullLampBinding[],size:number,opacity:number){
  if(!bindings.length||opacity<.03||this.count>=HULL_LAMP_CAPACITY)return
  object.updateWorldMatrix(true,true)
  for(const binding of bindings)for(const site of binding.sites){
   if(this.count>=HULL_LAMP_CAPACITY)return
   this.point.set(site.point[0],site.point[1],site.point[2]).applyMatrix4(binding.mesh.matrixWorld)
   const spec=site.spec,core=spec.channel===2,diameter=Math.max(core?2.6:1.7,Math.min(core?10:3.5,size*spec.size))
   this.positions.setXYZ(this.count,this.point.x,this.point.y,this.point.z)
   this.sizes.setX(this.count,diameter)
   this.colors.setXYZW(this.count,site.rgb[0],site.rgb[1],site.rgb[2],opacity*spec.strength*this.pulse[spec.channel])
   this.count++
  }
 }
 clear(){this.count=0;this.points.visible=false;this.geometry.setDrawRange(0,0)}
 present(){
  this.geometry.setDrawRange(0,this.count);this.points.visible=this.count>0
  if(!this.count)return
  for(let i=0;i<this.attributes.length;i++){
   const attribute=this.attributes[i],range=this.ranges[i]
   range.start=0;range.count=this.count*attribute.itemSize
   attribute.clearUpdateRanges();attribute.updateRanges.push(range);attribute.needsUpdate=true
  }
 }
 async prepare(renderer:WebGLRenderer,camera:Camera,target:WebGLRenderTarget){
  const parent=this.points.parent,scene=new Scene(),previous=renderer.getRenderTarget()
  scene.add(this.points);this.points.visible=true;this.geometry.setDrawRange(0,1)
  try{await renderer.compileAsync(scene,camera);renderer.setRenderTarget(target);renderer.render(scene,camera)}
  finally{renderer.setRenderTarget(previous);this.points.removeFromParent();parent?.add(this.points);this.points.visible=false;this.geometry.setDrawRange(0,0)}
 }
 destroy(){this.points.removeFromParent();this.geometry.dispose();this.material.dispose()}
}
