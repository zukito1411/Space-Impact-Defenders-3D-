import { CombatLightField, type CombatLightInput } from './combatLighting'
import { HullDestructionBatch } from './hullDestruction'
import { HullLampBatch } from './hullLampBatch'
import { bindHullLamps, type HullLampBinding } from './hullLampAnchors'
import { updateEnemyBank, type EnemyBankPose } from './enemyBanking'
import { ShipGpuTimer } from './shipGpuTimer'
import { HullInstances } from './hullInstances'
import { hullViewYaw, ORGANIC_BOSS_VIEW_YAW, RAID_CAMERA_FOV, raidCameraFocal } from './raidView'
import { isRaid2DMech } from './mechArtwork'
import { prepareLiveProtection } from './liveProtection'
import { poseOrganicBoss } from './specialBossGeometry'
import {
  DirectionalLight, Mesh, Group, HemisphereLight, NeutralToneMapping, Quaternion, Vector3,
  PerspectiveCamera, Scene, WebGLRenderer, Matrix4, type Material, type Object3D, type Texture, WebGLRenderTarget,
} from 'three'
import { ENEMY_HULL_KEYS, ENEMY_HULL_SPECS } from './enemyHulls'
import { createShipLightingFrame, SHIP_LIGHTING_PALETTES, type ShipLightingFrame } from './shipLighting'
import { prepareShipReflections } from './shipReflections'
import { prepareHullSurfaces, type HullSurfaceBinding } from './shipSurface'
import { acquireHull, getHullRegistration, hullKey, loadHull, releaseHull, trimHullAssets } from './liveHullAssets'
import { bindLiveHulls, unbindLiveHulls, type LiveHullDraw, type LiveHullDestruction, type LiveHullSink } from './liveHullBridge'

type HullNode = { lamps: HullLampBinding[]; lampSize: number; lampOpacity: number; bankPose?: EnemyBankPose; body?: Mesh; hit: number; key: string; group: Group; object: Object3D; used: number; materials: Material[]; surfaces: HullSurfaceBinding[]; transient?: boolean }

/** Live player, support, fighter and cosmetic-copy meshes share one transparent layer.
 * Pixi owns scenery GLBs; Canvas retains exhaust, weapon and energy effects. */
export class ThreeShipPresentation implements LiveHullSink {
  private renderer: WebGLRenderer | null = null
  private readonly gpuTimer = new ShipGpuTimer()
  private measureGpu = false
  private cpuSubmitMs = 0
  private readonly drawWorld = () => this.renderer!.render(this.world,this.camera)
  private eclipseAt: ((x: number,y: number) => number) | undefined
  private readonly world = new Scene()
  private readonly lamps = new HullLampBatch()
  private readonly combatLights = new CombatLightField()
  private readonly destruction = new Map<string,HullDestructionBatch>()
  private readonly deathPoses = Array.from({length:12},()=>({id:'',used:-1,age:0,matrix:new Matrix4()}))
  private readonly deathRoot = new Group()
  private readonly deathObject = new Group()
  private deathCount=0
  private readonly deathMotion=new Matrix4()
  private readonly keyLight = new DirectionalLight(0xfff0dc, 2.8)
  private readonly fillLight = new DirectionalLight(0x86bddc, .34)
  private readonly ambientLight = new HemisphereLight(0xa0c5e4, 0x182436, .34)
  private readonly lighting = createShipLightingFrame()
  private readonly neutralLighting = createShipLightingFrame()
  private readonly lightDirection = new Vector3()
  private readonly reflectionAxis = new Vector3(-.61, .49, .62).normalize()
  private readonly reflectionTurn = new Quaternion()
  private readonly viewTurn = new Quaternion()
  private readonly flightViewTurn = new Quaternion().setFromAxisAngle(new Vector3(0,1,0),hullViewYaw(true))
  private readonly parkedViewTurn = new Quaternion().setFromAxisAngle(new Vector3(0,1,0),hullViewYaw(true,1))
  // Upright organic anatomy faces the combat camera rather than the flight
  // plane's wing-bank basis. Keep depth while retaining the eyes and fangs.
  private readonly organicViewTurn = new Quaternion().setFromAxisAngle(new Vector3(0,1,0), ORGANIC_BOSS_VIEW_YAW)
  private readonly headingTurn = new Quaternion()
  private readonly headingAxis = new Vector3(0,0,1)
  private readonly preparedTextures = new WeakSet<Texture>()
  // Retain warm materials so Three keeps their compiled program references.
  private readonly warmedMaterials = new Map<string, Material[]>()
  private reflectionTargets: WebGLRenderTarget[] = []
  private readonly uploadTarget = new WebGLRenderTarget(8, 8)
  private previousLightSeconds: number | null = null
  private dockBlend = 0
  private previousDock = -1
  private previousProbe = -1
  private readonly camera = new PerspectiveCamera(RAID_CAMERA_FOV, 1, 1, 20000)
  private readonly hulls = new Map<string, HullNode>()
  private readonly batches = new Map<string, { instances: HullInstances; owner: HullNode; count: number }>()
  private readonly nodePools = new Map<string, HullNode[]>()
  private readonly requests = new Set<string>()
  private readonly preparations = new Map<string,Promise<void>>()
  private readonly failed = new Set<string>()
  private width = 1
  private height = 1
  private density = 1
  private frame = 0
  private hadVisibleHulls = false
  private disposed = false
  private contextLost = false
  private readonly lost = (event: Event) => {
    event.preventDefault(); this.contextLost = true; this.gpuTimer.reset()
    this.reportError('Graphics context interrupted. Restoring the 3D scene…')
  }
  private readonly restored = () => { void this.restoreLighting() }

