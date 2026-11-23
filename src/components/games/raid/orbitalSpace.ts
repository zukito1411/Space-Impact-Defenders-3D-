import { Geometry, GlProgram, Mesh, MeshGeometry, RenderTexture, Shader, Sprite, Texture, UniformGroup } from 'pixi.js'
import { OrbitalAtmosphere, OrbitalSurface } from './orbitalBodies'
import { SpaceCamera, SPACE_DISTANCES } from './spaceWorld'
import type { Renderer } from 'pixi.js'
import type { SpacePlacement } from './spaceWorld'
import { STAR_VARIABILITY_GLSL } from './starVariability'

// Author the initial composition once, then project persistent kilometre positions.
export class OrbitalCamera extends SpaceCamera {
  project(node: Sprite, out: SpacePlacement, width: number, height: number, epoch: number,
    physicalWidthKm = 0, radiusKm = 0, scripted = false, fixed = false) {
    const refresh = !out.admitted || out.texture !== node.texture.uid || out.epoch !== epoch
    const resumed = out.admitted && out.lastFrame < this.frame - 1
    if (out.mode === 'scripted' && !fixed && (refresh || resumed)) out.pendingEntry = true
    if (refresh || scripted || out.mode === 'scripted' && !fixed) {
      this.admit(out, node.x, node.y, node.width, node.height, width, height,
        node.texture.uid, epoch, physicalWidthKm, radiusKm, node.rotation)
    }
    this.advance(out)
    if (resumed && !refresh && out.mode === 'stream' && !fixed) this.recycle(out, width, height, false)
    let distance = this.relativeDistance(out)
    // Nearby scenery exits behind the ship, then returns beyond the leading
    // edge. It never reappears at the centre or accelerates toward the camera.
    const marginKm = Math.hypot(out.widthKm,out.heightKm)*.6 + 96*distance/this.focal
    const behind = out.yKm-this.positionKm[1]-marginKm > height*.5*distance/this.focal
    if (out.mode === 'stream' && !scripted && !fixed && (distance <= SPACE_DISTANCES.nearClipKm || behind)) {
      this.recycle(out, width, height)
      distance = this.relativeDistance(out)
    }
    if (distance <= SPACE_DISTANCES.nearClipKm) { node.visible = false; return }
    const pixelsPerKm = this.focal / distance
    node.position.set(width * .5 + (out.xKm - this.positionKm[0]) * pixelsPerKm,
      height * .5 + (out.yKm - this.positionKm[1]) * pixelsPerKm)
    // Respect any authored reflection, while deriving scale from physical span.
    node.scale.set(Math.sign(node.scale.x || 1) * out.widthKm * pixelsPerKm / node.texture.width,
      Math.sign(node.scale.y || 1) * out.heightKm * pixelsPerKm / node.texture.height)
    node.rotation = out.roll
    if (out.mode === 'stream' && !scripted && !fixed && !this.reducedMotion) {
      const fade = Math.min(1, out.ageSeconds / .6)
      node.alpha *= fade * fade * (3 - 2 * fade)
    }
    // Conservative frustum culling: keep close/off-axis surfaces and their rims.
    const ratio = Math.min(.975, (radiusKm || out.widthKm * .5) / distance)
    const extentX = node.width * .6 / (1 - ratio), extentY = node.height * .6 / (1 - ratio)
    if (out.pendingEntry) {
      // Timed flybys first become eligible with their whole footprint outside
      // the view. Subsequent frames carry them across the edge continuously.
      const outside = node.x + extentX < 0 || node.x - extentX > width ||
        node.y + extentY < 0 || node.y - extentY > height
      if (outside) out.pendingEntry = false
      else node.visible = false
    }
    if (node.x + extentX < -64 || node.x - extentX > width + 64 ||
      node.y + extentY < -64 || node.y - extentY > height + 64) node.visible = false
  }
}

