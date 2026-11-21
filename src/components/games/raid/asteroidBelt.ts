import { GlProgram, Mesh, RenderTexture, Shader, State, Texture, UniformGroup } from 'pixi.js'
import type { Geometry, Renderer } from 'pixi.js'
import type { OrbitalCamera } from './orbitalSpace'
import type { ShipLightingFrame } from './shipLighting'
import { createAsteroidBeltGeometry } from './asteroidBeltGeometry'
import { ASTEROID_SURFACE_GLSL, writeOrbitalLight } from './asteroidMaterial'

const vertex = `
precision highp float;
attribute vec2 aPosition;
attribute vec3 aHull;
attribute vec4 aNormal, aRock, aShape, aMotion;
uniform mat3 uProjectionMatrix, uWorldTransformMatrix, uTransformMatrix;
uniform vec2 uViewport, uFieldView;
uniform vec3 uOffset;
uniform float uFocal, uSeconds, uFieldScale, uEntryMargin;
uniform vec4 uColor, uWorldColorAlpha;
varying vec2 paint;
varying vec3 normal;
varying vec4 tint;
vec3 turn(vec3 p, float c, float s) {
  return p*c+cross(aMotion.xyz,p)*s+aMotion.xyz*dot(aMotion.xyz,p)*(1.-c);
}
void main() {
  float angle = aRock.w*41.+uSeconds*aMotion.w;
  float c = cos(angle), s = sin(angle);
  // A frozen admission scale keeps foreground boulders dramatic without
  // allowing one cosmetic rock to cover the entire combat corridor.
  float radius = min(aShape.w,aRock.z*(.028+fract(aRock.w*17.37)*.035))*uFieldScale;
  vec3 p = turn(aHull*aShape.xyz,c,s)*radius;
  vec3 n = turn(aNormal.xyz/aShape.xyz,c,s);
  // The reference view is captured on entry: resizing cannot teleport rocks.
  // The full volume enters from beyond the forward edge at independent depths.
  float z = aRock.z;
  vec3 center = vec3(aRock.x*uFieldView.x*z,
    -uFieldView.y*.5*z-uEntryMargin*z-radius*3.2-aRock.y,z)+uOffset;
  float distance = max(.1,center.z-p.z);
  vec2 pos = uViewport*.5+(center.xy+vec2(p.x,-p.y))*uFocal/distance;
  vec2 screen = (uProjectionMatrix*uWorldTransformMatrix*uTransformMatrix*vec3(pos,1.)).xy;
  gl_Position = vec4(screen*distance,(1.-.16/distance)*distance,distance);
  normal = vec3(n.x,-n.y,n.z);
  // Same full-color paint registration as the existing OrbitalSurface rocks.
  paint = .5+normalize(aHull).xy*.48*.965;
  tint = uColor*uWorldColorAlpha;
}`

const fragment = `
precision highp float;
uniform sampler2D uArt;
uniform vec4 uFrame;
uniform vec3 uSun, uHalfLight;
uniform float uOpacity;
varying vec2 paint;
varying vec3 normal;
varying vec4 tint;
${ASTEROID_SURFACE_GLSL}
void main() {
  vec4 art = texture2D(uArt,uFrame.xy+clamp(paint,.002,.998)*uFrame.zw);
  vec3 pigment = art.rgb/max(.025,art.a);
  vec3 color = shadeAsteroid(pigment,normalize(normal),uSun,uHalfLight);
  gl_FragColor = vec4(color*uOpacity,uOpacity)*tint;
}`

/** Actual tumbling 3D rocks, with fixed world positions and a single draw call. */
export class AsteroidBelt {
  private readonly params = new UniformGroup({
    uViewport: { value: new Float32Array(2), type: 'vec2<f32>' },
    uFieldView: { value: new Float32Array(2), type: 'vec2<f32>' },
    uOffset: { value: new Float32Array(3), type: 'vec3<f32>' },
    uFieldScale: { value: 1, type: 'f32' }, uEntryMargin: { value: 1, type: 'f32' },
    uFocal: { value: 1, type: 'f32' }, uSeconds: { value: 0, type: 'f32' },
    uFrame: { value: new Float32Array([0,0,1,1]), type: 'vec4<f32>' },
    uSun: { value: new Float32Array([-.61,-.49,.62]), type: 'vec3<f32>' },
    uHalfLight: { value: new Float32Array(3), type: 'vec3<f32>' },
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
    const state = State.for2d()
    state.depthTest = true;state.depthMask = true;state.cullMode = 'back'
    this.mesh = new Mesh({ geometry: createAsteroidBeltGeometry(), shader: this.shader, state })
    this.mesh.visible = false;this.mesh.eventMode = 'none';this.mesh.zIndex = -60
  }

  update(camera: OrbitalCamera, texture: Texture | undefined, lighting: ShipLightingFrame,
    stage: number, run: number, enabled: boolean, seconds: number) {
    const selected = enabled && (stage === 3 || stage === 7 || stage === 8 || stage === 12 || stage === 14)
    if (this.run !== run) { this.run = run;this.stage = -1;this.opacity = 0 }
    const switching = selected && this.stage !== stage
    this.opacity += ((selected && !switching ? 1 : 0)-this.opacity)*(1-Math.exp(-camera.deltaSeconds*1.8))
    if (switching && this.opacity < .005) {
      this.stage = stage;this.centerX = camera.positionKm[0];this.centerY = camera.positionKm[1]
      this.params.uniforms.uFieldView[0] = camera.width/camera.focal
      this.params.uniforms.uFieldView[1] = camera.height/camera.focal
      this.params.uniforms.uFieldScale = Math.min(camera.width,camera.height)/camera.focal*1.4
      this.params.uniforms.uEntryMargin = 96/camera.focal
    }
    this.mesh.visible = !!texture && this.opacity > .002
    if (!texture || !this.mesh.visible) return
    this.setTexture(texture)
    const u = this.params.uniforms
    u.uViewport[0] = camera.width;u.uViewport[1] = camera.height
    u.uOffset[0] = this.centerX-camera.positionKm[0];u.uOffset[1] = this.centerY-camera.positionKm[1];u.uOffset[2] = -camera.positionKm[2]
    writeOrbitalLight(u.uSun,lighting.sun,u.uHalfLight)
    u.uOpacity = this.opacity;u.uFocal = camera.focal;u.uSeconds = seconds
  }
  private setTexture(texture: Texture) {
    if (this.mesh.texture === texture) return
    this.mesh.texture = texture;this.shader.resources.uArt = texture.source
    const f = texture.frame, source = texture.source
    this.params.uniforms.uFrame.set([f.x/source.width,f.y/source.height,f.width/source.width,f.height/source.height])
  }
  prepare(renderer: Renderer, texture: Texture) {
    this.setTexture(texture)
    const target = RenderTexture.create({ width: 8, height: 8 })
    this.mesh.visible = true
    try { renderer.render({ container: this.mesh, target, clear: true }) }
    finally { this.mesh.visible = false;target.destroy(true) }
  }
  destroy() {
    this.mesh.geometry.destroy(true);this.shader.destroy();this.mesh.destroy()
  }
}