  private async restoreLighting() {
    const renderer = this.renderer
    if (!renderer || this.disposed) return
    try {
      for (const target of this.reflectionTargets) target.dispose()
      this.reflectionTargets = []
      this.world.environment = null
      try {
        this.reflectionTargets = prepareShipReflections(renderer)
        this.world.environment = this.reflectionTargets[0].texture
      } catch (error) { console.warn('Ship reflection restore unavailable; retaining direct lighting:', error) }
      // Render-target contents and texture uploads are lost with the context.
      // Rebuild once during recovery, before admitting live hull submissions.
      for (const node of this.hulls.values()) for (const surface of node.surfaces) {
        if (surface.material.map) renderer.initTexture(surface.material.map)
      }
      await this.lamps.prepare(renderer,this.camera,this.uploadTarget)
      await renderer.compileAsync(this.world,this.camera)
      if (this.disposed) return
      this.contextLost = false
      this.reportError(null)
    } catch (error) {
      console.error('Live ship lighting restoration failed',error)
      if (!this.disposed) this.reportError('The ship renderer could not restore. Reload to try again.')
    }
  }
  private readonly reduced = window.matchMedia('(prefers-reduced-motion: reduce)')

  constructor(private readonly reportError: (message: string | null) => void = () => {}) { this.deathRoot.add(this.deathObject) }

  prepareHull(key:string):Promise<void>{
    if (isRaid2DMech(key)) return Promise.resolve()
    key=hullKey(key)
    const pending=this.preparations.get(key)
    if(pending)return pending
    if(this.warmedMaterials.has(key))return Promise.resolve()
    const operation=this.prepareModel(key).finally(()=>this.preparations.delete(key))
    this.preparations.set(key,operation)
    return operation
  }

