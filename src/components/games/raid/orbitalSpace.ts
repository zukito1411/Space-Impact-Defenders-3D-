import { Geometry, GlProgram, Mesh, MeshGeometry, Shader, Sprite, Texture, UniformGroup } from 'pixi.js'

// Optical coordinates are in units of the focal length. The same camera drives
// the planets, the star catalogue, and the rays through the nebula.
export class OrbitalCamera {
  readonly eye = new Float32Array(3)
  focal = 1
  travel = 0
  speed = .09
  private previousSeconds: number | null = null
  setView(width: number, height: number, seconds: number, rush: number, reduced: boolean) {
    const dt = this.previousSeconds === null ? 0 : Math.max(0, Math.min(.05, seconds - this.previousSeconds))
    this.previousSeconds = seconds
    this.speed = reduced ? 0 : .09 + .20 * rush
    this.travel = (this.travel + dt * this.speed) % 15
    this.focal = Math.max(width, height) * .93
    this.eye[0] = reduced ? 0 : .18 * Math.sin(seconds * .054)
    this.eye[1] = reduced ? 0 : .11 * Math.sin(seconds * .039)
    this.eye[2] = reduced ? 0 : .08 * Math.sin(seconds * .044) + rush * .16
  }
  project(node: Sprite, depth: number, width: number, height: number) {
    const z = depth - this.eye[2]
    const magnification = depth / z
    node.position.set(width * .5 + ((node.x - width * .5) * depth - this.eye[0] * this.focal) / z,
      height * .5 + ((node.y - height * .5) * depth - this.eye[1] * this.focal) / z)
    node.scale.set(node.scale.x * magnification, node.scale.y * magnification)
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

// Orthographic ray/sphere intersection. The source images are painted discs,
// so project the rotated normal back into their original camera instead of
// treating the cutout (including its black corners) as a longitude map.
const planetFragment = `
precision highp float;
varying vec2 uv;
varying vec4 tint;
uniform sampler2D uArt;
uniform vec4 uFrame;
uniform vec3 uAir;
uniform vec2 uDisc;
uniform vec2 uSpin;
uniform float uLava;
vec4 art(vec2 p) { return texture2D(uArt, uFrame.xy + clamp(p, .001, .999) * uFrame.zw); }
void main() {
  vec4 plate = art(uv);
  if (plate.a < .001) discard;
  vec2 p = (uv - .5) / uDisc;
  float r = length(p);
  if (r >= 1.) { gl_FragColor = plate * tint; return; }
  vec3 n = vec3(p,sqrt(max(0.,1.-dot(p,p))));
  vec2 surface = vec2(uSpin.x*n.x+uSpin.y*n.z,n.y);
  vec4 sampleColor = art(.5 + surface * uDisc * .985);
  vec3 pigment = sampleColor.rgb / max(.025,sampleColor.a);
  float luma = dot(pigment,vec3(.2126,.7152,.0722));
  pigment = max(vec3(0.),mix(vec3(luma),pigment,1.17));
  vec3 sun = vec3(-.609187,-.495610,.619512);
  float incidence = dot(n,sun);
  float day = smoothstep(-.32,.88,incidence);
  vec3 surfaceLight = mix(vec3(.45,.48,.62),vec3(1.23,1.18,1.15),day);
  vec3 color = pigment * surfaceLight;
  float grazing = pow(1.-n.z,2.9) * (.22 + .78*smoothstep(-.48,.52,incidence));
  color += uAir * grazing * .60;
  // Atmospheric scattering follows the terminator as the painted globe turns.
  float twilight = 1.-smoothstep(.02,.30,abs(incidence));
  color += uAir * twilight * grazing * .24;
  float fissure = smoothstep(.05,.40,pigment.r-pigment.b) * uLava;
  color += pigment * fissure * (.24+.28*(1.-day));
  float blend = (1.-smoothstep(.976,1.,r))*plate.a;
  gl_FragColor = vec4(mix(plate.rgb,color*plate.a,blend),plate.a) * tint;
}`

type GlobeStyle = { radius: number; air: number[]; swing: number; lava?: boolean }
export const globeStyles = {
  ocean: { radius: .481, air: [.42,.40,1.], swing: .42 },
  volcanic: { radius: .482, air: [1.,.31,.10], swing: .36, lava: true },
  earth: { radius: .447, air: [.25,.66,1.], swing: .32 },
  blue: { radius: .446, air: [.18,.63,1.], swing: .34 },
  // The source rings cross the near hemisphere. Keep that texture registration fixed.
  ring: { radius: .29, air: [.94,.67,.33], swing: 0 },
  ringLandmark: { radius: .239, air: [1.,.63,.25], swing: 0 },
  violet: { radius: .478, air: [.72,.39,1.], swing: .33 },
  green: { radius: .488, air: [.38,.78,.95], swing: .32 },
  gold: { radius: .492, air: [1.,.53,.12], swing: .28, lava: true },
  nebula: { radius: .476, air: [.34,.62,1.], swing: .30 },
} satisfies Record<string, GlobeStyle>

function writeFrame(out: Float32Array, texture: Texture) {
  const { frame, source } = texture
  out.set([frame.x/source.width, frame.y/source.height, frame.width/source.width, frame.height/source.height])
}

export class OrbitalGlobe {
  private readonly params = new UniformGroup({
    uFrame: { value: new Float32Array(4), type: 'vec4<f32>' },
    uAir: { value: new Float32Array(3), type: 'vec3<f32>' },
    uDisc: { value: new Float32Array(2), type: 'vec2<f32>' },
    uSpin: { value: new Float32Array([1, 0]), type: 'vec2<f32>' }, uLava: { value: 0, type: 'f32' },
  })
  private readonly shader = new Shader({ glProgram: GlProgram.from({ vertex: quadVertex, fragment: planetFragment }),
    resources: { globe: this.params, uArt: Texture.WHITE.source } })
  readonly mesh = new Mesh({ geometry: new MeshGeometry({}), shader: this.shader })
  private style: GlobeStyle = globeStyles.ocean

  constructor(readonly anchor: Sprite) {
    this.mesh.pivot.set(.5)
    this.mesh.visible = false
    anchor.parent!.addChildAt(this.mesh, anchor.parent!.getChildIndex(anchor))
  }
  update(seconds: number, styleFor: (texture: Texture) => GlobeStyle) {
    const sprite = this.anchor, mesh = this.mesh
    mesh.visible = sprite.visible
    sprite.renderable = false
    if (!mesh.visible) return
    const texture = sprite.texture, u = this.params.uniforms
    if (mesh.texture !== texture) {
      mesh.texture = texture
      this.shader.resources.uArt = texture.source
      writeFrame(u.uFrame, texture)
      this.style = styleFor(texture)
      u.uAir.set(this.style.air)
      u.uDisc[0] = this.style.radius
      u.uDisc[1] = this.style.radius * texture.width / texture.height
      u.uLava = this.style.lava ? 1 : 0
    }
    const yaw = this.style.swing * Math.sin(seconds * .065)
    u.uSpin[0] = Math.cos(yaw)
    u.uSpin[1] = Math.sin(yaw)
    mesh.position.copyFrom(sprite.position)
    mesh.scale.set(sprite.width,sprite.height)
    mesh.rotation = sprite.rotation
    mesh.alpha = sprite.alpha
    mesh.zIndex = sprite.zIndex
  }
  destroy() {
    this.mesh.geometry.destroy(true)
    this.shader.destroy()
    this.mesh.destroy()
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
uniform vec3 uEye;
varying vec2 distantUV, midUV, nearUV;
vec3 nebula(vec2 p) {
  return texture2D(uArt,uFrame.xy + clamp(p,.002,.998)*uFrame.zw).rgb;
}
void main() {
  if (uGalaxy > .5) {
    // Intersect a shallow stellar disc. Integrate emissive dust through its
    // thickness; the nucleus has a longer optical path than the tapered rim.
    vec2 p = (uv-.5)*2.;
    float chord = sqrt(max(0.,1.-dot(p,p)));
    vec2 shear = (uView + uEye.xy*.17) * .038;
    vec4 sum = vec4(0.);
    for (int i=0; i<5; i++) {
      float z = (float(i)*.5-1.)*chord;
      vec2 st = clamp(.5 + (p*.5 + z*shear)/(1.+z*.023),.001,.999);
      sum += texture2D(uArt,uFrame.xy + st*uFrame.zw)*.2;
    }
    sum.rgb *= 1.+.44*chord*chord;
    gl_FragColor = sum*tint;
    return;
  }
  vec3 distant = nebula(distantUV);
  vec3 gas = nebula(midUV);
  vec3 veil = nebula(nearUV);
  float density = smoothstep(.12,.72,max(max(gas.r,gas.g),gas.b));
  vec3 color = mix(distant,gas,.33*density) + veil * (.09+.12*density);
  float luma = dot(color,vec3(.2126,.7152,.0722));
  color = max(vec3(0.),mix(vec3(luma),color,1.16));
  gl_FragColor = vec4(color,1.) * tint;
}`

export class CosmicGasVolume {
  private readonly params = new UniformGroup({
    uView: { value: new Float32Array(2), type:'vec2<f32>' },
    uGalaxy: { value: 0, type:'f32' },
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
      resources: { volume: this.params, uArt: Texture.WHITE.source } })
    this.mesh = new Mesh({ geometry: galaxy ? new MeshGeometry({}) : gasGeometry(), shader: this.shader })
    if (galaxy) this.mesh.pivot.set(.5)
    this.mesh.visible = false
    anchor.parent!.addChildAt(this.mesh,anchor.parent!.getChildIndex(anchor))
  }
  update(width: number, height: number, camera: OrbitalCamera) {
    const {mesh,anchor} = this
    mesh.visible = anchor.visible
    anchor.renderable = false
    if (!mesh.visible) return
    if (mesh.texture !== anchor.texture) {
      mesh.texture = anchor.texture
      this.shader.resources.uArt = anchor.texture.source
      writeFrame(this.params.uniforms.uFrame,anchor.texture)
    }
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
uniform vec3 uEye;
uniform vec2 uViewport;
uniform float uFocal, uTravel, uTime, uDensity, uSpeed;
varying vec2 corner;
varying vec3 spectrum;
varying float gain;
void main() {
  corner = aPosition;
  bool dust = aStar.w < 0.;
  float seed = abs(aStar.w);
  if (seed > uDensity) {
    gain = 0.; spectrum = vec3(0.);
    gl_Position = vec4(2.,2.,0.,1.);
    return;
  }
  float z = .7 + mod(aStar.z-uTravel,15.);
  float distance = max(.4,z-uEye.z);
  vec2 pos = .5*uViewport + (aStar.xy-uEye.xy)*uFocal/distance;
  // Reject offscreen catalogue points before computing their radiance.
  if (pos.x < -48. || pos.y < -48. || pos.x > uViewport.x+48. || pos.y > uViewport.y+48.) {
    gain = 0.; spectrum = vec3(0.);
    gl_Position = vec4(2.,2.,0.,1.);
    return;
  }
  float magnitude = fract(seed*37.91);
  float size = clamp((.69 + 2.9*pow(magnitude,8.))*sqrt(6./distance),.70,5.5);
  if (dust) size = clamp(2.6/distance, .35, 2.6);
  vec3 cool = vec3(.54,.76,1.);
  spectrum = mix(cool,vec3(1.,.78,.53),smoothstep(.55,.94,fract(seed*13.17)));
  gain = (.52+.48*magnitude) * (.94+.06*sin(uTime*.8+seed*80.))
    * smoothstep(.75,2.,z) * (1.-smoothstep(14.,15.7,z));
  if (dust) gain *= .30 * (1.-smoothstep(3.,8.,distance));
  vec2 radial = pos - .5*uViewport;
  vec2 direction = radial / max(1.,length(radial));
  float streak = min(7.,length(radial)*uSpeed*.035/distance);
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
  float light = (core + .16*exp(-5.6*r2)) * gain;
  gl_FragColor = vec4(mix(spectrum,vec3(1.),core*.62)*light,light);
}`

export class OrbitalStars {
  private readonly params = new UniformGroup({
    uEye: {value:new Float32Array(3),type:'vec3<f32>'},
    uViewport: {value:new Float32Array(2),type:'vec2<f32>'},
    uFocal: {value:1,type:'f32'}, uTravel: {value:0,type:'f32'},
    uSpeed: {value:0,type:'f32'},
    uTime: {value:0,type:'f32'}, uDensity: {value:1,type:'f32'},
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
      const x=(random()-.5)*17, y=(random()-.5)*17, z=random()*15
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
  update(width: number, height: number, camera: OrbitalCamera, seconds: number, density: number) {
    const u = this.params.uniforms
    u.uViewport[0] = width
    u.uViewport[1] = height
    u.uEye.set(camera.eye)
    u.uFocal = camera.focal
    u.uTime = seconds
    u.uTravel = camera.travel
    u.uDensity = density
    u.uSpeed = camera.speed
  }
  destroy() {
    this.mesh.geometry.destroy(true)
    this.shader.destroy()
    this.mesh.destroy()
  }
}
