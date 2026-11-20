import { Container, RenderTexture, Geometry, GlProgram, Mesh, Shader, UniformGroup, type Texture, type Renderer } from 'pixi.js'
import { raidCameraFocal } from './raidView'
import { PLANET_FLIGHT_ALTITUDE, PLANET_FLIGHT_VIEW, planetFlightTravel } from './planetFlightCamera'
import type { ShipLightingFrame } from './shipLighting'

const vertex = `#version 300 es
precision highp float;
in vec2 aPosition;
uniform mat3 uProjectionMatrix, uWorldTransformMatrix, uTransformMatrix;
uniform vec2 uViewport;
out vec2 screen;
void main() {
  screen = aPosition;
  gl_Position = vec4((uProjectionMatrix*uWorldTransformMatrix*uTransformMatrix*vec3(aPosition*uViewport,1.)).xy,0.,1.);
}`
const fragment = `#version 300 es
precision highp float;
uniform sampler2D uGround;
uniform vec2 uViewport, uView, uTexel;
uniform vec3 uSun, uKey, uSky, uBounce;
uniform float uFocal, uTravel, uWet, uAltitude;
in vec2 screen;
out vec4 finalColor;
// Let the repeat sampler filter across tile boundaries, including mip levels.
vec3 ground(vec2 uv) { return textureGrad(uGround,uv,dFdx(uv),dFdy(uv)).rgb; }
void main() {
  vec2 ray = (vec2(screen.x-.5,.5-screen.y)*uViewport)/uFocal;
  // View pitch is the same flight-plane basis used by the live hulls. The
  // ground recedes in depth; it is not a horizontal strip facing the camera.
  float down = uView.x-ray.y*uView.y;
  float depth = uAltitude/max(.025,down);
  vec2 uv = vec2(ray.x*depth+uTravel,(uView.y+ray.y*uView.x)*depth)*.42;
  vec3 paint = ground(uv);
  float h = dot(paint,vec3(.2126,.7152,.0722));
  float dx = dot(ground(uv+vec2(uTexel.x,0.)),vec3(.2126,.7152,.0722))-h;
  float dz = dot(ground(uv+vec2(0.,uTexel.y)),vec3(.2126,.7152,.0722))-h;
  float relief = mix(2.6,1.1,uWet);
  vec3 n = normalize(vec3(-dx*relief,uView.y-dz*uView.x*relief,uView.x+dz*uView.y*relief));
  vec3 eye = normalize(vec3(-ray,1.));
  float daylight = max(0.,dot(n,uSun));
  vec3 linearPaint = pow(paint,vec3(2.2));
  vec3 lit = linearPaint*(uSky*.38+uBounce*.24+uKey*daylight*.72);
  float glint = pow(max(0.,dot(n,normalize(uSun+eye))),mix(12.,28.,uWet));
  lit += uKey*glint*mix(.018,.045,uWet);
  // Preserve emissive lava in the authored terrain without lighting basalt.
  float lava = max(0.,paint.r-max(paint.g,paint.b)*1.65)*(1.-uWet);
  lit += vec3(1.,.14,.025)*lava*.6;
  vec3 fog = uSky*.24+uBounce*.1;
  lit = mix(lit,fog,1.-exp(-depth*.035));
  finalColor = vec4(pow(max(lit,vec3(0.)),vec3(1./2.2)),1.);
}`

/** One native-resolution perspective material. No render target or reflection
 * capture; authored water/basalt textures retain their mipmaps and detail. */
export class PlanetFlightSurface {
  private readonly parameters = new UniformGroup({
    uViewport: { value: new Float32Array([1,1]), type: 'vec2<f32>' },
    uView: { value: new Float32Array(PLANET_FLIGHT_VIEW), type: 'vec2<f32>' },
    uTexel: { value: new Float32Array([1/1024,1/512]), type: 'vec2<f32>' },
    uSun: { value: new Float32Array([.48,.65,.72]), type: 'vec3<f32>' },
    uKey: { value: new Float32Array([1,.8,.65]), type: 'vec3<f32>' },
    uSky: { value: new Float32Array([.35,.5,.65]), type: 'vec3<f32>' },
    uBounce: { value: new Float32Array([.1,.2,.3]), type: 'vec3<f32>' },
    uAltitude: { value: PLANET_FLIGHT_ALTITUDE, type: 'f32' },
    uFocal: { value: 1, type: 'f32' }, uTravel: { value: 0, type: 'f32' }, uWet: { value: 1, type: 'f32' },
  })
  readonly mesh: Mesh<Geometry,Shader>
  constructor(water: Texture) {
    const geometry = new Geometry({ attributes: { aPosition: { buffer: new Float32Array([0,0,1,0,1,1,0,1]), format: 'float32x2' } }, indexBuffer: new Uint16Array([0,1,2,0,2,3]) })
    const shader = new Shader({ glProgram: GlProgram.from({ vertex,fragment }), resources: { surface: this.parameters, uGround: water.source } })
    this.mesh = new Mesh({ geometry, shader, texture: water }); this.mesh.eventMode = 'none'
  }
  async prepare(renderer: Renderer) {
    const mesh = this.mesh, parent = mesh.parent!, index = parent.getChildIndex(mesh)
    const scene = new Container(), target = RenderTexture.create({ width: 8, height: 8 })
    try {
      await renderer.prepare.upload([mesh.texture])
      scene.addChild(mesh)
      renderer.render({ container: scene, target, clear: true })
    } finally { parent.addChildAt(mesh,index); scene.destroy(); target.destroy(true) }
  }
  update(width: number, height: number, seconds: number, wet: boolean, paint: Texture, lighting?: ShipLightingFrame) {
    const u = this.parameters.uniforms
    u.uViewport[0] = width; u.uViewport[1] = height
    u.uFocal = raidCameraFocal(width); u.uWet = wet ? 1 : 0
    u.uTexel[0] = 1/paint.width; u.uTexel[1] = 1/paint.height
    u.uTravel = planetFlightTravel(seconds)
    if (this.mesh.texture !== paint) { this.mesh.texture = paint; this.mesh.shader!.resources.uGround = paint.source }
    if (lighting) {
      u.uSun[0] = -lighting.sun[1]; u.uSun[1] = -lighting.sun[0]; u.uSun[2] = lighting.sun[2]
      u.uKey.set(lighting.keyColor); u.uSky.set(lighting.skyColor); u.uBounce.set(lighting.groundColor)
    }
  }
  destroy() { this.mesh.shader!.destroy(); this.mesh.geometry.destroy(true); this.mesh.destroy() }
}