  private async prepareModel(key: string) {
    const source = await loadHull(key)
    const renderer = this.renderer
    if (!renderer || this.disposed) return
    const asset = acquireHull(key)
    if (!asset) return
    const warmup = new Scene()
    const prepared = prepareHullSurfaces(asset.object, key, renderer, this.preparedTextures,this.combatLights)
    warmup.add(asset.object)
    let compiled = false
    try {
      await Promise.all([renderer.compileAsync(warmup, this.camera, this.world),
        ENEMY_HULL_SPECS[key] ? Promise.resolve() : prepareLiveProtection(key === 'mesiah' ? 'mesiahBlack' : key,source)])
      compiled = !this.disposed
    } finally {
      if (compiled) {
        for (const material of this.warmedMaterials.get(key) ?? []) material.dispose()
        this.warmedMaterials.delete(key)
        this.warmedMaterials.set(key,prepared.owned)
        if (this.warmedMaterials.size > 48) {
          const oldest = [...this.warmedMaterials.keys()].find(candidate => !ENEMY_HULL_SPECS[candidate] && candidate!=='rocket' && candidate!=='mesiahBlack'
            && ![...this.hulls.values()].some(node => node.key === candidate))
          if (oldest) {
            const retired = this.nodePools.get(oldest)
            this.nodePools.delete(oldest)
            const batch = this.batches.get(oldest)
            if (batch) { batch.instances.destroy(); this.releaseNode(batch.owner); this.batches.delete(oldest) }
            for (const node of retired ?? []) this.releaseNode(node)
            for (const material of this.warmedMaterials.get(oldest)!) material.dispose()
            this.destruction.get(oldest)?.destroy();this.destruction.delete(oldest)
            this.warmedMaterials.delete(oldest)
          }
        }
      } else for (const material of prepared.owned) material.dispose()
      releaseHull(key, asset.object)
    }
    const pool: HullNode[] = []
    const reserve=ENEMY_HULL_SPECS[key]?.family === 'boss' ? 1 : ENEMY_HULL_SPECS[key]?.family === 'elite' ? 2 : 4
    while(!this.disposed&&pool.length<reserve){
      const node=this.createNode(key)
      if(!node)break
      pool.push(node)
    }
    if (this.disposed) return
    // Shader compilation alone does not upload vertex/index buffers or create
    // the vertex-array bindings used by the actual pooled material instances.
    // Do that before admitting this hull to a visible frame.
    if (ENEMY_HULL_SPECS[key]?.family !== 'boss' && !this.batches.has(key)) {
      const owner = this.createNode(key)
      const instances = owner ? HullInstances.create(owner.object) : null
      if (instances && owner) this.batches.set(key, { instances, owner, count: 0 })
      else if (owner) this.releaseNode(owner)
    }
    let breakup=this.destruction.get(key)
    if (ENEMY_HULL_SPECS[key] && ENEMY_HULL_SPECS[key].special!=='squid' && ENEMY_HULL_SPECS[key].special!=='snake' && !breakup) {
      const owner=pool[0]
      if (owner) { breakup=new HullDestructionBatch(owner.object,this.combatLights);this.destruction.set(key,breakup) }
    }
    const batch = this.batches.get(key)
    const upload = new Scene()
    upload.environment = this.world.environment
    upload.environmentIntensity = this.world.environmentIntensity
    upload.add(this.keyLight.clone(), this.fillLight.clone(), this.ambientLight.clone())
    for (const node of pool) { node.group.visible = true; upload.add(node.group) }
    if (batch) {
      batch.instances.mesh.count = 1; batch.instances.mesh.visible = true
      upload.add(batch.instances.mesh)
    }
    if (breakup) {breakup.add(new Matrix4(),.2,0,1);breakup.present();upload.add(breakup.root)}
    const camera = this.camera.clone()
    camera.aspect = 1; camera.position.set(0, 0, 1000); camera.updateProjectionMatrix()
    const target = renderer.getRenderTarget()
    let admitted = false
    try {
      try {
        renderer.setRenderTarget(this.uploadTarget)
        renderer.render(upload, camera)
      } finally { renderer.setRenderTarget(target) }
      for (const node of pool) node.group.visible = false
      // Offscreen targets use a different output/tone-mapping program. Retain
      // the screen variant with the same light/environment configuration too.
      for (const node of pool) node.group.visible = true
      await renderer.compileAsync(upload, this.camera, this.world)
      if (!this.disposed) { this.nodePools.set(key, pool); admitted = true }
    } finally {
      if (breakup) {
        breakup.reset()
        if(admitted)this.world.add(breakup.root)
        else {breakup.destroy();this.destruction.delete(key)}
      }
      if (batch) {
        batch.instances.reset(); batch.instances.mesh.removeFromParent()
        if (admitted) this.world.add(batch.instances.mesh)
        else { batch.instances.destroy(); this.releaseNode(batch.owner); this.batches.delete(key) }
      }
      if (!admitted) {
        for (const material of this.warmedMaterials.get(key) ?? []) material.dispose()
        this.warmedMaterials.delete(key)
      }
      for (const node of pool) {
        node.group.visible = false
        node.group.removeFromParent()
        if (!admitted) {
          for (const material of node.materials) material.dispose()
          releaseHull(key, node.object)
        }
      }
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
      renderer.toneMapping = NeutralToneMapping
      renderer.toneMappingExposure = 1
      renderer.domElement.className = 'raid__ship-canvas'
      renderer.domElement.addEventListener('webglcontextlost', this.lost)
      renderer.domElement.addEventListener('webglcontextrestored', this.restored)
      this.world.add(this.lamps.points)
      this.world.add(this.keyLight, this.fillLight, this.ambientLight,
        this.keyLight.target, this.fillLight.target)
      try {
        this.reflectionTargets = prepareShipReflections(renderer)
        this.world.environment = this.reflectionTargets[0].texture
        this.world.environmentIntensity = .36
      } catch (error) {
        // Direct PBR highlights still work if floating-point reflection baking fails.
        console.warn('Ship reflection probes unavailable; retaining direct lighting:', error)
      }
      host.replaceChildren(renderer.domElement)
      bindLiveHulls(this)
      await this.lamps.prepare(renderer,this.camera,this.uploadTarget)
      await this.prepareHull('rocket')
      await this.prepareHull('mesiahBlack')
      // Mesh extraction, native-paint uploads and shader compilation finish before
      // gameplay. Two admissions at a time bound decode/worker/driver pressure.
      let nextEnemy = 0
      await Promise.all(Array.from({ length: 2 }, async () => {
        while (!this.disposed && nextEnemy < ENEMY_HULL_KEYS.length) {
          await this.prepareHull(ENEMY_HULL_KEYS[nextEnemy++])
        }
      }))
      if (this.disposed) return false
      await renderer.compileAsync(this.world, this.camera)
      return !this.disposed
    } catch (error) {
      console.error('Live ship renderer initialization failed', error)
      this.reportError('The 3D ship renderer could not start: ' + (error instanceof Error ? error.message : String(error)))
      this.destroy()
      return false
    }
  }