const quadVertex = `
precision highp float;
attribute vec2 aPosition;
uniform mat3 uProjectionMatrix, uWorldTransformMatrix, uTransformMatrix;
uniform vec4 uColor, uWorldColorAlpha;
varying vec2 uv;
varying vec4 tint;
void main() {
  uv = aPosition;
  tint = uColor * uWorldColorAlpha;
  gl_Position = vec4((uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix * vec3(aPosition,1.)).xy,0.,1.);
}`

// Retain the authored rings outside the globe. The globe itself is a lit,
// rotating three-dimensional surface, sharing this atlas and renderer.
const ringFragment = `
precision highp float;
varying vec2 uv;
varying vec4 tint;
uniform sampler2D uArt;
uniform vec4 uFrame;
uniform vec2 uDisc;
void main() {
  if (length((uv-.5)/uDisc) < .998) discard;
  gl_FragColor = texture2D(uArt,uFrame.xy+uv*uFrame.zw)*tint;
}`

type GlobeStyle = { radiusKm: number; radius: number; air: number[]; swing: number; weather?: number; lava?: boolean; astrophage?: boolean; phaseZ?: number }
export const globeStyles = {
  ocean: { radiusKm: 6400, radius: .481, air: [.42,.40,1.], swing: .42, weather: .72 },
  volcanic: { radiusKm: 5100, radius: .482, air: [1.,.31,.10], swing: .36, lava: true },
  earth: { radiusKm: 6400, radius: .447, air: [.25,.66,1.], swing: .32, weather: .64 },
  blue: { radiusKm: 7200, radius: .446, air: [.18,.63,1.], swing: .34, weather: .48 },
  // The source rings cross the near hemisphere. Keep that texture registration fixed.
  ring: { radiusKm: 58000, radius: .29, air: [.94,.67,.33], swing: 0 },
  ringLandmark: { radiusKm: 58000, radius: .239, air: [1.,.63,.25], swing: 0 },
  violet: { radiusKm: 4600, radius: .478, air: [.72,.39,1.], swing: .33 },
  green: { radiusKm: 8800, radius: .488, air: [.38,.78,.95], swing: .32, weather: .42 },
  gold: { radiusKm: 7200, radius: .492, air: [1.,.53,.12], swing: .28, lava: true },
  adrian: { radiusKm: 10700, radius: .478, air: [.26,.56,.48], swing: .31, astrophage: true, phaseZ: -.28 },
  nebula: { radiusKm: 6100, radius: .476, air: [.34,.62,1.], swing: .30 },
} satisfies Record<string, GlobeStyle>

function writeFrame(out: Float32Array, texture: Texture) {
  const { frame, source } = texture
  out.set([frame.x/source.width, frame.y/source.height, frame.width/source.width, frame.height/source.height])
}

export class OrbitalGlobe {
  private readonly surface = new OrbitalSurface()
  private readonly atmosphere = new OrbitalAtmosphere()
  readonly mesh = this.surface.mesh
  private readonly params = new UniformGroup({
    uFrame: { value: new Float32Array(4), type: 'vec4<f32>' },
    uDisc: { value: new Float32Array(2), type: 'vec2<f32>' },
  })
  private readonly shader = new Shader({ glProgram: GlProgram.from({ vertex: quadVertex, fragment: ringFragment }),
    resources: { rings: this.params, uArt: Texture.WHITE.source } })
  private readonly rings = new Mesh({ geometry: new MeshGeometry({}), shader: this.shader })
  private style: GlobeStyle = globeStyles.ocean
  private readonly phaseLight = new Float32Array(3)

