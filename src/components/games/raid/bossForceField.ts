import { Mesh, OrthographicCamera, PlaneGeometry, Scene, ShaderMaterial, Vector2, Vector4, WebGLRenderTarget } from 'three'
import type { Camera, WebGLRenderer } from 'three'
import type { PilotHullProtection } from './liveHullBridge'

export const BOSS_FORCE_FIELD_LAYER = 6
export const PILOT_FORCE_FIELD_LAYER = 7

export type PilotFieldFrame = PilotHullProtection & {
  x: number; y: number; size: number; extent: number; angle: number
}

/** Trace the rendered hull alpha, including animated appendages and camera banking. */
export class BossForceField {
  private readonly mask = new WebGLRenderTarget(1, 1)
  private readonly scene = new Scene()
  private readonly camera = new OrthographicCamera()
  private readonly geometry = new PlaneGeometry(2, 2)
  private readonly material = new ShaderMaterial({
    transparent: true, depthTest: false, depthWrite: false, toneMapped: false,
    uniforms: {
      hullMask: { value: this.mask.texture },
      pixel: { value: new Vector2(1, 1) },
      strength: { value: 0 },
      time: { value: 0 },
      region: { value: new Vector4(0, 0, 1, 1) },
      pilot: { value: new Vector4() },
      heading: { value: new Vector2(1, 0) },
    },
    vertexShader: `
      uniform vec4 region;
      varying vec2 screenUv;
      varying vec2 localUv;
      void main() {
        screenUv = region.xy + uv * region.zw;
        localUv = (uv - .5) * region.zw;
        gl_Position = vec4(screenUv * 2. - 1., 0., 1.);
      }
    `,
    fragmentShader: `
      uniform sampler2D hullMask;
      uniform vec2 pixel;
      uniform float strength;
      uniform float time;
      uniform vec4 pilot;
      uniform vec2 heading;
      varying vec2 screenUv;
      varying vec2 localUv;
      float hull(vec2 at) {
        if (at.x < 0. || at.x > 1. || at.y < 0. || at.y > 1.) return 0.;
        return texture2D(hullMask, at).a;
      }
      float nearby(vec2 uv, float distance) {
        vec2 d = pixel * distance;
        vec2 diag = d * .7071068;
        float axial = max(max(hull(uv + vec2(d.x, 0.)), hull(uv - vec2(d.x, 0.))),
          max(hull(uv + vec2(0., d.y)), hull(uv - vec2(0., d.y))));
        float diagonal = max(max(hull(uv + diag), hull(uv - diag)),
          max(hull(uv + vec2(diag.x, -diag.y)), hull(uv + vec2(-diag.x, diag.y))));
        return max(axial, diagonal);
      }
      void main() {
        float center = hull(screenUv);
        if (center > .96) discard;
        bool isPilot = pilot.z > 0.;
        bool hasField = pilot.x > 0.;
        bool hasShield = pilot.y > 0.;
        bool linked = hasField && hasShield;
        float shell = isPilot ? pilot.z : 1.;
        float width = isPilot && hasShield ? 1.28 : 1.;
        float far = nearby(screenUv, 9. * shell * width);
        if (far < .02) discard;
        float glass = nearby(screenUv, 5.5 * shell * width);
        float rim = max(0., nearby(screenUv, 7. * shell * width) - glass);
        vec2 p = screenUv / pixel;
        if (isPilot) {
          p = localUv / pixel;
          p = vec2(dot(p, heading), dot(p, vec2(-heading.y, heading.x)));
        }
        vec2 scale = vec2(1., 1.73205);
        vec2 a = mod(p / 11., scale) - scale * .5;
        vec2 b = mod(p / 11. - scale * .5, scale) - scale * .5;
        vec2 cell = abs(dot(a,a) < dot(b,b) ? a : b);
        float hex = smoothstep(.415, .49, max(cell.x, dot(cell, vec2(.5, .866))));
        float sweep = pow(max(0., sin(p.y * .022 + p.x * .012 - time * .004)), 10.);
        float alpha = (far * .11 + glass * (.13 + hex * .27) + rim * (.66 + .23 * sweep))
          * (1. - center) * strength;
        float edge = clamp(rim + hex * .32, 0., 1.);
        vec3 base = vec3(.20, .78, .77);
        vec3 light = vec3(.70, 1., .99);
        if (linked) {
          base = vec3(.55, .34, .94);
          light = vec3(.90, .79, 1.);
        } else if (hasShield) {
          base = vec3(.92, .54, .13);
          light = vec3(1., .93, .67);
        }
        vec3 color = mix(base, light, edge);
        if (linked) {
          float inner = max(0., nearby(screenUv, 5.5 * shell) - nearby(screenUv, 3.5 * shell));
          float gold = inner * (.36 + .15 * sweep) * (1. - center) * strength;
          color = mix(color, vec3(1., .87, .48), gold / max(.001, alpha + gold));
          alpha += gold * (1. - alpha);
        }
        gl_FragColor = vec4(color, alpha);
      }
    `,
  })

  constructor() {
    const quad = new Mesh(this.geometry, this.material)
    quad.frustumCulled = false
    this.scene.add(quad)
  }

  prepare(renderer: WebGLRenderer) {
    return renderer.compileAsync(this.scene, this.camera)
  }

  resize(renderer: WebGLRenderer, width: number, height: number) {
    const scale = Math.min(.6, 640 / Math.max(width, height))
    this.mask.setSize(Math.max(1, Math.ceil(width * scale)), Math.max(1, Math.ceil(height * scale)))
    this.material.uniforms.pixel.value.set(1 / width, 1 / height)
    renderer.initRenderTarget(this.mask)
  }

  draw(renderer: WebGLRenderer, world: Scene, camera: Camera, strength: number, time: number, pilot?: PilotFieldFrame) {
    const layers = camera.layers.mask
    const autoClear = renderer.autoClear
    const autoReset = renderer.info.autoReset
    const uniforms = this.material.uniforms
    let layer = BOSS_FORCE_FIELD_LAYER
    if (pilot) {
      layer = PILOT_FORCE_FIELD_LAYER
      const { field, shield, size, extent, x, y, angle } = pilot
      const px = uniforms.pixel.value.x, py = uniforms.pixel.value.y
      uniforms.region.value.set((x - extent) * px, 1 - (y + extent) * py, extent * 2 * px, extent * 2 * py)
      uniforms.pilot.value.set(field, shield, Math.max(.55, Math.min(1.4, size / 145)), 0)
      uniforms.heading.value.set(Math.cos(angle), Math.sin(angle))
    } else {
      uniforms.region.value.set(0, 0, 1, 1)
      uniforms.pilot.value.set(0, 0, 0, 0)
    }
    try {
      renderer.info.autoReset = false
      camera.layers.set(layer)
      renderer.setRenderTarget(this.mask)
      renderer.autoClear = true
      renderer.render(world, camera)
      renderer.setRenderTarget(null)
      renderer.autoClear = false
      uniforms.strength.value = strength
      uniforms.time.value = time
      renderer.render(this.scene, this.camera)
    } finally {
      camera.layers.mask = layers
      renderer.setRenderTarget(null)
      renderer.autoClear = autoClear
      renderer.info.autoReset = autoReset
    }
  }

  dispose() {
    this.mask.dispose()
    this.geometry.dispose()
    this.material.dispose()
  }
}