  render(frame: { width: number; height: number; dpr: number; landscape?: boolean; measureGpu?: boolean; lighting?: ShipLightingFrame; dock?: number; combat?: CombatLightInput; eclipseAt?: (x: number,y: number) => number }) {
    const renderer = this.renderer
    if (!renderer || this.disposed || this.contextLost) return false
    this.frame++
    this.deathCount=0
    for(const batch of this.destruction.values())batch.reset()
    this.combatLights.update(frame.width,frame.height,frame.combat)
    this.measureGpu = Boolean(frame.measureGpu)
    this.cpuSubmitMs = 0
    if (frame.width !== this.width || frame.height !== this.height || frame.dpr !== this.density) {
      this.width = frame.width; this.height = frame.height; this.density = frame.dpr
      renderer.setSize(Math.ceil(this.width*this.density), Math.ceil(this.height*this.density), false)
      renderer.domElement.style.width = this.width + 'px'
      renderer.domElement.style.height = this.height + 'px'
      this.camera.aspect = this.width/this.height
      this.camera.position.set(this.width*.5, this.height*.5, raidCameraFocal(this.height))
      this.camera.updateProjectionMatrix()
    }
    this.lamps.begin(frame.lighting?.seconds??0,frame.height,frame.dpr,this.reduced.matches)
    this.updateLighting(frame.lighting ?? this.neutralLighting, frame.dock ?? 0, Boolean(frame.landscape))
    this.eclipseAt = frame.eclipseAt
    for (const node of this.hulls.values()) {
      node.group.visible = false
      if (node.body) node.body.visible = true
    }
    for (const batch of this.batches.values()) { batch.count = 0; batch.instances.reset() }
    return true
  }

