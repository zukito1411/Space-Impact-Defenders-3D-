import { rigMechHull, poseMechHull } from './mechHullRig'
import {
  DirectionalLight, Group, HemisphereLight, Mesh, MeshStandardMaterial,
  PerspectiveCamera, Scene, WebGLRenderer, type Object3D,
} from 'three'
import { acquireHull, loadHull, releaseHull, trimHullAssets } from './liveHullAssets'
import { bindLiveHulls, unbindLiveHulls, type LiveHullDraw, type LiveHullSink } from './liveHullBridge'

type HullNode = { key: string; group: Group; object: Object3D; used: number }

/** Transparent live mesh layer for player and support ships only.
 * The original 1.0.51 Pixi/Canvas renderers own scenery, enemies and combat FX. */
export class ThreeShipPresentation implements LiveHullSink {
  private renderer: WebGLRenderer | null = null
  private eclipseAt: ((x: number,y: number) => number) | undefined
  private readonly world = new Scene()
  private readonly camera = new PerspectiveCamera(35, 1, 1, 20000)
  private readonly hulls = new Map<string, HullNode>()
  private readonly requests = new Set<string>()
  private width = 1
  private height = 1
  private density = 1
  private frame = 0
  private disposed = false
  private contextLost = false
  private readonly lost = (event: Event) => {
    event.preventDefault(); this.contextLost = true
    this.reportError('Graphics context interrupted. Restoring the 3D scene…')
  }
  private readonly restored = () => {
    this.contextLost = false
    this.reportError(null)
  }
  private readonly reduced = window.matchMedia('(prefers-reduced-motion: reduce)')

  constructor(private readonly reportError: (message: string | null) => void = () => {}) {}

  async prepareHull(key: string) {
    await loadHull(key)
    const renderer = this.renderer
    if (!renderer || this.disposed) return
    const asset = acquireHull(key)
    if (!asset) return
    const warmup = new Scene()
    warmup.add(asset.object)
    try {
      asset.object.traverse(child => {
        if (child instanceof Mesh && child.material instanceof MeshStandardMaterial && child.material.map) {
          renderer.initTexture(child.material.map)
        }
      })
      await renderer.compileAsync(warmup, this.camera, this.world)
    } finally {
      releaseHull(key, asset.object)
    }
  }

  async init(host: HTMLDivElement) {
    if (this.disposed) return false
    try {
      const renderer = new WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' })
      this.renderer = renderer
      const context = renderer.getContext()
      if (!('beginQuery' in context)) throw new Error('Live 3D requires WebGL 2')
      renderer.setClearColor(0, 0)
      renderer.setPixelRatio(1)
      renderer.outputColorSpace = 'srgb'
      renderer.domElement.className = 'raid__ship-canvas'
      renderer.domElement.addEventListener('webglcontextlost', this.lost)
      renderer.domElement.addEventListener('webglcontextrestored', this.restored)
      this.world.add(new HemisphereLight(0xdcecff, 0x171c35, 2.1))
      const key = new DirectionalLight(0xfff0dc, 2.0)
      key.position.set(-800, 1100, 1800)
      const rim = new DirectionalLight(0x89bfff, 1.2)
      rim.position.set(1000, -600, 900)
      this.world.add(key, rim)
      host.replaceChildren(renderer.domElement)
      bindLiveHulls(this)
      await this.prepareHull('rocket')
      if (this.disposed) return false
      await renderer.compileAsync(this.world, this.camera)
      return !this.disposed
    } catch (error) {
      console.error('Live ship renderer initialization failed', error)
      this.reportError('The 3D ship renderer could not start. Reload to try again.')
      this.destroy()
      return false
    }
  }

  render(frame: { width: number; height: number; dpr: number; eclipseAt?: (x: number,y: number) => number }) {
    const renderer = this.renderer
    if (!renderer || this.disposed || this.contextLost) return false
    this.frame++
    if (frame.width !== this.width || frame.height !== this.height || frame.dpr !== this.density) {
      this.width = frame.width; this.height = frame.height; this.density = frame.dpr
      renderer.setSize(Math.ceil(this.width*this.density), Math.ceil(this.height*this.density), false)
      renderer.domElement.style.width = this.width + 'px'
      renderer.domElement.style.height = this.height + 'px'
      this.camera.aspect = this.width/this.height
      this.camera.position.set(this.width*.5, this.height*.5, this.height*.5/Math.tan(35*Math.PI/360))
      this.camera.updateProjectionMatrix()
    }
    this.eclipseAt = frame.eclipseAt
    for (const node of this.hulls.values()) node.group.visible = false
    return true
  }