  constructor(readonly anchor: Sprite) {
    this.rings.pivot.set(.5)
    this.rings.visible = false
    const parent = anchor.parent!, index = parent.getChildIndex(anchor)
    parent.addChildAt(this.mesh, index)
    parent.addChildAt(this.atmosphere.mesh, index + 1)
    parent.addChildAt(this.rings, index + 2)
  }
  update(seconds: number, styleFor: (texture: Texture) => GlobeStyle, enabled = true, distanceKm = 0, camera?: OrbitalCamera, weather?: Texture) {
    const sprite = this.anchor, mesh = this.mesh
    mesh.visible = enabled && sprite.visible
    sprite.renderable = !enabled
    this.rings.visible = false
    this.atmosphere.mesh.visible = mesh.visible
    if (!mesh.visible) return
    const texture = sprite.texture
    if (mesh.texture !== texture) {
      this.surface.setTexture(texture)
      this.rings.texture = texture
      this.shader.resources.uArt = texture.source
      writeFrame(this.params.uniforms.uFrame, texture)
      this.style = styleFor(texture)
    }
    const rx = this.style.radius, ry = rx * texture.width / texture.height
    this.surface.setWeather(weather, seconds, this.style.weather ?? 0)
    this.surface.setAstrophage(this.style.astrophage ? .92 + .08 * Math.sin(seconds * 1.12) : 0)
    let light = camera?.sunDirection
    if (light && this.style.phaseZ !== undefined) {
      // Keep the scene's sun bearing and show the distant planet's terminator.
      this.phaseLight.set(light)
      this.phaseLight[2] = Math.min(light[2], this.style.phaseZ)
      light = this.phaseLight
    }
    if (light) this.surface.setLight(light)
    this.surface.setPerspective(distanceKm > 0 ? Math.min(.975, this.style.radiusKm / distanceKm) : 0,
      camera ? (sprite.x - camera.width * .5) / camera.focal : 0,
      camera ? (sprite.y - camera.height * .5) / camera.focal : 0, sprite.rotation)
    this.surface.pose(this.style.swing === 0 ? 0 : seconds*.008+this.style.swing,
      this.style.swing*.12, rx, ry, this.style.air, this.style.lava)
    mesh.position.copyFrom(sprite.position)
    mesh.scale.set(sprite.width, sprite.height)
    mesh.rotation = sprite.rotation
    mesh.alpha = sprite.alpha
    mesh.tint = sprite.tint
    mesh.zIndex = sprite.zIndex
    const halo = this.atmosphere.mesh
    this.atmosphere.pose(rx, ry, distanceKm > 0 ? this.style.radiusKm / distanceKm : 0,
      camera ? (sprite.x-camera.width*.5)/camera.focal : 0,
      camera ? (sprite.y-camera.height*.5)/camera.focal : 0, sprite.rotation, this.style.air, light)
    halo.position.copyFrom(sprite.position); halo.scale.set(sprite.width, sprite.height)
    halo.rotation = sprite.rotation; halo.alpha = sprite.alpha; halo.tint = sprite.tint
    halo.zIndex = sprite.zIndex + .0005
    if (this.style === globeStyles.ring || this.style === globeStyles.ringLandmark) {
      this.rings.visible = true
      this.params.uniforms.uDisc[0] = rx
      this.params.uniforms.uDisc[1] = ry
      this.rings.position.copyFrom(sprite.position)
      this.rings.scale.set(sprite.width, sprite.height)
      this.rings.rotation = sprite.rotation
      this.rings.alpha = sprite.alpha
      this.rings.tint = sprite.tint
      this.rings.zIndex = sprite.zIndex + .001
    }
  }
  setOccluders(first?: Float32Array, second?: Float32Array) { this.surface.setOccluders(first,second) }
  destroy() {
    this.surface.destroy()
    this.atmosphere.destroy()
    this.rings.geometry.destroy(true)
    this.shader.destroy()
    this.rings.destroy()
  }
}

// Trace three separated gas layers along the same view ray. Optical density
// comes from the hand-painted nebula, including its naturally clear pockets.
function gasGeometry() {
  const steps = 32
  const positions = new Float32Array((steps + 1) ** 2 * 2)
  const indices = new Uint32Array(steps * steps * 6)
  for (let y = 0; y <= steps; y++) {
    for (let x = 0; x <= steps; x++) {
      const i = y * (steps + 1) + x
      positions[i * 2] = x / steps
      positions[i * 2 + 1] = y / steps
      if (x < steps && y < steps) {
        const offset = (y * steps + x) * 6
        indices.set([i, i + 1, i + steps + 2, i, i + steps + 2, i + steps + 1], offset)
      }
    }
  }
  return new MeshGeometry({ positions, indices })
}