  private updateLighting(target: ShipLightingFrame, dock: number, landscape: boolean) {
    const previous = this.previousLightSeconds
    const dt = previous === null ? 0 : Math.max(0, Math.min(.05, target.seconds-previous))
    this.previousLightSeconds = target.seconds
    const changedWhilePaused = dt === 0 && (target.probe !== this.previousProbe || dock !== this.previousDock)
    const blend = previous === null || target.seconds < previous || this.reduced.matches || changedWhilePaused
      ? 1 : 1-Math.exp(-dt*4)
    this.previousDock = dock; this.previousProbe = target.probe
    this.dockBlend += (Math.max(0,Math.min(1,dock))-this.dockBlend)*blend
    const indoor = this.dockBlend, deck = SHIP_LIGHTING_PALETTES[6], state = this.lighting
    for (let axis = 0; axis < 3; axis++) {
      const sun = axis === 0 ? (landscape ? -.80 : -.35) : axis === 1 ? (landscape ? -.25 : -.78) : .75
      state.sun[axis] += (target.sun[axis]*(1-indoor)+sun*indoor-state.sun[axis])*blend
      const fill = axis === 0 ? (landscape ? .15 : .85) : axis === 1 ? (landscape ? -.85 : .15) : .45
      state.fillDirection[axis] += (target.fillDirection[axis]*(1-indoor)+fill*indoor-state.fillDirection[axis])*blend
      state.keyColor[axis] += (target.keyColor[axis]*(1-indoor)+deck.key[axis]*indoor-state.keyColor[axis])*blend
      state.skyColor[axis] += (target.skyColor[axis]*(1-indoor)+deck.sky[axis]*indoor-state.skyColor[axis])*blend
      state.groundColor[axis] += (target.groundColor[axis]*(1-indoor)+deck.ground[axis]*indoor-state.groundColor[axis])*blend
      state.fillColor[axis] += (target.fillColor[axis]*(1-indoor)+deck.fill[axis]*indoor-state.fillColor[axis])*blend
    }
    state.sunIntensity += (target.sunIntensity*(1-indoor)+deck.sun*indoor-state.sunIntensity)*blend
    state.fillIntensity += (target.fillIntensity*(1-indoor)+deck.bounce*indoor-state.fillIntensity)*blend
    state.ambientIntensity += (target.ambientIntensity*(1-indoor)+deck.ambient*indoor-state.ambientIntensity)*blend
    state.reflectionIntensity += (target.reflectionIntensity*(1-indoor)+deck.reflection*indoor-state.reflectionIntensity)*blend
    this.keyLight.color.setRGB(state.keyColor[0],state.keyColor[1],state.keyColor[2])
    this.keyLight.intensity = state.sunIntensity
    this.fillLight.color.setRGB(state.fillColor[0],state.fillColor[1],state.fillColor[2])
    // Space has a directional stellar key and weak environment fill, rather
    // than a bright camera-mounted headlight. Planet/carrier bounce stays local.
    this.fillLight.intensity = state.fillIntensity
    this.ambientLight.color.setRGB(state.skyColor[0],state.skyColor[1],state.skyColor[2])
    this.ambientLight.groundColor.setRGB(state.groundColor[0],state.groundColor[1],state.groundColor[2])
    this.ambientLight.intensity = state.ambientIntensity
    this.keyLight.target.position.set(this.width*.5,this.height*.5,0)
    this.fillLight.target.position.copy(this.keyLight.target.position)
    this.lightDirection.set(state.sun[0],-state.sun[1],state.sun[2]).normalize()
    this.keyLight.position.copy(this.keyLight.target.position).addScaledVector(this.lightDirection,1800)
    const probe = this.reflectionTargets[indoor > .5 ? 6 : target.probe]
    if (probe) {
      this.world.environment = probe.texture
      this.world.environmentIntensity = state.reflectionIntensity
      if (indoor < .5 && target.probe < 4) {
        this.reflectionTurn.setFromUnitVectors(this.reflectionAxis,this.lightDirection)
        this.world.environmentRotation.setFromQuaternion(this.reflectionTurn)
      } else this.world.environmentRotation.set(0,0,0)
    }
    this.lightDirection.set(state.fillDirection[0],-state.fillDirection[1],state.fillDirection[2]).normalize()
    this.fillLight.position.copy(this.fillLight.target.position).addScaledVector(this.lightDirection,1800)
  }

