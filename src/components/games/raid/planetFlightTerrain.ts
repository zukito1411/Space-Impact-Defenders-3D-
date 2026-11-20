import { Container, Geometry, GlProgram, Mesh, RenderTexture, Shader, UniformGroup, type Renderer, type Texture } from 'pixi.js'
import { raidCameraFocal } from './raidView'
import { PLANET_FLIGHT_ALTITUDE, PLANET_FLIGHT_PERIOD, PLANET_FLIGHT_VIEW, planetFlightTravel } from './planetFlightCamera'
import { buildPlanetTerrain, createPlanetTerrainPeaks } from './planetTerrainGeometry'
import type { PlanetAtmosphereKind } from './planetAtmosphereArt'
import type { ShipLightingFrame } from './shipLighting'

const vertex = `#version 300 es
precision highp float;
in vec3 aPosition, aNormal;
in vec2 aCenter, aDetail;
uniform mat3 uProjectionMatrix, uWorldTransformMatrix, uTransformMatrix;
uniform vec2 uViewport, uView;
uniform float uFocal, uTravel, uAltitude, uPeriod;
out vec3 normal;
out vec2 paint, local;
out float elevation, distanceToCamera, geology;
void main() {
  float x = mod(aCenter.x-uTravel+uPeriod*.5,uPeriod)-uPeriod*.5+aPosition.x;
  float d = aCenter.y+aPosition.z, down = uAltitude-aPosition.y;
  float y = uView.x*d-uView.y*down, z = uView.y*d+uView.x*down;
  vec2 screen = uViewport*.5+vec2(x,-y)*uFocal/z;
  vec2 projected = (uProjectionMatrix*uWorldTransformMatrix*uTransformMatrix*vec3(screen,1.)).xy;
  gl_Position = vec4(projected*z,0.,z);
  normal = vec3(aNormal.x,uView.y*aNormal.y+uView.x*aNormal.z,uView.x*aNormal.y-uView.y*aNormal.z);
  // Texture coordinates at the foot match the plane under it exactly.
  paint = vec2(aCenter.x+aPosition.x,d)*.42;
  local = aDetail; geology = sin(aCenter.x*3.91+aCenter.y*17.3); elevation = aPosition.y; distanceToCamera = z;
}`
const fragment = `#version 300 es
precision highp float;
uniform sampler2D uGround;
uniform vec3 uSun, uKey, uSky, uBounce;
uniform float uWet;
uniform vec4 uWorldColorAlpha;
in vec3 normal;
in vec2 paint, local;
in float elevation, distanceToCamera, geology;
out vec4 finalColor;
void main() {
  if (elevation < .0003) discard;
  vec3 texel = texture(uGround,paint).rgb;
  vec3 detail = texture(uGround,paint*4.7).rgb;
  vec3 pigment = pow(texel,vec3(2.2));
  float rock = dot(texel,vec3(.2126,.7152,.0722));
  vec3 island = mix(vec3(.12,.16,.17),vec3(.23,.30,.20),smoothstep(.02,.14,elevation));
  island *= .65+rock*1.5;
  pigment = mix(pigment,pow(island,vec3(2.2)),uWet);
  pigment *= mix(1.,.72+dot(detail,vec3(.2126,.7152,.0722))*1.4,smoothstep(.008,.08,elevation));
  vec3 n = normalize(normal);
  float incidence = max(0.,dot(n,uSun));
  vec3 lit = pigment*(uSky*.38+uBounce*.24+uKey*incidence*.72+vec3(.22,.20,.18)*max(0.,n.z));
  // Thin branching lava channels descend from the recessed crater rim.
  float r = length(local), a = atan(local.y,local.x);
  float bend = sin(r*17.+a*3.+geology)*.38+sin(r*31.-a*7.)*.12;
  float channel = abs(sin(a*3.+bend+geology*2.));
  float flow = (1.-smoothstep(.012,.05,channel))*smoothstep(.14,.23,r)*(1.-smoothstep(.7,.97,r));
  float crater = (1.-smoothstep(.09,.18,r))*.8;
  // Rock variation breaks flows into mineral-lined fissures, rather than
  // drawing continuous bright ribbons over the slopes.
  float fracture = smoothstep(.18,.43,detail.r)*(.4+detail.g);
  float lava = max(flow*fracture*.32,crater)*(1.-uWet);
  lit += vec3(1.,.16,.018)*lava*.55;
  float shoreline = (1.-smoothstep(.002,.016,elevation))*uWet;
  lit = mix(lit,vec3(.22,.35,.36),shoreline*.32);
  vec3 fog = uSky*.24+uBounce*.1;
  lit = mix(lit,fog,1.-exp(-distanceToCamera*.035));
  float alpha = smoothstep(.0003,.008,elevation)*uWorldColorAlpha.a;
  finalColor = vec4(pow(max(lit,vec3(0.)),vec3(1./2.2))*alpha,alpha);
}`