const gasVertex = quadVertex.replace('void main()', `
uniform vec2 uView;
uniform vec3 uEye;
varying vec2 distantUV, midUV, nearUV;
void main()`).replace('  uv = aPosition;', `
  uv = aPosition;
  vec2 slope = (aPosition-.5)*uView;
  vec3 ray = normalize(vec3(slope,1.));
  distantUV = .5 + ray.xy*.99 + uEye.xy*.006;
  midUV = .5 + (slope*(8.-uEye.z)+uEye.xy)*.092;
  nearUV = .5 + (slope*(4.-uEye.z)+uEye.xy)*.137 + vec2(.08,-.055);
`)

const skyFragment = `
precision highp float;
varying vec2 uv;
varying vec4 tint;
uniform sampler2D uArt;
uniform vec4 uFrame;
uniform vec2 uView;
uniform float uGalaxy;
uniform float uTime, uVariability;
uniform sampler2D uStarMap;
uniform vec3 uEye;
varying vec2 distantUV, midUV, nearUV;
${STAR_VARIABILITY_GLSL}
vec3 nebula(vec2 p) {
  return texture2D(uArt,uFrame.xy + clamp(p,.002,.998)*uFrame.zw).rgb;
}
void main() {
  if (uGalaxy > .5) {
    // Integrate through an inclined stellar disc in local XYZ. Camera offsets
    // change the line of sight through the nucleus and its separate dust layers.
    vec2 p = (uv-.5)*2.;
    vec3 ray = normalize(vec3((p-uView)*.16,-1.));
    vec3 origin = vec3(p+uEye.xy*.012,2.);
    float tilt = .25 + clamp(uView.y,-.5,.5)*.18;
    float c = cos(tilt), s = sin(tilt);
    ray.yz = mat2(c,-s,s,c)*ray.yz;
    origin.yz = mat2(c,-s,s,c)*origin.yz;
    float middle = -origin.z/min(-.001,ray.z);
    vec4 sum = vec4(0.);
    float transmission = 1.;
    for (int i=0; i<8; i++) {
      float depth = (float(i)/7.-.5)*.18;
      vec3 point = origin+ray*(middle+depth);
      vec2 st = clamp(.5+point.xy*.5,.002,.998);
      vec4 layer = texture2D(uArt,uFrame.xy+st*uFrame.zw);
      float edge = 1.-smoothstep(.7,1.25,length(point.xy));
      float density = exp(-abs(point.z)*18.)*edge;
      // Front-to-back extinction separates the luminous stellar disc from
      // the dark dust lanes, using the same eight authored-art samples.
      float luminance = dot(layer.rgb,vec3(.2126,.7152,.0722));
      float dust = (1.-smoothstep(.035,.32,luminance))*layer.a;
      float opacity = density*(.15+dust*.32);
      sum += layer*(density*.23*transmission);
      transmission *= 1.-clamp(opacity,0.,.8);
    }
    sum.rgb *= 1.25+.28*exp(-dot(p,p)*5.);
    // Compact stars painted into the galaxy also dim and flare individually.
    // A precomputed map avoids high-pass filtering or extra passes in flight.
    vec2 stellarUV = clamp(.5+(origin+ray*middle).xy*.5,.002,.998);
    vec3 stellar = texture2D(uStarMap,uFrame.xy+stellarUV*uFrame.zw).rgb;
    float seed = (stellar.g*255.+stellar.b*65280.)/65535.;
    sum.rgb *= 1.+stellar.r*(starBrightness(seed,uTime,uVariability)-1.);
    sum.a = clamp(sum.a,0.,1.);
    gl_FragColor = sum*tint;
    return;
  }
  vec3 distant = nebula(distantUV);
  vec3 gas = nebula(midUV);
  vec3 veil = nebula(nearUV);
  float density = smoothstep(.12,.72,max(max(gas.r,gas.g),gas.b));
  float nearDensity = smoothstep(.09,.64,max(veil.r,max(veil.g,veil.b)));
  // The near veil absorbs background light before scattering its own color.
  // Clear pockets retain the original authored nebula rather than a flat wash.
  vec3 color = distant*(1.-density*.2)*(1.-nearDensity*.16);
  color += gas*(.25+.18*density) + veil*(.07+.14*nearDensity);
  float luma = dot(color,vec3(.2126,.7152,.0722));
  color = max(vec3(0.),mix(vec3(luma),color,1.16));
  // Deepen low-density gaps while preserving luminous cloud rims and detail.
  // Existing stars render above this gas, so their peaks stay bright in the void.
  color *= mix(.26,1.,smoothstep(.06,.30,luma));
  float noise = fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(.06711056,.00583715))))-.5;
  color = clamp(color+noise/255.,0.,1.);
  gl_FragColor = vec4(color,1.) * tint;
}`