  private createNode(key: string): HullNode | undefined {
    const renderer = this.renderer
    if (!renderer) return undefined
    const asset = acquireHull(key)
    if (!asset) return undefined
    const group = new Group()
    group.add(asset.object)
    group.visible = false
    group.userData.registration = asset.registration.registration
    const prepared = prepareHullSurfaces(asset.object,key,renderer,this.preparedTextures,this.combatLights)
    let body: Mesh | undefined
    asset.object.traverse(child => { if (child instanceof Mesh) body = child })
    return { lamps: bindHullLamps(asset.object), lampSize: 0, lampOpacity: 0, key, group, body, hit: 0, object: asset.object, used: this.frame,
      materials: prepared.owned, surfaces: prepared.bindings }
  }

  submitHull(draw: LiveHullDraw) {
    if (isRaid2DMech(draw.key)) return false
    if (!this.renderer || this.disposed || this.contextLost) return false
    const key=hullKey(draw.key)
    let node = this.hulls.get(draw.id)
    if (node && node.key !== key) {
      this.releaseNode(node)
      this.hulls.delete(draw.id)
      node = undefined
    }
    if (!node) {
      const pool=this.nodePools.get(key)
      node = pool?.pop() ?? (this.warmedMaterials.has(key)&&!this.preparations.has(key)?this.createNode(key):undefined)
      if (!node) {
        if (!this.requests.has(key)&&!this.failed.has(key)) {
          this.requests.add(key)
          void this.prepareHull(key).catch(error => {
            this.failed.add(key)
            console.error('Live hull preparation:',key,error)
            this.reportError('A required 3D hull could not load. Reload to try again.')
          }).finally(() => this.requests.delete(key))
        }
        return false
      }
      this.world.add(node.group)
      this.hulls.set(draw.id,node)
    }
    node.lampSize=draw.size;node.lampOpacity=draw.alpha
    node.used = this.frame
    if (node.body) node.body.visible = true
    node.transient=draw.id.startsWith('fx:')
    const { group } = node
    group.visible = draw.alpha > .01
    const [sx, sy, ox, oy] = group.userData.registration as number[]
    const angle=draw.angle
    const depth=Math.max(0,draw.depth ?? 0),perspective=1+depth/raidCameraFocal(this.height)
    group.position.set(this.width*.5+(draw.x-this.width*.5)*perspective,
      this.height*.5+(this.height*.5-draw.y)*perspective,-depth)
    this.headingTurn.setFromAxisAngle(this.headingAxis,angle)
    // Bank in the hull's local flight frame, then turn that frame on screen.
    // This matches the Canvas hardpoints and keeps a sideways enemy's length.
    const dock = Math.max(0,Math.min(1,draw.dock ?? 0))
    if (draw.landscape) {
      const view = draw.bossPose ? this.organicViewTurn : dock > 0
        ? this.viewTurn.copy(this.flightViewTurn).slerp(this.parkedViewTurn,dock) : this.flightViewTurn
      group.quaternion.copy(this.headingTurn).multiply(view)
    } else group.quaternion.copy(this.headingTurn)
    group.scale.set(draw.size*sx/448, draw.size*sy/448, draw.size*sx/448)
    node.object.position.set((144*sx+ox-224)/sx,(224-144*sy-oy)/sy,0)
    let bank = draw.bank*(1-dock)
    if (draw.enemyBank && ENEMY_HULL_SPECS[key]) {
      const motion = draw.enemyBank
      node.bankPose ??= { x: motion.x, y: motion.y, time: motion.time, bank: 0, velocity: 0 }
      bank = updateEnemyBank(node.bankPose, motion, this.reduced.matches)
    } else node.bankPose = undefined
    node.object.rotation.y = this.reduced.matches ? 0 : bank * 150*Math.PI/180
    if (draw.bossPose) {
      const yaw = draw.landscape ? ORGANIC_BOSS_VIEW_YAW : 0
      // Keep the committed bite/whip lane in the same camera plane while
      // banking the body; the attack rig receives the inverse foreshortening.
      const targetScale = Math.cos(yaw) / Math.cos(yaw + node.object.rotation.y)
      poseOrganicBoss(node.object, draw.bossPose, draw.id, targetScale)
    }
    // Saucer spin belongs inside the inclined flight plane. Rotating the
    // projected heading instead makes the disc stand up like a wheel.
    node.object.rotation.z = this.reduced.matches ? 0 : draw.spin ?? 0
    node.hit = Math.max(0, Math.min(1, draw.hit ?? 0))
    const eclipse = Math.max(0, Math.min(1, this.eclipseAt?.(draw.x,draw.y) ?? 0)) * (1-this.dockBlend)
    for (const surface of node.surfaces) {
      surface.material.opacity = draw.alpha * surface.opacity
      surface.material.emissiveIntensity = surface.emissiveIntensity + node.hit * .38
      // Shadow the incident light, leaving the painted albedo and weak
      // environment reflection intact on the night side.
      surface.sunVisibility.value = 1-.92*eclipse
    }
    return true
  }

