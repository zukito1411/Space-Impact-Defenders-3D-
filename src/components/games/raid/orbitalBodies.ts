import { Container, Geometry, GlProgram, Mesh, MeshGeometry, RenderTexture, Shader, Texture, UniformGroup } from 'pixi.js'
import type { Renderer, Sprite } from 'pixi.js'
import type { AsteroidHazard } from './types'
import { raidObjectInView } from './visibility'
import type { RaidVisibilityBounds } from './visibility'

/** Sun and viewing direction are uniform across a body. Normalize them once
 * per pose instead of repeating these square roots for every shaded pixel. */
function writeOrbitalLight(sun: Float32Array, source: Float32Array, half?: Float32Array) {
  const scale=1/Math.max(1e-12,Math.hypot(source[0],source[1],source[2]))
  const x=source[0]*scale,y=source[1]*scale,z=source[2]*scale
  sun[0]=x;sun[1]=y;sun[2]=z
  if (half) {
    const rate=1/Math.max(1e-12,Math.hypot(x,y,z+1))
    half[0]=x*rate;half[1]=y*rate;half[2]=(z+1)*rate
  }
}

// These meshes share the existing Pixi context and painted surface textures.
// Buffers are built once, then only the camera/rotation uniforms change.
type SharedGeometry = { geometry: Geometry; references: number }
const geometries = new Map<number, SharedGeometry>()

function acquireGeometry(variant: number) {
  const cached = geometries.get(variant)
  if (cached) { cached.references++; return cached.geometry }
  const columns = 72, rows = 36, count = (columns + 1) * (rows + 1)
  const positions = new Float32Array(count * 2)
  const surface = new Float32Array(count * 3)
  const normals = new Float32Array(count * 3)
  const indices = new Uint16Array(columns * rows * 6)
  const radius = (x: number, y: number, z: number) => {
    if (variant < 0) return 1
    const seed = variant * 1.731
    // Smooth, non-axis-aligned relief gives rocks a changing silhouette.
    return .91 + .065 * Math.sin(x * 5.3 + y * 3.1 + seed) * Math.cos(z * 4.7 - seed)
      + .035 * Math.sin(x * 12.1 - z * 7.3 + seed) * Math.cos(y * 9.2 + z * 4.1)
      + .018 * Math.sin(x * 23.7 + y * 17.3) * Math.cos(z * 19.1 + seed)
  }
  for (let row = 0; row <= rows; row++) for (let col = 0; col <= columns; col++) {
    const latitude = row / rows * Math.PI, longitude = col / columns * Math.PI * 2
    const x = Math.sin(latitude) * Math.cos(longitude), y = Math.cos(latitude)
    const z = Math.sin(latitude) * Math.sin(longitude), r = radius(x, y, z)
    const i = row * (columns + 1) + col
    // aPosition supplies conservative 2D bounds; aSurface owns 3D projection.
    positions.set([.5 + x * .5, .5 + y * .5], i * 2)
    surface.set([x * r, y * r, z * r], i * 3)
    if (variant < 0) normals.set([x, y, z], i * 3)
    else {
      // Gradient of the radial field, evaluated only during admission.
      const e = .001, dx = (radius(x + e, y, z) - radius(x - e, y, z)) / (2 * e)
      const dy = (radius(x, y + e, z) - radius(x, y - e, z)) / (2 * e)
      const dz = (radius(x, y, z + e) - radius(x, y, z - e)) / (2 * e)
      const radial = dx * x + dy * y + dz * z
      const nx = x - (dx - radial * x) / r, ny = y - (dy - radial * y) / r
      const nz = z - (dz - radial * z) / r, length = Math.hypot(nx, ny, nz)
      normals.set([nx / length, ny / length, nz / length], i * 3)
    }
    if (row < rows && col < columns) {
      const offset = (row * columns + col) * 6
      indices.set([i, i + 1, i + columns + 2, i, i + columns + 2, i + columns + 1], offset)
    }
  }
  const geometry = new Geometry({ attributes: {
    aPosition: { buffer: positions, format: 'float32x2' },
    aSurface: { buffer: surface, format: 'float32x3' },
    aNormal: { buffer: normals, format: 'float32x3' },
  }, indexBuffer: indices })
  // The bounded library owns disposal; keep prewarmed buffers through long menus.
  geometry.autoGarbageCollect = false
  geometries.set(variant, { geometry, references: 1 })
  return geometry
}