export class CosmicGasVolume {
  private readonly params = new UniformGroup({
    uView: { value: new Float32Array(2), type:'vec2<f32>' },
    uGalaxy: { value: 0, type:'f32' },
    uTime: { value: 0, type:'f32' }, uVariability: { value: 1, type:'f32' },
    uEye: { value: new Float32Array(3), type:'vec3<f32>' },
    uFrame: { value: new Float32Array(4), type:'vec4<f32>' },
  })
  private readonly shader: Shader
  readonly mesh: Mesh<MeshGeometry, Shader>
  constructor(readonly anchor: Sprite, private readonly galaxy = false) {
    this.params.uniforms.uGalaxy = galaxy ? 1 : 0
    const fragment = skyFragment.replace('uniform float uGalaxy;',
      `const float uGalaxy = ${galaxy ? '1.' : '0.'};`)
    this.shader = new Shader({ glProgram: GlProgram.from({ vertex: gasVertex, fragment }),
      resources: { volume: this.params, uArt: Texture.WHITE.source, uStarMap: Texture.EMPTY.source } })
    this.mesh = new Mesh({ geometry: galaxy ? new MeshGeometry({}) : gasGeometry(), shader: this.shader })
    if (galaxy) this.mesh.pivot.set(.5)
    this.mesh.visible = false
    anchor.parent!.addChildAt(this.mesh,anchor.parent!.getChildIndex(anchor))
  }
  update(width: number, height: number, camera: OrbitalCamera, enabled = true, starSeconds = 0, starMap?: Texture) {
    const {mesh,anchor} = this
    mesh.visible = enabled && anchor.visible
    anchor.renderable = !enabled
    if (!mesh.visible) return
    if (mesh.texture !== anchor.texture) {
      mesh.texture = anchor.texture
      this.shader.resources.uArt = anchor.texture.source
      writeFrame(this.params.uniforms.uFrame,anchor.texture)
    }
    this.params.uniforms.uTime = starSeconds*(camera.reducedMotion ? .22 : 1)
    this.params.uniforms.uVariability = camera.reducedMotion ? .35 : 1
    if (this.galaxy) this.shader.resources.uStarMap = (starMap ?? Texture.EMPTY).source
    this.params.uniforms.uView[0] = width/camera.focal
    this.params.uniforms.uView[1] = height/camera.focal
    this.params.uniforms.uEye.set(camera.eye)
    if (this.galaxy) {
      mesh.position.copyFrom(anchor.position)
      mesh.rotation = anchor.rotation
      mesh.scale.set(anchor.width, anchor.height)
      this.params.uniforms.uView[0] = (anchor.x-width*.5)/camera.focal
      this.params.uniforms.uView[1] = (anchor.y-height*.5)/camera.focal
    } else {
      mesh.scale.set(width, height)
    }
    mesh.alpha = anchor.alpha
    mesh.tint = anchor.tint
    mesh.zIndex = anchor.zIndex
  }
  warm(renderer: Renderer, target: RenderTexture, texture: Texture) {
    this.shader.resources.uArt = texture.source
    writeFrame(this.params.uniforms.uFrame,texture)
    const mesh = this.mesh, x = mesh.x, y = mesh.y, sx = mesh.scale.x, sy = mesh.scale.y, visible = mesh.visible
    mesh.visible = true; mesh.scale.set(8); mesh.position.set(this.galaxy ? 4 : 0)
    try { renderer.render({ container: mesh, target, clear: true }) }
    finally { mesh.visible = visible; mesh.position.set(x,y); mesh.scale.set(sx,sy) }
    // Normal update will bind the anchor's actual texture on first visibility.
  }
  destroy() {
    this.mesh.geometry.destroy(true)
    this.shader.destroy()
    this.mesh.destroy()
  }
}