  submitDestruction(draw: LiveHullDestruction) {
    const batch=this.destruction.get(draw.key)
    if (!batch || this.deathCount>=12) return false
    let pose=this.deathPoses.find(p=>p.id===draw.id && p.used>=this.frame-1)
    if (!pose) {
      pose=this.deathPoses.find(p=>p.used<this.frame-1)
      if(!pose)for(const candidate of this.deathPoses)if(candidate.used<this.frame && (!pose || candidate.age>pose.age))pose=candidate
      if (!pose) return false
      const source=this.hulls.get(draw.sourceId)
      if (source && source.key===draw.key) {
        source.object.updateWorldMatrix(true,false);pose.matrix.copy(source.object.matrixWorld)
      } else {
        const registration=getHullRegistration(draw.key)?.registration
        if(!registration)return false
        const [sx,sy,ox,oy]=registration
        this.deathRoot.position.set(draw.x,this.height-draw.y,0)
        this.headingTurn.setFromAxisAngle(this.headingAxis,draw.angle)
        this.deathRoot.quaternion.copy(this.headingTurn)
        if(draw.landscape)this.deathRoot.quaternion.multiply(this.flightViewTurn)
        this.deathRoot.scale.set(draw.size*sx/448,draw.size*sy/448,draw.size*sx/448)
        this.deathObject.position.set((144*sx+ox-224)/sx,(224-144*sy-oy)/sy,0)
        this.deathRoot.updateWorldMatrix(true,true);pose.matrix.copy(this.deathObject.matrixWorld)
      }
      pose.id=draw.id
    }
    pose.used=this.frame;pose.age=draw.age
    const source=this.hulls.get(draw.sourceId)
    if(source)source.group.visible=false
    // Keep the hull's forward momentum; the shader adds rigid separation/spin.
    this.deathMotion.copy(pose.matrix)
    this.deathMotion.elements[12]+=draw.driftX*draw.age
    this.deathMotion.elements[13]-=draw.driftY*draw.age
    const admitted=batch.add(this.deathMotion,draw.age,draw.seed,draw.alpha,draw.tempo,draw.style,draw.finale)
    if(admitted)this.deathCount++
    return admitted
  }

