import { GlProgram, Mesh, MeshGeometry, RenderTexture, Shader, UniformGroup } from 'pixi.js'
import type { Renderer } from 'pixi.js'

const vertex = `
precision highp float;
attribute vec2 aPosition;
uniform mat3 uProjectionMatrix, uWorldTransformMatrix, uTransformMatrix;
varying vec2 uv;
void main() {
  uv = aPosition;
  gl_Position = vec4((uProjectionMatrix*uWorldTransformMatrix*uTransformMatrix*vec3(aPosition,1.)).xy,0.,1.);
}`
const fragment = `
precision highp float;
varying vec2 uv;
uniform vec4 uTop, uMid, uBottom, uGlowA, uGlowB;
uniform float uGlows;
void main() {
  // Evaluate continuously at native pixel resolution, rather than stretching
  // an 8-bit gradient lookup into visible columns after landscape rotation.
  vec3 color = uv.y < .45 ? mix(uTop.rgb,uMid.rgb,uv.y/.45)
    : mix(uMid.rgb,uBottom.rgb,(uv.y-.45)/.55);
  float a = max(0.,1.-length((uv-vec2(.18,.16))/.24))*uGlowA.a*uGlows;
  float b = max(0.,1.-length((uv-vec2(.76,.38))/.26))*uGlowB.a*uGlows;
  color = mix(color,uGlowA.rgb,a);
  color = mix(color,uGlowB.rgb,b);
  // Broad, asymmetric voids between the luminous clouds. These belong to the
  // sky, beneath the stars and gameplay layers, rather than a dark screen filter.
  vec2 pocketA = (uv-vec2(.36,.54))*vec2(1.35,.90);
  vec2 pocketB = (uv-vec2(.81,.19))*vec2(1.65,1.15);
  float voidA = 1.-smoothstep(.025,.38,dot(pocketA,pocketA));
  float voidB = 1.-smoothstep(.015,.24,dot(pocketB,pocketB));
  color *= .68-.42*max(voidA,voidB*.82);
  // Stationary sub-quantization dither breaks dark-sky bands without animated
  // noise, new textures, blur, or a post-processing pass.
  float noise = fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(.06711056,.00583715))))-.5;
  gl_FragColor = vec4(clamp(color+noise/255.,0.,1.),1.);
}`

/** One opaque background quad; all buffers/programs are retained until cleanup. */
export class SpaceBackdrop {
  private readonly params = new UniformGroup({
    uTop: { value: new Float32Array([0,0,0,1]), type: 'vec4<f32>' },
    uMid: { value: new Float32Array([0,0,0,1]), type: 'vec4<f32>' },
    uBottom: { value: new Float32Array([0,0,0,1]), type: 'vec4<f32>' },
    uGlowA: { value: new Float32Array(4), type: 'vec4<f32>' },
    uGlowB: { value: new Float32Array(4), type: 'vec4<f32>' },
    uGlows: { value: 1, type: 'f32' },
  })
  private readonly shader = new Shader({ glProgram: GlProgram.from({ vertex, fragment }), resources: { sky: this.params } })
  readonly mesh = new Mesh({ geometry: new MeshGeometry({}), shader: this.shader })

  update(width: number, height: number, top: readonly number[], mid: readonly number[], bottom: readonly number[],
    glowA: readonly number[], glowB: readonly number[], glows: boolean) {
    this.mesh.scale.set(width,height)
    const u = this.params.uniforms
    u.uTop.set(top);u.uMid.set(mid);u.uBottom.set(bottom)
    u.uGlowA.set(glowA);u.uGlowB.set(glowB);u.uGlows = glows ? 1 : 0
  }
  prepare(renderer: Renderer) {
    const target = RenderTexture.create({ width: 8, height: 8 })
    const sx = this.mesh.scale.x, sy = this.mesh.scale.y
    this.mesh.scale.set(8)
    try { renderer.render({ container: this.mesh, target, clear: true }) }
    finally { this.mesh.scale.set(sx,sy);target.destroy(true) }
  }
  destroy() {
    this.mesh.geometry.destroy(true)
    this.shader.destroy()
    this.mesh.destroy()
  }
}