const starVertex = `
precision highp float;
attribute vec2 aPosition;
attribute vec4 aStar;
uniform mat3 uProjectionMatrix, uWorldTransformMatrix, uTransformMatrix;
uniform vec3 uStarEye, uDustEye;
uniform vec2 uViewport;
uniform float uFocal, uTime, uDensity, uSpeed, uVariability;
varying vec2 corner;
varying vec3 spectrum;
varying float gain;
${STAR_VARIABILITY_GLSL}
void main() {
  corner = aPosition;
  bool dust = aStar.w < 0.;
  float seed = abs(aStar.w);
  if (seed > uDensity) {
    gain = 0.; spectrum = vec3(0.);
    gl_Position = vec4(2.,2.,0.,1.);
    return;
  }
  // Stars inhabit a fixed, distant catalogue. Only local dust recycles as
  // the camera crosses cells; stars never rush past the cockpit like debris.
  float z = dust ? aStar.z : aStar.z-uStarEye.z;
  if (z <= .08) {
    gain = 0.; spectrum = vec3(0.); gl_Position = vec4(2.,2.,0.,1.); return;
  }
  float distance = max(.08,z);
  // Depth-scaled cells wrap outside the viewport rather than in its middle.
  vec2 span = (uViewport+vec2(112.))*distance/uFocal;
  vec2 relative = dust ? mod(aStar.xy*span/17.-uDustEye.xy+span*.5,span)-span*.5
    : aStar.xy-uStarEye.xy;
  vec2 pos = .5*uViewport + relative*uFocal/distance;
  // Reject offscreen catalogue points before computing their radiance.
  if (pos.x < -48. || pos.y < -48. || pos.x > uViewport.x+48. || pos.y > uViewport.y+48.) {
    gain = 0.; spectrum = vec3(0.);
    gl_Position = vec4(2.,2.,0.,1.);
    return;
  }
  float magnitude = fract(seed*37.91);
  float size = clamp((.69 + 2.9*pow(magnitude,8.))*sqrt(6./distance),.70,5.5);
  if (dust) size = clamp(2.6/distance, .35, 2.6);
  float temperature = fract(seed*13.17);
  vec3 warm = mix(vec3(1.,.48,.24),vec3(1.,.91,.76),smoothstep(0.,.48,temperature));
  spectrum = mix(warm,vec3(.53,.74,1.),smoothstep(.48,1.,temperature));
  // Even the small star-shaped dust points dim and flare independently.
  gain = (.52+.48*magnitude) * starBrightness(seed,uTime,uVariability);
  if (dust) gain *= .30*smoothstep(.75,2.,z)*(1.-smoothstep(12.,15.7,z));
  vec2 direction = vec2(0.,1.);
  float streak = dust ? min(7.,uFocal*uSpeed*.025/distance) : 0.;
  vec2 offset = aPosition*size*2.4;
  offset += direction*dot(aPosition,direction)*streak;
  gl_Position = vec4((uProjectionMatrix*uWorldTransformMatrix*uTransformMatrix*vec3(pos+offset,1.)).xy,0.,1.);
}`
const starFragment = `
precision highp float;
varying vec2 corner;
varying vec3 spectrum;
varying float gain;
void main() {
  float r2 = dot(corner,corner);
  float core = exp(-23.*r2);
  // Bright peaks spread into the existing optical halo in the same star draw.
  float halo = .16+.10*min(1.5,max(0.,gain-1.));
  float light = (core + halo*exp(-5.6*r2)) * gain * (1.-smoothstep(.5184,1.,r2));
  gl_FragColor = vec4(mix(spectrum,vec3(1.),core*.62)*light,light);
}`