const vertex = `
precision highp float;
attribute vec2 aPosition;
attribute vec3 aSurface, aNormal;
uniform mat3 uProjectionMatrix, uWorldTransformMatrix, uTransformMatrix;
uniform vec4 uColor, uWorldColorAlpha;
uniform vec2 uDisc, uYaw, uPitch, uViewSlope, uRoll;
uniform float uPerspective;
varying vec3 normal;
varying vec2 paint;
varying vec3 terrain;
varying float facing;
varying vec4 tint;
vec3 turn(vec3 p) {
  p = vec3(uYaw.x*p.x+uYaw.y*p.z,p.y,-uYaw.y*p.x+uYaw.x*p.z);
  return vec3(p.x,uPitch.x*p.y-uPitch.y*p.z,uPitch.y*p.y+uPitch.x*p.z);
}
void main() {
  vec3 p = turn(aSurface);
  vec3 n = turn(aNormal);
  facing = dot(n,vec3(-uViewSlope-p.xy*uPerspective,1.-p.z*uPerspective));
  terrain = normalize(aSurface);
  normal = vec3(uRoll.x*n.x-uRoll.y*n.y,uRoll.y*n.x+uRoll.x*n.y,n.z);
  // Original disc art supplies the surface identity, with mirrored rear paint.
  paint = .5 + aSurface.xy / max(.001,length(aSurface)) * uDisc * .965;
  vec2 screen = .5 + (p.xy+uViewSlope*p.z) * uDisc / (1.-p.z*uPerspective);
  tint = uColor*uWorldColorAlpha;
  // Keep paint and normals perspective correct on close orbital approaches.
  float clipW = max(.025,1.-p.z*uPerspective);
  vec2 projected = (uProjectionMatrix*uWorldTransformMatrix*uTransformMatrix*vec3(screen,1.)).xy;
  gl_Position = vec4(projected*clipW,0.,clipW);
}`

const fragment = `
precision highp float;
uniform sampler2D uArt;
uniform vec4 uFrame;
uniform vec3 uAir, uSun, uHalfLight;
uniform sampler2D uWeather;
uniform vec4 uWeatherFrame;
uniform vec2 uWeatherTurn;
uniform float uWeatherAmount;
uniform float uRock, uLava;
varying vec3 normal;
varying vec2 paint;
varying vec3 terrain;
varying float facing;
varying vec4 tint;
void main() {
  if (facing < 0.) discard;
  vec4 texel = texture2D(uArt,uFrame.xy+clamp(paint,.002,.998)*uFrame.zw);
  vec3 pigment = texel.rgb/max(.025,texel.a);
  vec3 n = normalize(normal), light = uSun;
  float incidence = dot(n,light), day = smoothstep(-.28,.85,incidence);
  vec3 color = pigment * mix(vec3(.34,.39,.51),vec3(1.22,1.16,1.09),day);
  float rim = pow(1.-max(0.,n.z),3.1);
  color += uAir*rim*(.16+.52*day)*(1.-uRock);
  float twilight = 1.-smoothstep(.02,.29,abs(incidence));
  color += uAir*twilight*rim*.2*(1.-uRock);
  float fissure = smoothstep(.05,.40,pigment.r-pigment.b)*uLava;
  color += pigment*fissure*(.24+.28*(1.-day));
  if (uRock < .5 && uWeatherAmount > .001) {
    vec3 p = normalize(terrain);
    // The cloud pattern turns separately from the painted ground, with no
    // texture uploads or weather geometry updates in flight.
    vec2 st = .5 + vec2(uWeatherTurn.x*p.x+uWeatherTurn.y*p.z,p.y)*.46;
    vec4 cloud = texture2D(uWeather,uWeatherFrame.xy+st*uWeatherFrame.zw);
    vec4 shadow = texture2D(uWeather,uWeatherFrame.xy+
      clamp(st+light.xy*.018,.002,.998)*uWeatherFrame.zw);
    float coverage = cloud.a*smoothstep(.32,.88,max(cloud.r,max(cloud.g,cloud.b)))*uWeatherAmount;
    float shade = shadow.a*smoothstep(.32,.88,max(shadow.r,max(shadow.g,shadow.b)))*uWeatherAmount;
    color *= 1.-shade*.24*day;
    vec3 cloudLight = mix(vec3(.23,.31,.44),vec3(1.12,1.09,1.04),day);
    color = mix(color,cloudLight,coverage*.62);
    float ocean = smoothstep(.04,.24,pigment.b-pigment.r)*(1.-coverage);
    float specular = pow(max(0.,dot(n,uHalfLight)),64.);
    color += vec3(.38,.57,.68)*specular*ocean;
  }
  // A restrained mineral glint leaves the original crater/terrain detail clear.
  float glint = pow(max(0.,dot(n,uHalfLight)),30.);
  color += vec3(.22,.20,.17)*glint*uRock;
  gl_FragColor = vec4(color,1.)*tint;
}`

