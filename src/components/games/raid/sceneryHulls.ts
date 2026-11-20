import { LANDSCAPE_VIEW_YAW } from './raidView'
import { Matrix3, Mesh as ThreeMesh, MeshStandardMaterial, Vector3 } from 'three'
import type { Object3D } from 'three'
import { Container, Geometry, GlProgram, Mesh, RenderTexture, Shader, State, Texture, UniformGroup } from 'pixi.js'
import type { Renderer, Sprite } from 'pixi.js'
import { SHIP_LIGHTING_PALETTES, type ShipLightingFrame } from './shipLighting'
import { acquireHull, hullKey, loadHull, releaseHull } from './liveHullAssets'

const vertex = `
precision highp float;
attribute vec2 aPosition, aUV;
attribute vec3 aHull, aNormal;
uniform mat3 uProjectionMatrix, uWorldTransformMatrix, uTransformMatrix;
uniform vec4 uColor, uWorldColorAlpha, uRegistration;
uniform vec2 uYaw, uRoll, uSlope;
uniform float uSpanRatio, uDistanceKm, uWidthKm;
varying vec2 paint;
varying vec3 normal, viewDirection;
varying vec4 tint;
void main() {
  vec3 local = vec3((uRegistration.x*aHull.x+144.*uRegistration.x+uRegistration.z-224.)/448.,
    (uRegistration.y*aHull.y+224.-144.*uRegistration.y-uRegistration.w)/448.,uRegistration.x*aHull.z/448.);
  // Heading belongs to the world flight plane; the shared oblique camera is
  // applied afterward, exactly as in ThreeShipPresentation.
  vec3 p = vec3(uRoll.x*local.x+uRoll.y*local.y,-uRoll.y*local.x+uRoll.x*local.y,local.z);
  p = vec3(uYaw.x*p.x+uYaw.y*p.z,p.y,-uYaw.y*p.x+uYaw.x*p.z);
  vec3 n = vec3(uRoll.x*aNormal.x+uRoll.y*aNormal.y,-uRoll.y*aNormal.x+uRoll.x*aNormal.y,aNormal.z);
  normal = vec3(uYaw.x*n.x+uYaw.y*n.z,-n.y,-uYaw.y*n.x+uYaw.x*n.z);
  viewDirection = vec3(-uSlope,1.);
  vec3 q = vec3(p.x,-p.y,p.z);
  float denominator = max(.025,1.-q.z*uSpanRatio);
  vec2 projected = .5+(q.xy+uSlope*q.z)/denominator;
  vec2 screen = (uProjectionMatrix*uWorldTransformMatrix*uTransformMatrix*vec3(projected,1.)).xy;
  float depth = max(.08,uDistanceKm-q.z*uWidthKm);
  gl_Position = vec4(screen*denominator,(1.-.16/depth)*denominator,denominator);
  paint = aUV;
  tint = uColor*uWorldColorAlpha;
}`
const fragment = `
precision highp float;
uniform sampler2D uArt;
uniform vec3 uPaint, uSun, uFillDirection, uKeyColor, uFillColor, uSkyColor, uGroundColor;
uniform vec4 uLightGain;
varying vec2 paint;
varying vec3 normal, viewDirection;
varying vec4 tint;
void main() {
  vec4 texel = texture2D(uArt,paint);
  if (texel.a < .1) discard;
  vec3 n = normalize(normal), eye = normalize(viewDirection);
  vec3 light = normalize(uSun), fill = normalize(uFillDirection);
  vec3 base = pow(max(vec3(0.),texel.rgb*uPaint),vec3(2.2));
  float day = max(0.,dot(n,light)), bounce = max(0.,dot(n,fill));
  vec3 ambient = mix(uGroundColor,uSkyColor,n.y*-.5+.5)*uLightGain.z;
  vec3 diffuse = base*(ambient + uKeyColor*day*uLightGain.x*.3183
    + uFillColor*bounce*uLightGain.y*.3183);
  // A rough painted-metal response, keeping broad highlights below the livery.
  vec3 f0 = mix(vec3(.04),base,.22);
  float keySpecular = pow(max(0.,dot(n,normalize(light+eye))),18.);
  float fillSpecular = pow(max(0.,dot(n,normalize(fill+eye))),12.);
  vec3 specular = f0*(uKeyColor*keySpecular*uLightGain.x*.5
    + uFillColor*fillSpecular*uLightGain.y*.4);
  float grazing = pow(1.-max(0.,dot(n,eye)),4.);
  specular += mix(f0,vec3(1.),grazing)*uSkyColor*uLightGain.w*.12;
  vec3 lit = pow(max(vec3(0.),diffuse+specular),vec3(1./2.2));
  gl_FragColor = vec4(lit,texel.a)*tint;
}`