export class OrbitalStars {
  private readonly params = new UniformGroup({
    uStarEye: {value:new Float32Array(3),type:'vec3<f32>'},
    uDustEye: {value:new Float32Array(3),type:'vec3<f32>'},
    uViewport: {value:new Float32Array(2),type:'vec2<f32>'},
    uFocal: {value:1,type:'f32'},
    uSpeed: {value:0,type:'f32'},
    uTime: {value:0,type:'f32'}, uDensity: {value:1,type:'f32'},
    uVariability: {value:1,type:'f32'},
  })
  private readonly shader = new Shader({glProgram:GlProgram.from({vertex:starVertex,fragment:starFragment}),
    resources:{stars:this.params}})
  readonly mesh: Mesh<Geometry, Shader>
  constructor() {
    const starCount = 1650, count = starCount + 144, corners = new Float32Array(count*8), stars = new Float32Array(count*16)
    const indices = new Uint16Array(count*6)
    let state = 84717
    const random = () => { state = (Math.imul(state,1664525)+1013904223) >>> 0; return state/4294967296 }
    for (let i=0;i<count;i++) {
      const x=(random()-.5)*17, uniformY=(random()-.5)*17, z=.7+random()*15
      // A broad inclined galactic band sits inside the same fixed-size catalogue.
      // Remaining points preserve open space across portrait and landscape views.
      const bandY = x*.38+(random()+random()+random()-1.5)*2.7
      const y = i < starCount && i%5 < 2 ? bandY : uniformY
      const seed = i < starCount ? random() : -Math.max(.0001, random())
      for (let j=0;j<4;j++) stars.set([x,y,z,seed],i*16+j*4)
      corners.set([-1,-1,1,-1,1,1,-1,1],i*8)
      const v = i*4
      indices.set([v,v+1,v+2,v,v+2,v+3],i*6)
    }
    const geometry = new Geometry({attributes:{
      aPosition:{buffer:corners,format:'float32x2'}, aStar:{buffer:stars,format:'float32x4'},
    },indexBuffer:indices})
    this.mesh = new Mesh({geometry,shader:this.shader})
    this.mesh.blendMode = 'add'
  }
  warm(renderer: Renderer, target: RenderTexture) {
    const camera = new OrbitalCamera()
    camera.setView(8,8,0,0,false)
    this.update(8,8,camera,0,1)
    this.mesh.visible = true
    try { renderer.render({ container: this.mesh, target, clear: true }) }
    finally { this.mesh.visible = false }
  }
  update(width: number, height: number, camera: OrbitalCamera, seconds: number, density: number, reduced = false) {
    const u = this.params.uniforms
    u.uViewport[0] = width
    u.uViewport[1] = height
    u.uStarEye.set(camera.starEye)
    u.uDustEye.set(camera.dustEye)
    u.uFocal = camera.focal
    u.uTime = seconds * (reduced ? .22 : 1)
    u.uVariability = reduced ? .35 : 1
    u.uDensity = density
    u.uSpeed = camera.speed
  }
  destroy() {
    this.mesh.geometry.destroy(true)
    this.shader.destroy()
    this.mesh.destroy()
  }
}

/** Compile both specialized gas programs and the actual catalogue before flight. */
export function warmOrbitalSky(renderer: Renderer, stars: OrbitalStars, volumes: readonly CosmicGasVolume[], texture: Texture) {
  const target = RenderTexture.create({ width: 8, height: 8 })
  try {
    stars.warm(renderer,target)
    for (const volume of volumes) volume.warm(renderer,target,texture)
  } finally { target.destroy(true) }
}