export class OrbitalSurface {
  private readonly params = new UniformGroup({
    uFrame: { value: new Float32Array(4), type: 'vec4<f32>' },
    uDisc: { value: new Float32Array([.48, .48]), type: 'vec2<f32>' },
    uYaw: { value: new Float32Array([1, 0]), type: 'vec2<f32>' },
    uPitch: { value: new Float32Array([1, 0]), type: 'vec2<f32>' },
    uViewSlope: { value: new Float32Array(2), type: 'vec2<f32>' },
    uRoll: { value: new Float32Array([1, 0]), type: 'vec2<f32>' },
    uAir: { value: new Float32Array(3), type: 'vec3<f32>' },
    uSun: { value: new Float32Array([-.61, -.49, .62]), type: 'vec3<f32>' },
    uHalfLight: { value: new Float32Array(3), type: 'vec3<f32>' },
    uWeatherFrame: { value: new Float32Array([0, 0, 1, 1]), type: 'vec4<f32>' },
    uWeatherTurn: { value: new Float32Array([1, 0]), type: 'vec2<f32>' },
    uWeatherAmount: { value: 0, type: 'f32' },
    uRock: { value: 0, type: 'f32' }, uLava: { value: 0, type: 'f32' },
    uPerspective: { value: .055, type: 'f32' },
  })
  private readonly shader: Shader
  private weather: Texture | undefined
  readonly mesh: Mesh<Geometry, Shader>
  constructor(private readonly variant = -1) {
    // Separate compiled programs remove weather work entirely from every rock.
    this.shader = new Shader({ glProgram: GlProgram.from({ vertex,
      fragment: fragment.replace('uniform float uRock, uLava;',
        `const float uRock = ${variant < 0 ? '0.' : '1.'}; uniform float uLava;`) }),
      resources: { body: this.params, uArt: Texture.WHITE.source, uWeather: Texture.WHITE.source } })
    this.mesh = new Mesh({ geometry: acquireGeometry(variant), shader: this.shader })
    this.mesh.pivot.set(.5)
    this.mesh.visible = false
    this.mesh.eventMode = 'none'
    this.params.uniforms.uRock = variant < 0 ? 0 : 1
    if (variant >= 0) this.params.uniforms.uPerspective = .1
    this.setLight(this.params.uniforms.uSun)
  }
  setTexture(texture: Texture) {
    if (this.mesh.texture === texture) return
    this.mesh.texture = texture
    this.shader.resources.uArt = texture.source
    const { frame, source } = texture
    this.params.uniforms.uFrame.set([frame.x/source.width, frame.y/source.height,
      frame.width/source.width, frame.height/source.height])
  }
  setPerspective(radiusOverDistance: number, slopeX = 0, slopeY = 0, roll = 0) {
    const u = this.params.uniforms, c = Math.cos(roll), s = Math.sin(roll)
    u.uPerspective = Math.max(0, Math.min(.975, radiusOverDistance))
    u.uViewSlope[0] = slopeX * c + slopeY * s
    u.uViewSlope[1] = -slopeX * s + slopeY * c
    u.uRoll[0] = c; u.uRoll[1] = s
  }
  setLight(light: Float32Array) { writeOrbitalLight(this.params.uniforms.uSun,light,this.params.uniforms.uHalfLight) }
  setWeather(texture: Texture | undefined, seconds: number, amount: number) {
    const u = this.params.uniforms
    u.uWeatherAmount = texture ? amount : 0
    const angle = seconds * .009
    u.uWeatherTurn[0] = Math.cos(angle); u.uWeatherTurn[1] = Math.sin(angle)
    if (texture && texture !== this.weather) {
      this.weather = texture
      this.shader.resources.uWeather = texture.source
      const { frame, source } = texture
      u.uWeatherFrame.set([frame.x/source.width, frame.y/source.height,
        frame.width/source.width, frame.height/source.height])
    }
  }
  pose(yaw: number, pitch: number, radiusX: number, radiusY: number, air: readonly number[], lava = false) {
    const u = this.params.uniforms
    u.uYaw[0] = Math.cos(yaw); u.uYaw[1] = Math.sin(yaw)
    u.uPitch[0] = Math.cos(pitch); u.uPitch[1] = Math.sin(pitch)
    u.uDisc[0] = radiusX; u.uDisc[1] = radiusY
    u.uAir.set(air); u.uLava = lava ? 1 : 0
  }
  destroy() {
    this.mesh.destroy()
    this.shader.destroy()
    const entry = geometries.get(this.variant)
    if (entry && --entry.references === 0) {
      entry.geometry.destroy(true)
      geometries.delete(this.variant)
    }
  }
}