  submitHull(draw: LiveHullDraw) {
    if (!this.renderer || this.disposed || this.contextLost) return false
    let node = this.hulls.get(draw.id)
    if (node && node.key !== draw.key) {
      this.releaseNode(node)
      this.hulls.delete(draw.id)
      node = undefined
    }
    if (!node) {
      const asset = acquireHull(draw.key)
      if (!asset) {
        if (!this.requests.has(draw.key)) {
          this.requests.add(draw.key)
          void loadHull(draw.key).catch(error => console.warn('Live hull load:', draw.key, error))
            .finally(() => this.requests.delete(draw.key))
        }
        return false
      }
      const group = new Group()
      group.add(asset.object)
      this.world.add(group)
      node = { key: draw.key, group, object: asset.object, used: this.frame }
      this.hulls.set(draw.id, node)
      group.userData.registration = asset.registration.registration
      // Copy only material state; mesh buffers and paint textures remain shared.
      asset.object.traverse(child => {
        if (child instanceof Mesh) {
          const materials = Array.isArray(child.material) ? child.material : [child.material]
          const owned = materials.map(material => { const copy = material.clone(); copy.alphaHash = true; return copy })
          child.material = Array.isArray(child.material) ? owned : owned[0]
        }
      })
    }
    const mech = draw.key === 'godGundam' || draw.key === 'godGundamBurning' || draw.key === 'spiegel'
    if (mech && !node.group.userData.rigged) {
      rigMechHull(node.object)
      node.group.userData.rigged = true
    }
    if (mech) poseMechHull(node.object, draw.attack ?? 0, draw.crouch ?? 0)
    node.used = this.frame
    const { group } = node
    group.visible = draw.alpha > .01
    const [sx, sy, ox, oy] = group.userData.registration as number[]
    group.position.set(draw.x + (144*sx+ox-224)*draw.size/448,
      this.height-draw.y + (224-144*sy-oy)*draw.size/448, 0)
    group.rotation.set(0, 0, draw.angle + (mech && draw.landscape ? (draw.crouch ?? 0)*Math.PI/2 : 0))
    group.scale.set(draw.size*sx/448, draw.size*sy/448, draw.size*sx/448)
    node.object.rotation.y = (draw.landscape ? -56*Math.PI/180 : 0) + (this.reduced.matches ? 0 : draw.bank * 150*Math.PI/180)
    node.object.traverse(child => {
      if (child instanceof Mesh) {
        const materials = Array.isArray(child.material) ? child.material : [child.material]
        for (const material of materials) if (material instanceof MeshStandardMaterial) {
          material.opacity = draw.alpha
          material.color.setScalar(1-.40*(this.eclipseAt?.(draw.x,draw.y) ?? 0))
        }
      }
    })
    return true
  }

  present() {
    if (!this.renderer || this.disposed || this.contextLost) return
    // One scene submission at the browser's native rAF rate.
    this.renderer.render(this.world, this.camera)
    for (const [id, node] of this.hulls) {
      if (this.frame-node.used < 120) continue
      this.releaseNode(node)
      this.hulls.delete(id)
    }
    trimHullAssets()
  }

  private releaseNode(node: HullNode) {
    node.object.traverse(child => {
      if (child instanceof Mesh) {
        const materials = Array.isArray(child.material) ? child.material : [child.material]
        for (const material of materials) material.dispose()
      }
    })
    releaseHull(node.key, node.object)
    node.group.removeFromParent()
  }

  getShipStats() {
    return { hulls: [...this.hulls.values()].filter(node => node.group.visible).length,
      textures: this.renderer?.info.memory.textures ?? 0,
      drawCalls: this.renderer?.info.render.calls ?? 0,
      triangles: this.renderer?.info.render.triangles ?? 0 }
  }

  destroy() {
    if (this.disposed) return
    this.disposed = true
    unbindLiveHulls(this)
    for (const node of this.hulls.values()) this.releaseNode(node)
    this.hulls.clear()
    if (this.renderer) {
      this.renderer.domElement.removeEventListener('webglcontextlost', this.lost)
      this.renderer.domElement.removeEventListener('webglcontextrestored', this.restored)
      this.renderer.dispose()
      this.renderer.forceContextLoss()
      this.renderer.domElement.remove()
      this.renderer = null
    }
  }
}