/** Native Pixi geometry uses the surface's perspective basis and lighting.
 * Buffers and materials are prepared during loading; flight changes uniforms. */
export class PlanetFlightTerrain {
  readonly peaks
  readonly mesh: Mesh<Geometry, Shader>
  private readonly parameters = new UniformGroup({
    uViewport: { value: new Float32Array([1,1]), type: 'vec2<f32>' },
    uView: { value: new Float32Array(PLANET_FLIGHT_VIEW), type: 'vec2<f32>' },
    uFocal: { value: 1, type: 'f32' }, uTravel: { value: 0, type: 'f32' },
    uAltitude: { value: PLANET_FLIGHT_ALTITUDE, type: 'f32' }, uPeriod: { value: PLANET_FLIGHT_PERIOD, type: 'f32' },
    uWet: { value: 0, type: 'f32' },
    uSun: { value: new Float32Array([.48,.65,.72]), type: 'vec3<f32>' },
    uKey: { value: new Float32Array([1,.8,.65]), type: 'vec3<f32>' },
    uSky: { value: new Float32Array([.35,.5,.65]), type: 'vec3<f32>' },
    uBounce: { value: new Float32Array([.1,.2,.3]), type: 'vec3<f32>' },
  })
  constructor(kind: PlanetAtmosphereKind, paint: Texture) {
    this.peaks = createPlanetTerrainPeaks(kind)
    const buffers = buildPlanetTerrain(kind,this.peaks)
    const geometry = new Geometry({ attributes: {
      aPosition: { buffer: buffers.positions, format: 'float32x3' },
      aNormal: { buffer: buffers.normals, format: 'float32x3' },
      aCenter: { buffer: buffers.centers, format: 'float32x2' },
      aDetail: { buffer: buffers.details, format: 'float32x2' },
    }, indexBuffer: buffers.indices })
    this.parameters.uniforms.uWet = kind === 'pelagic' ? 1 : 0
    this.mesh = new Mesh({ geometry, shader: new Shader({ glProgram: GlProgram.from({ vertex, fragment }),
      resources: { terrain: this.parameters, uGround: paint.source } }), texture: paint })
    this.mesh.eventMode = 'none'
    // Native bounds are world coordinates; vertices project in the shader.
    this.mesh.cullable = false
  }
  async prepare(renderer: Renderer) {
    const mesh = this.mesh, parent = mesh.parent!, index = parent.getChildIndex(mesh)
    const scene = new Container(), target = RenderTexture.create({ width: 8, height: 8 })
    const visible = mesh.visible
    try {
      await renderer.prepare.upload([mesh.texture])
      mesh.visible = true; scene.addChild(mesh)
      renderer.render({ container: scene, target, clear: true })
    } finally { mesh.visible = visible; parent.addChildAt(mesh,index); scene.destroy(); target.destroy(true) }
  }
  update(width: number, height: number, seconds: number, lighting?: ShipLightingFrame) {
    const u = this.parameters.uniforms
    u.uViewport[0] = width; u.uViewport[1] = height
    u.uFocal = raidCameraFocal(width); u.uTravel = planetFlightTravel(seconds)
    if (lighting) {
      u.uSun[0] = -lighting.sun[1]; u.uSun[1] = -lighting.sun[0]; u.uSun[2] = lighting.sun[2]
      u.uKey.set(lighting.keyColor); u.uSky.set(lighting.skyColor); u.uBounce.set(lighting.groundColor)
    }
  }
  destroy() { this.mesh.shader!.destroy(); this.mesh.geometry.destroy(true); this.mesh.destroy() }
}
