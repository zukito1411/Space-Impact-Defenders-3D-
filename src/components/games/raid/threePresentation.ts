import { rigMechHull, poseMechHull } from './mechHullRig'
import { GpuTimer } from './ThreeGpuTimer'
import {
  Color, DirectionalLight, Group, HemisphereLight, Mesh, MeshStandardMaterial,
  PerspectiveCamera, Scene, WebGLRenderer, type Object3D,
} from 'three'
import { ThreeSpace } from './threeSpace'
import { ThreeActors } from './threeActors'
import { acquireHull, loadHull, releaseHull, trimHullAssets } from './liveHullAssets'
import { bindLiveHulls, unbindLiveHulls, type LiveHullDraw, type LiveHullSink } from './liveHullBridge'
import type { PixiRaidBackgroundFrame } from './background'
import type { RaidGpuForegroundFrame } from './gpuForeground'

type HullNode = { key: string; group: Group; object: Object3D; used: number }

/** Three.js presentation adapter, following Leighneron's single-renderer architecture.
 * The existing simulation remains authoritative for gameplay and network state. */
export class ThreeRaidPresentation implements LiveHullSink {
  private renderer: WebGLRenderer | null = null
  private timer: GpuTimer | null = null
  private measureGpu = false
  private readonly world = new Scene()
  private readonly camera = new PerspectiveCamera(35, 1, 1, 20000)
  private readonly space = new ThreeSpace()
  private readonly actors = new ThreeActors()
  private readonly hulls = new Map<string, HullNode>()
  private readonly requests = new Set<string>()
  private width = 1
  private height = 1
  private density = 1
  private frame = 0
  private disposed = false
  private contextLost = false
  private readonly lost = (event: Event) => {
    event.preventDefault(); this.contextLost = true; this.timer?.abandon()
    this.reportError('Graphics context interrupted. Restoring the 3D scene…')
  }
  private readonly restored = () => {
    const context = this.renderer?.getContext()
    if (context && 'beginQuery' in context) this.timer = new GpuTimer(context)
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
      const renderer = new WebGLRenderer({ alpha: false, antialias: true, powerPreference: 'high-performance' })
      this.renderer = renderer
      const context = renderer.getContext()
      if (!('beginQuery' in context)) throw new Error('Live 3D requires WebGL 2')
      this.timer = new GpuTimer(context)
      renderer.setClearColor(new Color(0x020510), 1)
      renderer.setPixelRatio(1)
      renderer.outputColorSpace = 'srgb'
      renderer.domElement.className = 'raid__pixi-background-canvas'
      renderer.domElement.addEventListener('webglcontextlost', this.lost)
      renderer.domElement.addEventListener('webglcontextrestored', this.restored)
      this.world.add(new HemisphereLight(0xdcecff, 0x171c35, 2.1))
      const key = new DirectionalLight(0xfff0dc, 2.0)
      key.position.set(-800, 1100, 1800)
      const rim = new DirectionalLight(0x89bfff, 1.2)
      rim.position.set(1000, -600, 900)
      this.world.add(key, rim, this.space.root, this.actors.root)
      host.replaceChildren(renderer.domElement)
      bindLiveHulls(this)
      await this.prepareHull('rocket')
      if (this.disposed) return false
      await renderer.compileAsync(this.world, this.camera)
      return !this.disposed
    } catch (error) {
      console.error('Live Three.js renderer initialization failed', error)
      this.reportError('Live 3D rendering could not start. Reload to try again.')
      this.destroy()
      return false
    }
  }

  render(frame: PixiRaidBackgroundFrame & { carrierBackdrop?: number; carrierShift?: number }) {
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
    this.space.update(frame)
    for (const node of this.hulls.values()) node.group.visible = false
    return true
  }

  renderForeground(frame: RaidGpuForegroundFrame) {
    if (!this.renderer || this.disposed || this.contextLost) return false
    this.measureGpu = frame.measureGpu
    this.actors.update(frame)
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
          material.color.setScalar(1-.40*this.space.eclipseAt(draw.x,draw.y))
        }
      }
    })
    return true
  }

  present() {
    if (!this.renderer || this.disposed || this.contextLost) return
    // One scene submission at the browser's native rAF rate.
    this.timer?.poll()
    this.timer?.begin(this.measureGpu)
    try { this.renderer.render(this.world, this.camera) } finally { this.timer?.end() }
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

  isEnemyGpuRendered(id: number) { return this.actors.hasEnemy(id) }
  isBossGpuRendered(id: number) { return this.actors.hasEnemy(id) }
  prewarmGpuBoss(_kind: string | null, _width: number, _height: number, _time: number) {}
  getEclipseAt(x: number, y: number) { return this.space.eclipseAt(x,y) }
  getOrbitalSunlight() { return this.space.sunlight() }
  getRaidGpuStats() {
    return { ...this.actors.stats(), textures: this.renderer?.info.memory.textures ?? 0, gpuFrameMs: this.timer?.milliseconds ?? null,
      drawCalls: this.renderer?.info.render.calls ?? 0, triangles: this.renderer?.info.render.triangles ?? 0 }
  }

  destroy() {
    if (this.disposed) return
    this.disposed = true
    unbindLiveHulls(this)
    for (const node of this.hulls.values()) this.releaseNode(node)
    this.hulls.clear()
    this.space.destroy()
    this.actors.destroy()
    if (this.renderer) {
      this.renderer.domElement.removeEventListener('webglcontextlost', this.lost)
      this.renderer.domElement.removeEventListener('webglcontextrestored', this.restored)
      this.timer?.destroy()
      this.renderer.dispose()
      this.renderer.forceContextLoss()
      this.renderer.domElement.remove()
      this.renderer = null
    }
  }
}
