import { Geometry, GlProgram, Mesh, RenderTexture, Shader, Texture, UniformGroup } from 'pixi.js'
import type { Renderer } from 'pixi.js'
import type { OrbitalCamera } from './orbitalSpace'
import type { ShipLightingFrame } from './shipLighting'

const vertex = `
precision highp float;
attribute vec2 aPosition;
attribute vec4 aRock;
uniform mat3 uProjectionMatrix, uWorldTransformMatrix, uTransformMatrix;
uniform vec2 uViewport;
uniform vec3 uOffset;
uniform float uFocal, uSeconds;
varying vec2 uv;
void main() {
  uv = aPosition*.5+.5;
  vec3 p = aRock.xyz+uOffset;
  float angle = aRock.w*37.+uSeconds*(.018+aRock.w*.012);
  float c = cos(angle), s = sin(angle);
  vec2 corner = mat2(c,-s,s,c)*aPosition;
  float radius = .035+.16*pow(aRock.w,3.);
  vec2 pos = uViewport*.5+(p.xy+corner*radius)*uFocal/max(.1,p.z);
  gl_Position = vec4((uProjectionMatrix*uWorldTransformMatrix*uTransformMatrix*vec3(pos,1.)).xy,0.,1.);
}`
const fragment = `
precision highp float;
varying vec2 uv;
uniform sampler2D uArt;
uniform vec4 uFrame;
uniform vec3 uSun, uKey;
uniform float uOpacity, uAmbient, uIntensity;
void main() {
  vec4 art = texture2D(uArt,uFrame.xy+uv*uFrame.zw);
  vec2 p = (uv-.5)*2.;
  vec3 normal = normalize(vec3(p,sqrt(max(.01,1.-dot(p,p)))));
  float day = max(0.,dot(normal,uSun));
  vec3 light = vec3(uAmbient)+uKey*(day*uIntensity*.3183);
  gl_FragColor = vec4(art.rgb*light,art.a)*uOpacity;
}`

/** Sparse orbital debris: one fixed-size batch using already-loaded asteroid art.
 * All objects have persistent world positions; no per-frame geometry or recycling. */
export class AsteroidBelt {
  private readonly params = new UniformGroup({
    uViewport: { value: new Float32Array(2), type: 'vec2<f32>' },
    uOffset: { value: new Float32Array(3), type: 'vec3<f32>' },
    uFocal: { value: 1, type: 'f32' }, uSeconds: { value: 0, type: 'f32' },
    uFrame: { value: new Float32Array([0,0,1,1]), type: 'vec4<f32>' },
    uSun: { value: new Float32Array(3), type: 'vec3<f32>' },
    uKey: { value: new Float32Array(3), type: 'vec3<f32>' },
    uAmbient: { value: .12, type: 'f32' }, uIntensity: { value: 1, type: 'f32' },
    uOpacity: { value: 0, type: 'f32' },
  })
  private readonly shader = new Shader({ glProgram: GlProgram.from({ vertex, fragment }),
    resources: { belt: this.params, uArt: Texture.WHITE.source } })
  readonly mesh: Mesh<Geometry, Shader>
  private stage = -1
  private run = -1
  private centerX = 0
  private centerY = 0
  private opacity = 0

  constructor() {
    const count = 240, corners = new Float32Array(count*8), rocks = new Float32Array(count*16)
    const indices = new Uint16Array(count*6)
    for (let i=0;i<count;i++) {
      const seed = (i*.61803398875+.137)%1, angle = i*2.3999632297
      const radius = 1+(seed-.5)*.17
      // A tilted annulus, with a sparse finite thickness instead of a solid wall.
      const x = Math.cos(angle)*28*radius
      const y = Math.sin(angle)*13*radius
      const z = 26+Math.sin(angle)*7+(seed-.5)*2
      for (let j=0;j<4;j++) rocks.set([x,y,z,seed],i*16+j*4)
      corners.set([-1,-1,1,-1,1,1,-1,1],i*8)
      const v = i*4;indices.set([v,v+1,v+2,v,v+2,v+3],i*6)
    }
    this.mesh = new Mesh({ geometry: new Geometry({ attributes: {
      aPosition: { buffer: corners, format: 'float32x2' }, aRock: { buffer: rocks, format: 'float32x4' },
    }, indexBuffer: indices }), shader: this.shader })
    this.mesh.geometry.autoGarbageCollect = false
    this.mesh.visible = false;this.mesh.eventMode = 'none'
  }

  update(camera: OrbitalCamera, texture: Texture | undefined, lighting: ShipLightingFrame,
    stage: number, run: number, enabled: boolean, seconds: number) {
    const selected = enabled && (stage === 3 || stage === 7 || stage === 8 || stage === 12 || stage === 14)
    if (this.run !== run) { this.run = run;this.stage = -1;this.opacity = 0 }
    const switching = selected && this.stage !== stage
    this.opacity += ((selected && !switching ? 1 : 0)-this.opacity)*(1-Math.exp(-camera.deltaSeconds*1.8))
    if (switching && this.opacity < .005) {
      this.stage = stage
      this.centerX = camera.positionKm[0]
      // Pad for the deepest rock and the whole inclined annulus. First entry is
      // beyond the forward edge, which becomes the right edge in landscape.
      this.centerY = camera.positionKm[1]-(camera.height*.5+128)*34/camera.focal-15
    }
    this.mesh.visible = !!texture && this.opacity > .002
    if (!texture || !this.mesh.visible) return
    if (this.mesh.texture !== texture) {
      this.mesh.texture = texture;this.shader.resources.uArt = texture.source
      const f = texture.frame, source = texture.source
      this.params.uniforms.uFrame.set([f.x/source.width,f.y/source.height,f.width/source.width,f.height/source.height])
    }
    const u = this.params.uniforms
    u.uViewport[0] = camera.width;u.uViewport[1] = camera.height
    u.uOffset[0] = this.centerX-camera.positionKm[0];u.uOffset[1] = this.centerY-camera.positionKm[1];u.uOffset[2] = -camera.positionKm[2]
    u.uSun.set(lighting.sun);u.uKey.set(lighting.keyColor)
    u.uAmbient = lighting.ambientIntensity*.6;u.uIntensity = lighting.sunIntensity
    u.uOpacity = this.opacity*.72;u.uFocal = camera.focal;u.uSeconds = seconds
  }
  prepare(renderer: Renderer, texture: Texture) {
    this.mesh.texture = texture;this.shader.resources.uArt = texture.source
    const f = texture.frame, source = texture.source
    this.params.uniforms.uFrame.set([f.x/source.width,f.y/source.height,f.width/source.width,f.height/source.height])
    const target = RenderTexture.create({ width: 8, height: 8 })
    this.mesh.visible = true
    try { renderer.render({ container: this.mesh, target, clear: true }) }
    finally { this.mesh.visible = false;target.destroy(true) }
  }
  destroy() {
    this.mesh.geometry.destroy(true);this.shader.destroy();this.mesh.destroy()
  }
}