// A bounded quad traces the atmosphere's front shell analytically. It adds
// no second sphere buffer, framebuffer, blur, or screen-sized post-process.
const atmosphereVertex = `
precision highp float;
attribute vec2 aPosition;
uniform mat3 uProjectionMatrix, uWorldTransformMatrix, uTransformMatrix;
uniform vec4 uColor, uWorldColorAlpha, uBounds;
uniform vec2 uDisc;
varying vec2 shellPoint;
varying vec4 tint;
void main() {
  shellPoint = uBounds.xy+aPosition*uBounds.zw;
  vec2 local = .5+shellPoint*uDisc;
  tint = uColor*uWorldColorAlpha;
  gl_Position = vec4((uProjectionMatrix*uWorldTransformMatrix*uTransformMatrix*vec3(local,1.)).xy,0.,1.);
}`
const atmosphereFragment = `
precision highp float;
uniform vec2 uSlope, uRoll;
uniform float uPerspective;
uniform vec3 uAir, uSun;
varying vec2 shellPoint;
varying vec4 tint;
void main() {
  vec3 point = vec3(shellPoint,0.);
  vec3 towardEye = normalize(vec3(-shellPoint*uPerspective-uSlope,1.));
  float along = dot(point,towardEye);
  float closest2 = max(0.,dot(point,point)-along*along);
  const float outer = 1.018;
  if (closest2 >= outer*outer) discard;
  float shell = sqrt(max(0.,outer*outer-closest2));
  float ground = sqrt(max(0.,1.-closest2));
  float path = closest2 < 1. ? shell-ground : shell*2.;
  vec3 n = normalize(point+towardEye*(shell-along));
  n.xy = mat2(uRoll.x,uRoll.y,-uRoll.y,uRoll.x)*n.xy;
  float day = smoothstep(-.22,.7,dot(n,uSun));
  float optical = 1.-exp(-path*5.);
  float coverage = 1.-smoothstep(outer*outer-.004,outer*outer,closest2);
  float alpha = optical*(.12+.6*day)*coverage;
  vec3 color = mix(uAir*.45,uAir*1.3,day);
  gl_FragColor = vec4(color*alpha,alpha)*tint;
}`

