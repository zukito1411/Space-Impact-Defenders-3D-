import { Mesh, OrthographicCamera, PlaneGeometry, Scene, ShaderMaterial, Vector2, WebGLRenderTarget } from 'three'
import type { Camera, WebGLRenderer } from 'three'

export const BOSS_FORCE_FIELD_LAYER = 6

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
    },
    vertexShader: `
      varying vec2 screenUv;
      void main() {
        screenUv = uv;
        gl_Position = vec4(position.xy, 0., 1.);
      }
    `,
    fragmentShader: `
      uniform sampler2D hullMask;
      uniform vec2 pixel;
      uniform float strength;
      uniform float time;
      varying vec2 screenUv;
      float hull(vec2 at) { return texture2D(hullMask, at).a; }
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
        float far = nearby(screenUv, 9.);
        if (far < .02) discard;
        float glass = nearby(screenUv, 5.5);
        float rim = max(0., nearby(screenUv, 7.) - glass);
        vec2 p = screenUv / pixel;
        vec2 scale = vec2(1., 1.73205);
        vec2 a = mod(p / 11., scale) - scale * .5;
        vec2 b = mod(p / 11. - scale * .5, scale) - scale * .5;
        vec2 cell = abs(dot(a,a) < dot(b,b) ? a : b);
        float hex = smoothstep(.415, .49, max(cell.x, dot(cell, vec2(.5, .866))));
        float sweep = pow(max(0., sin(p.y * .022 + p.x * .012 - time * .004)), 10.);
        float alpha = (far * .11 + glass * (.13 + hex * .27) + rim * (.66 + .23 * sweep))
          * (1. - center) * strength;
        gl_FragColor = vec4(mix(vec3(.20, .78, .77), vec3(.70, 1., .99), clamp(rim + hex * .32, 0., 1.)), alpha);
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

  draw(renderer: WebGLRenderer, world: Scene, camera: Camera, strength: number, time: number) {
    const layers = camera.layers.mask
    const autoClear = renderer.autoClear
    const autoReset = renderer.info.autoReset
    try {
      renderer.info.autoReset = false
      camera.layers.set(BOSS_FORCE_FIELD_LAYER)
      renderer.setRenderTarget(this.mask)
      renderer.autoClear = true
      renderer.render(world, camera)
      renderer.setRenderTarget(null)
      renderer.autoClear = false
      this.material.uniforms.strength.value = strength
      this.material.uniforms.time.value = time
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
