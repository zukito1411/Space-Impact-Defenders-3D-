import { uploadInstanceRange } from './threeInstanceUpload'
import {
  AdditiveBlending, Color, DynamicDrawUsage, InstancedBufferAttribute, InstancedMesh,
  Object3D, PlaneGeometry, ShaderMaterial, SRGBColorSpace, Texture,
} from 'three'
import type { Group } from 'three'
import type { Texture as ArtFrame, TextureSource } from 'pixi.js'

type Batch = {
  mesh: InstancedMesh<PlaneGeometry, ShaderMaterial>
  rectangles: InstancedBufferAttribute
  colors: InstancedBufferAttribute
  count: number
}
const vertexShader = `
attribute vec4 atlasRect, effectColor;
varying vec2 artUV;
varying vec4 tint;
void main(){
 artUV=atlasRect.xy+uv*atlasRect.zw;
 tint=effectColor;
 gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);
}`
const fragmentShader = `
uniform sampler2D art;
varying vec2 artUV;
varying vec4 tint;
void main(){
 vec4 pigment=texture2D(art,artUV);
 gl_FragColor=vec4(pigment.rgb*tint.rgb,pigment.a*tint.a);
 #include <colorspace_fragment>
}`

/** Leighneron-style instanced atlas batching for emissive effects inside the 3D scene. */
export class ThreeFx {
  private readonly batches = new Map<TextureSource, Batch>()
  private readonly pose = new Object3D()
  private readonly color = new Color()
  constructor(private readonly root: Group) {}

  begin() { for (const batch of this.batches.values()) batch.count = 0 }

  draw(frame: ArtFrame | undefined, x: number, y: number, width: number, height: number,
    angle = 0, alpha = 1, color: number | string = 0xffffff) {
    if (!frame || alpha <= .001) return
    let batch = this.batches.get(frame.source)
    if (!batch) {
      const image = frame.source.resource
      if (!(image instanceof HTMLImageElement || image instanceof HTMLCanvasElement || image instanceof ImageBitmap)) return
      const map = new Texture(image)
      map.colorSpace = SRGBColorSpace
      map.needsUpdate = true
      const geometry = new PlaneGeometry(1, 1)
      const rectangles = new InstancedBufferAttribute(new Float32Array(2048*4), 4).setUsage(DynamicDrawUsage)
      const colors = new InstancedBufferAttribute(new Float32Array(2048*4), 4).setUsage(DynamicDrawUsage)
      geometry.setAttribute('atlasRect', rectangles)
      geometry.setAttribute('effectColor', colors)
      const material = new ShaderMaterial({ vertexShader, fragmentShader,
        uniforms: { art: { value: map } }, transparent: true, depthWrite: false, blending: AdditiveBlending })
      const mesh = new InstancedMesh(geometry, material, 2048)
      mesh.instanceMatrix.setUsage(DynamicDrawUsage)
      mesh.frustumCulled = false
      mesh.count = 0
      this.root.add(mesh)
      batch = { mesh, rectangles, colors, count: 0 }
      this.batches.set(frame.source, batch)
    }
    if (batch.count >= 2048) return
    const i = batch.count++
    const bounds = frame.frame, source = frame.source
    batch.rectangles.setXYZW(i, bounds.x/source.width, 1-(bounds.y+bounds.height)/source.height,
      bounds.width/source.width, bounds.height/source.height)
    this.color.set(color)
    batch.colors.setXYZW(i, this.color.r, this.color.g, this.color.b, alpha)
    this.pose.position.set(x, y, 14)
    this.pose.rotation.set(0, 0, angle)
    this.pose.scale.set(width, height, 1)
    this.pose.updateMatrix()
    batch.mesh.setMatrixAt(i, this.pose.matrix)
  }

  end() {
    for (const batch of this.batches.values()) {
      batch.mesh.count = batch.count
      if (!batch.count) continue
      for (const attribute of [batch.mesh.instanceMatrix, batch.rectangles, batch.colors]) {
        uploadInstanceRange(attribute,batch.count)
      }
    }
  }

  destroy() {
    for (const batch of this.batches.values()) {
      batch.mesh.removeFromParent()
      batch.mesh.dispose()
      batch.mesh.geometry.dispose()
      batch.mesh.material.uniforms.art.value.dispose()
      batch.mesh.material.dispose()
    }
    this.batches.clear()
  }
}