export class OrbitalAtmosphere {
  private readonly params = new UniformGroup({
    uBounds: { value: new Float32Array(4), type: 'vec4<f32>' },
    uDisc: { value: new Float32Array(2), type: 'vec2<f32>' },
    uSlope: { value: new Float32Array(2), type: 'vec2<f32>' },
    uRoll: { value: new Float32Array([1, 0]), type: 'vec2<f32>' },
    uPerspective: { value: 0, type: 'f32' },
    uAir: { value: new Float32Array(3), type: 'vec3<f32>' },
    uSun: { value: new Float32Array([-.61, -.49, .62]), type: 'vec3<f32>' },
  })
  private readonly shader = new Shader({ glProgram: GlProgram.from({ vertex: atmosphereVertex, fragment: atmosphereFragment }),
    resources: { atmosphere: this.params } })
  readonly mesh = new Mesh({ geometry: new MeshGeometry({}), shader: this.shader })
  constructor() {
    this.mesh.pivot.set(.5); this.mesh.visible = false; this.mesh.eventMode = 'none'
    writeOrbitalLight(this.params.uniforms.uSun,this.params.uniforms.uSun)
  }
  pose(rx: number, ry: number, perspective: number, slopeX: number, slopeY: number,
    roll: number, air: readonly number[], light?: Float32Array) {
    const u = this.params.uniforms, c = Math.cos(roll), s = Math.sin(roll)
    const sx = slopeX*c+slopeY*s, sy = -slopeX*s+slopeY*c
    const k = Math.max(0,Math.min(.975,perspective)), r = 1.018, r2 = r*r
    const denominator = 1-r2*k*k
    const cx = r2*k*sx/denominator, cy = r2*k*sy/denominator
    const ex = r*Math.sqrt(denominator+sx*sx)/denominator
    const ey = r*Math.sqrt(denominator+sy*sy)/denominator
    u.uBounds[0] = cx-ex; u.uBounds[1] = cy-ey
    u.uBounds[2] = ex*2; u.uBounds[3] = ey*2
    u.uDisc[0] = rx; u.uDisc[1] = ry
    u.uSlope[0] = sx; u.uSlope[1] = sy
    u.uRoll[0] = c; u.uRoll[1] = s
    u.uPerspective = k; u.uAir.set(air)
    if (light) writeOrbitalLight(u.uSun,light)
  }
  destroy() { this.mesh.geometry.destroy(true); this.shader.destroy(); this.mesh.destroy() }
}

const ROCK_AIR = [0, 0, 0] as const
const NO_INCOMING_ASTEROIDS: readonly AsteroidHazard[] = []

/** A scenery slot may temporarily hold a wreck; only asteroid textures become 3D. */
export class OrbitalSceneryRock {
  private readonly surface: OrbitalSurface
  constructor(private readonly anchor: Sprite, private readonly index: number) {
    this.surface = new OrbitalSurface(index % 4)
    const parent = anchor.parent!
    parent.addChildAt(this.surface.mesh, parent.getChildIndex(anchor))
  }
  update(texture: Texture | undefined, seconds: number, focal: number, width: number, height: number, light?: Float32Array) {
    const { anchor, surface } = this, mesh = surface.mesh
    mesh.visible = anchor.visible && !!texture && anchor.texture === texture
    anchor.renderable = !mesh.visible
    if (!mesh.visible || !texture) return
    surface.setTexture(texture)
    if (light) surface.setLight(light)
    const roll = seconds * (.09 + this.index * .012) + this.index
    surface.setPerspective(Math.max(anchor.width, anchor.height) * .48 / focal,
      (anchor.x - width * .5) / focal, (anchor.y - height * .5) / focal, roll)
    surface.pose(seconds * (.07 + this.index * .004) + this.index * 1.73,
      Math.sin(seconds * .043 + this.index) * .55, .48, .48, ROCK_AIR)
    mesh.position.copyFrom(anchor.position)
    mesh.scale.set(anchor.width, anchor.height)
    mesh.rotation = roll
    mesh.alpha = anchor.alpha
    mesh.tint = anchor.tint
    mesh.zIndex = anchor.zIndex
  }
  destroy() { this.surface.destroy() }
}