  present() {
    if (!this.renderer || this.disposed || this.contextLost) return
    const cpuStart = this.measureGpu ? performance.now() : 0
    // A 2D-only mech frame has no Three work. Clear the previous ship once,
    // then leave the transparent canvas alone until a live hull is submitted.
    this.lamps.clear()
    for(const batch of this.destruction.values())batch.present()
    let visible = this.deathCount>0
    for (const node of this.hulls.values()) if (node.group.visible) { visible = true; break }
    if (visible) {
      for (const node of this.hulls.values()) {
        if (node.group.visible) {
          const batch = this.batches.get(node.key)
          if (batch) batch.count++
        }
      }
      for (const node of this.hulls.values()) {
        const batch = this.batches.get(node.key), surface = node.surfaces[0]
        if (node.group.visible && node.body && surface && batch && batch.count > 1) {
          batch.instances.add(node.body, surface.material.opacity / Math.max(.0001, surface.opacity),
            surface.sunVisibility.value, node.hit)
        }
      }
      for (const node of this.hulls.values())if(node.group.visible&&!node.transient)
        this.lamps.add(node.object,node.lamps,node.lampSize,node.lampOpacity)
      this.lamps.present()
      for (const batch of this.batches.values()) batch.instances.present()
      this.gpuTimer.render(this.renderer.getContext() as WebGL2RenderingContext,this.measureGpu,this.drawWorld)
    }
    else if (this.hadVisibleHulls) this.renderer.clear()
    else this.renderer.info.reset()
    this.hadVisibleHulls = visible
    for (const [id, node] of this.hulls) {
      if (node.transient||ENEMY_HULL_SPECS[node.key] ? node.used === this.frame : this.frame-node.used < 120) continue
      this.releaseNode(node)
      this.hulls.delete(id)
    }
    trimHullAssets()
    this.cpuSubmitMs = this.measureGpu ? performance.now() - cpuStart : 0
  }

  private releaseNode(node: HullNode) {
    node.bankPose = undefined
    const pool = this.nodePools.get(node.key)
    const limit=8
    if (!this.disposed && pool && pool.length < limit) {
      node.group.visible = false; node.group.removeFromParent()
      pool.push(node)
      return
    }
    for (const material of node.materials) material.dispose()
    releaseHull(node.key, node.object)
    node.group.removeFromParent()
  }

  getCpuSubmissionMs() { return this.cpuSubmitMs }

  getShipStats() {
    return { lampPoints: this.lamps.count, lampDraws: this.lamps.points.visible?1:0, hulls: [...this.hulls.values()].filter(node => node.group.visible).length,
      textures: this.renderer?.info.memory.textures ?? 0,
      drawCalls: this.renderer?.info.render.calls ?? 0,
      triangles: this.renderer?.info.render.triangles ?? 0,
      cpuSubmitMs: this.cpuSubmitMs, gpuFrameMs: this.gpuTimer.milliseconds, gpuSampleAgeMs: this.gpuTimer.age,
      instanceBatches: [...this.batches.values()].filter(batch => batch.instances.mesh.visible).length }
  }

  destroy() {
    if (this.disposed) return
    this.disposed = true
    unbindLiveHulls(this)
    for (const node of this.hulls.values()) this.releaseNode(node)
    this.hulls.clear()
    for (const batch of this.batches.values()) { batch.instances.destroy(); this.releaseNode(batch.owner) }
    this.batches.clear()
    for(const batch of this.destruction.values())batch.destroy()
    this.destruction.clear()
    for (const pool of this.nodePools.values()) for (const node of pool) this.releaseNode(node)
    this.nodePools.clear();this.failed.clear();this.requests.clear()
    for (const materials of this.warmedMaterials.values()) for (const material of materials) material.dispose()
    this.warmedMaterials.clear()
    for (const target of this.reflectionTargets) target.dispose()
    this.reflectionTargets.length = 0
    this.lamps.destroy()
    this.uploadTarget.dispose()
    this.gpuTimer.reset()
    this.world.environment = null
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