function createHullUniforms(registration: number[], paint: Float32Array) {
  return new UniformGroup({
    uSun: { value: new Float32Array([-.61, -.49, .62]), type: 'vec3<f32>' },
    uFillDirection: { value: new Float32Array([.7, .35, .55]), type: 'vec3<f32>' },
    uKeyColor: { value: new Float32Array(SHIP_LIGHTING_PALETTES[0].key), type: 'vec3<f32>' },
    uFillColor: { value: new Float32Array(SHIP_LIGHTING_PALETTES[0].fill), type: 'vec3<f32>' },
    uSkyColor: { value: new Float32Array(SHIP_LIGHTING_PALETTES[0].sky), type: 'vec3<f32>' },
    uGroundColor: { value: new Float32Array(SHIP_LIGHTING_PALETTES[0].ground), type: 'vec3<f32>' },
    uLightGain: { value: new Float32Array([2.8, .34, .34, .36]), type: 'vec4<f32>' },
    uRegistration: { value: new Float32Array(registration), type: 'vec4<f32>' },
    uYaw: { value: new Float32Array([1, 0]), type: 'vec2<f32>' },
    uRoll: { value: new Float32Array([1, 0]), type: 'vec2<f32>' },
    uSlope: { value: new Float32Array(2), type: 'vec2<f32>' },
    uSpanRatio: { value: .01, type: 'f32' }, uDistanceKm: { value: 10, type: 'f32' },
    uWidthKm: { value: .1, type: 'f32' }, uPaint: { value: paint, type: 'vec3<f32>' },
  })
}

type HullBuffers = { geometry: Geometry; texture: Texture; paint: Float32Array }
type HullModel = { object: Object3D; registration: number[]; parts: HullBuffers[] }
type HullPart = { mesh: Mesh<Geometry, Shader>; params: ReturnType<typeof createHullUniforms> }
type HullSlot = { anchor: Sprite; key: string; parts: HullPart[]; dynamic: boolean }

/** The same authored GLBs as live player ships, inside the existing scenery pass. */
export class SceneryHulls {
  private readonly models = new Map<string, HullModel>()
  private readonly slots: HullSlot[] = []
  private readonly ownedTextures = new Set<Texture>()
  private destroyed = false
  private readonly hiddenAnchors = new Set<Sprite>()

  add(anchor: Sprite, key: string, dynamic = false) { this.slots.push({ anchor, key: hullKey(key), parts: [], dynamic }) }

  async prepare(renderer: Renderer) {
    const prepared=await Promise.allSettled([...new Set(this.slots.map(slot => slot.key))].map(async key => {
      let object: Object3D | undefined
      const parts: HullBuffers[] = []
      try {
        await loadHull(key)
        if (this.destroyed) return
        const asset = acquireHull(key)
        if (!asset) return
        object = asset.object
        object.updateMatrixWorld(true)
        const point = new Vector3(), normal = new Vector3(), normalMatrix = new Matrix3()
        object.traverse(child => {
          if (!(child instanceof ThreeMesh) || !(child.material instanceof MeshStandardMaterial)) return
          const source = child.geometry, position = source.getAttribute('position')
          const normals = source.getAttribute('normal'), uv = source.getAttribute('uv')
          if (!position || !normals || !uv) return
          const hull = new Float32Array(position.count * 3), xy = new Float32Array(position.count * 2)
          const shadedNormals = new Float32Array(position.count * 3), paintUV = new Float32Array(position.count * 2)
          normalMatrix.getNormalMatrix(child.matrixWorld)
          for (let i = 0; i < position.count; i++) {
            point.fromBufferAttribute(position, i).applyMatrix4(child.matrixWorld)
            normal.fromBufferAttribute(normals, i).applyNormalMatrix(normalMatrix)
            const v = i * 3, t = i * 2
            hull[v] = point.x; hull[v + 1] = point.y; hull[v + 2] = point.z
            xy[t] = .5 + point.x / 448; xy[t + 1] = .5 - point.y / 448
            shadedNormals[v] = normal.x; shadedNormals[v + 1] = normal.y; shadedNormals[v + 2] = normal.z
            paintUV[t] = uv.getX(i); paintUV[t + 1] = child.material.map?.flipY ? 1 - uv.getY(i) : uv.getY(i)
          }
          const geometry = new Geometry({ attributes: {
            aPosition: { buffer: xy, format: 'float32x2' }, aHull: { buffer: hull, format: 'float32x3' },
            aNormal: { buffer: shadedNormals, format: 'float32x3' }, aUV: { buffer: paintUV, format: 'float32x2' },
          }, indexBuffer: source.index ? new Uint32Array(source.index.array) : undefined })
          geometry.autoGarbageCollect = false
          const image = child.material.map?.image as HTMLImageElement | ImageBitmap | HTMLCanvasElement | undefined
          const texture = image ? Texture.from(image, true) : Texture.WHITE
          if (image) this.ownedTextures.add(texture)
          parts.push({ geometry, texture, paint: new Float32Array(child.material.color.toArray()) })
        })
        if (parts.length === 0) throw new Error('No drawable hull geometry: ' + key)
        this.models.set(key, { object, registration: asset.registration.registration, parts })
      } catch (error) {
        for (const part of parts) part.geometry.destroy(true)
        if (object) releaseHull(key, object)
        throw new Error('Required friendly 3D hull unavailable: '+key+': '+String(error))
      }
    }))
    const failure=prepared.find(result=>result.status==='rejected')
    if(failure?.status==='rejected')throw failure.reason
    if (this.destroyed) return
    for (const slot of this.slots) {
      const model = this.models.get(slot.key)
      if (!model || !slot.anchor.parent) continue
      for (const part of model.parts) {
        const params = createHullUniforms(model.registration, part.paint)
        const shader = new Shader({ glProgram: GlProgram.from({ vertex, fragment }),
          resources: { hull: params, uArt: part.texture.source } })
        const state = State.for2d()
        state.depthTest = true; state.depthMask = true; state.cullMode = 'back'
        const mesh = new Mesh({ geometry: part.geometry, shader, texture: part.texture, state })
        mesh.pivot.set(.5); mesh.visible = false; mesh.eventMode = 'none'
        slot.anchor.parent.addChildAt(mesh, slot.anchor.parent.getChildIndex(slot.anchor))
        slot.parts.push({ mesh, params })
      }
    }
    // Upload the real paint/buffers and compile the actual shader during loading.
    const scene = new Container(), target = RenderTexture.create({ width: 8, height: 8 })
    try {
      const textures = [...new Set([...this.models.values()].flatMap(model => model.parts.map(part => part.texture)))]
      await renderer.prepare.upload(textures)
      if (this.destroyed) return
      for (const slot of this.slots) for (const part of slot.parts) {
        const parent = part.mesh.parent!, index = parent.getChildIndex(part.mesh)
        scene.addChild(part.mesh)
        part.mesh.position.set(4, 4); part.mesh.scale.set(8); part.mesh.visible = true
        try { renderer.render({ container: scene, target, clear: true }) }
        finally { parent.addChildAt(part.mesh, index); part.mesh.visible = false }
      }
    } finally { scene.destroy(); target.destroy(true) }
  }