/** Preallocated event rocks; simulation, splitting, and collision stay authoritative. */
export class OrbitalCombatRocks {
  readonly root = new Container()
  private readonly surfaces = Array.from({ length: 18 }, (_, i) => new OrbitalSurface(i % 4))
  private readonly free = [...this.surfaces]
  private readonly owners = new Map<number, OrbitalSurface>()
  private readonly drawn = new Set<number>()
  private readonly alive = new Set<number>()
  presented = false
  constructor() {
    this.root.eventMode = 'none'
    for (const surface of this.surfaces) this.root.addChild(surface.mesh)
  }
  update(texture: Texture | undefined, asteroids: readonly AsteroidHazard[], width: number, height: number,
    seconds: number, bounds: RaidVisibilityBounds, incoming: readonly AsteroidHazard[] = NO_INCOMING_ASTEROIDS, approach = 1, light?: Float32Array) {
    this.presented = false
    this.drawn.clear()
    if (!texture) {
      for (const surface of this.surfaces) surface.mesh.visible = false
      return
    }
    this.alive.clear()
    for (const asteroid of asteroids) this.alive.add(asteroid.id)
    for (const asteroid of incoming) this.alive.add(asteroid.id)
    for (const [id, surface] of this.owners) {
      if (this.alive.has(id)) continue
      surface.mesh.visible = false
      this.owners.delete(id)
      this.free.push(surface)
    }
    const focal = Math.max(width, height) * .93
    const p = Math.max(0, Math.min(1, approach))
    // Fixed physical size at a receding distance, then an exact entry-plane handoff.
    const incomingScale = 1 / (1 + 8 * (1 - p) * (1 - p))
    for (let pass = 0; pass < 2; pass++) {
      const list = pass === 0 ? asteroids : incoming
      for (const asteroid of list) {
        if (pass === 0 && !raidObjectInView(bounds, asteroid.x, asteroid.y, asteroid.radius + 5)) continue
        let surface = this.owners.get(asteroid.id)
        if (!surface) {
          surface = this.free.pop()
          if (surface) this.owners.set(asteroid.id, surface)
        }
        // Canvas retains authoritative hazards if an unexpected overflow occurs.
        if (!surface) continue
        const mesh = surface.mesh
        const nearSize = Math.max(30, asteroid.tier === 2 ? Math.min(width * .29, 280)
          : asteroid.tier === 1 ? Math.min(width * .16, 150) : Math.min(width * .085, 78))
        const scale = pass === 0 ? 1 : incomingScale, size = nearSize * scale
        const actualX = asteroid.x * width / 100, actualY = asteroid.y * height / 100
        const x = width * .5 + (actualX - width * .5) * scale
        const y = height * .42 + (actualY - height * .42) * scale
        surface.setTexture(texture)
        if (light) surface.setLight(light)
        surface.setPerspective(size * .48 / focal, (x - width * .5) / focal,
          (y - height * .5) / focal, asteroid.spin * Math.PI / 180)
        surface.pose(asteroid.phase + seconds * .085, Math.sin(asteroid.phase + seconds * .061) * .7,
          .48, .48, ROCK_AIR)
        mesh.position.set(x, y); mesh.scale.set(size, size * .9)
        mesh.rotation = asteroid.spin * Math.PI / 180
        mesh.alpha = pass === 0 ? 1 : Math.min(1, p / .12)
        mesh.visible = true
        this.drawn.add(asteroid.id)
      }
    }
    for (const [id, surface] of this.owners) if (!this.drawn.has(id)) surface.mesh.visible = false
  }
  has(id: number) { return this.presented && this.drawn.has(id) }
  destroy() {
    for (const surface of this.surfaces) surface.destroy()
    this.root.destroy()
    this.drawn.clear()
    this.alive.clear()
    this.owners.clear()
    this.free.length = 0
  }
}

/** Compile the real body shader and upload all shared buffers during loading. */
export function warmOrbitalBodies(renderer: Renderer, planet: Texture | undefined, rock: Texture | undefined, weather?: Texture) {
  const scene = new Container(), target = RenderTexture.create({ width: 8, height: 8 })
  const surfaces: OrbitalSurface[] = []
  const atmosphere = new OrbitalAtmosphere()
  try {
    for (let variant = -1; variant < 4; variant++) {
      const texture = variant < 0 ? planet : rock
      if (!texture) continue
      const surface = new OrbitalSurface(variant), mesh = surface.mesh
      surfaces.push(surface)
      surface.setTexture(texture)
      surface.pose(.1, .1, .48, .48, ROCK_AIR)
      if (variant < 0) surface.setWeather(weather, .1, .5)
      mesh.position.set(4, 4); mesh.scale.set(8); mesh.visible = true
      scene.addChild(mesh)
    }
    atmosphere.pose(.48, .48, .055, 0, 0, 0, [.25, .66, 1.])
    atmosphere.mesh.position.set(4, 4); atmosphere.mesh.scale.set(8); atmosphere.mesh.visible = true
    scene.addChild(atmosphere.mesh)
    renderer.render({ container: scene, target, clear: true })
  } finally {
    for (const surface of surfaces) surface.destroy()
    atmosphere.destroy()
    scene.destroy()
    target.destroy(true)
  }
}