  /** Restore our billboards before other scenery adapters claim their anchors. */
  restoreAnchors() {
    for (const anchor of this.hiddenAnchors) anchor.renderable = true
    this.hiddenAnchors.clear()
  }

  update(width: number, height: number, focal: number, landscape: boolean,
    distanceFor: (anchor: Sprite) => number, keyFor: (anchor: Sprite) => string | undefined, lighting?: ShipLightingFrame) {
    const yaw = landscape ? LANDSCAPE_VIEW_YAW : 0, c = Math.cos(yaw), s = Math.sin(yaw)
    for (const slot of this.slots) {
      const sprite = slot.anchor, active = hullKey(keyFor(sprite) ?? (slot.dynamic ? '' : slot.key)) === slot.key
      const visible = active && sprite.visible && slot.parts.length > 0
      if (active) {
        sprite.renderable = false
        if (slot.parts.length > 0) this.hiddenAnchors.add(sprite)
      }
      const roll = sprite.rotation, rc = Math.cos(roll), rs = Math.sin(roll)
      const slopeX = (sprite.x - width * .5) / focal, slopeY = (sprite.y - height * .5) / focal
      const distance = Math.max(.1, distanceFor(sprite)), size = Math.max(sprite.width, sprite.height)
      for (const part of slot.parts) {
        const mesh = part.mesh
        mesh.visible = visible
        if (!visible) continue
        const u = part.params.uniforms
        if (lighting) {
          u.uSun.set(lighting.sun); u.uFillDirection.set(lighting.fillDirection)
          u.uKeyColor.set(lighting.keyColor); u.uFillColor.set(lighting.fillColor)
          u.uSkyColor.set(lighting.skyColor); u.uGroundColor.set(lighting.groundColor)
          u.uLightGain[0] = lighting.sunIntensity; u.uLightGain[1] = lighting.fillIntensity
          u.uLightGain[2] = lighting.ambientIntensity; u.uLightGain[3] = lighting.reflectionIntensity
        }
        u.uYaw[0] = c; u.uYaw[1] = s; u.uRoll[0] = rc; u.uRoll[1] = rs
        u.uSlope[0] = slopeX; u.uSlope[1] = slopeY
        u.uSpanRatio = size / focal; u.uDistanceKm = distance; u.uWidthKm = size * distance / focal
        mesh.position.copyFrom(sprite.position); mesh.scale.set(size)
        mesh.rotation = 0; mesh.alpha = sprite.alpha; mesh.tint = sprite.tint; mesh.zIndex = sprite.zIndex
      }
    }
  }

  destroy() {
    this.destroyed = true
    for (const slot of this.slots) {
      slot.anchor.renderable = true
      for (const part of slot.parts) { part.mesh.shader?.destroy(); part.mesh.destroy() }
    }
    for (const [key, model] of this.models) {
      for (const part of model.parts) part.geometry.destroy(true)
      releaseHull(key, model.object)
    }
    for (const texture of this.ownedTextures) texture.destroy(true)
    this.ownedTextures.clear()
    this.models.clear(); this.slots.length = 0; this.hiddenAnchors.clear()
  }
}
