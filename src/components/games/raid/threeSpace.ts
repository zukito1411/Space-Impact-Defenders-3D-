import {
  AdditiveBlending, BackSide, BufferGeometry, CanvasTexture, Color, Float32BufferAttribute,
  Group, IcosahedronGeometry, InstancedMesh, Mesh, MeshBasicMaterial, MeshStandardMaterial,
  Object3D, PlaneGeometry, Points, RingGeometry, ShaderMaterial, SphereGeometry, SRGBColorSpace, TextureLoader,
} from 'three'
import { getPublicAssetUrl } from '../sound'
import { cosmicRegionIndex } from './cosmos'
import { getRaidBackgroundScene } from './background'
import { orbitalShadowCoverage, sampleOrbitalShadow, type OrbitalShadow } from './flightEffects'
import { createRaidJourneyView, sampleRaidJourney } from './journey'
import type { PixiRaidBackgroundFrame } from './background'

const loader = new TextureLoader()
const paths: Record<string, string> = {
  planet1: 'planet_1.webp', planet2: 'planet_2.webp', planet3: 'planet_3.webp',
  planet4: 'planet_4.webp', planet5: 'planet_5.webp', planetNebula: 'planet__3.webp',
}
const starVertex = `
uniform float time, travel, focal;
varying float brightness;
varying vec3 starColor;
attribute float seed;
void main() {
  vec3 p = position;
  p.z = -600.-mod(-p.z-travel,2200.);
  vec4 view = modelViewMatrix*vec4(p,1.);
  gl_Position = projectionMatrix*view;
  float magnitude = fract(seed*37.91);
  gl_PointSize = clamp((1.+pow(magnitude,8.)*3.)*focal/-view.z, .8, 7.);
  brightness = (.45+.55*magnitude)*(.96+.04*sin(time*.7+seed*80.));
  brightness *= smoothstep(600.,760.,-p.z)*(1.-smoothstep(2600.,2800.,-p.z));
  starColor = mix(vec3(.57,.77,1.),vec3(1.,.79,.57),smoothstep(.6,.97,seed));
}`
const starFragment = `
varying float brightness;
varying vec3 starColor;
void main() {
  vec2 p=gl_PointCoord-.5;
  float light=exp(-dot(p,p)*36.)*brightness;
  gl_FragColor=vec4(starColor*light,light);
}`
const skyVertex = `
varying vec3 ray;
void main(){ray=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}
`
const skyFragment = `
uniform sampler2D art;
uniform vec2 region, angularScale;
uniform float time;
varying vec3 ray;
vec3 gas(vec2 uv){return texture2D(art,(region+clamp(uv,.008,.992))*.5).rgb;}
void main(){
  vec3 r=normalize(ray);
  vec2 st=.5+vec2(atan(r.x,-r.z),-asin(clamp(r.y,-1.,1.)))*angularScale;
  vec3 farGas=gas(st);
  vec3 middle=gas(st*1.09-.045+vec2(sin(time*.018)*.012,cos(time*.013)*.008));
  vec3 nearGas=gas(st*1.23-.115+vec2(-cos(time*.009)*.02,sin(time*.011)*.01));
  vec3 color=mix(farGas,middle,.26)+nearGas*.13;
  gl_FragColor=vec4(color*.84,1.);
  #include <colorspace_fragment>
}
`
const airVertex = `
varying vec3 worldNormal, toEye;
void main(){
 vec4 world=modelMatrix*vec4(position,1.);
 worldNormal=normalize(mat3(modelMatrix)*normal);
 toEye=normalize(cameraPosition-world.xyz);
 gl_Position=projectionMatrix*viewMatrix*world;
}`
const airFragment = `
varying vec3 worldNormal,toEye;
uniform vec3 color;
void main(){
 float edge=pow(1.-abs(dot(normalize(worldNormal),normalize(toEye))),3.);
 float day=smoothstep(-.4,.7,dot(normalize(worldNormal),normalize(vec3(-.6,.5,1.))));
 gl_FragColor=vec4(color*(.3+.7*day),edge*.46);
}`

const galaxyVertex = `
varying vec3 local;
void main(){
 local=position;
 gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
}`
const galaxyFragment = `
uniform sampler2D art;
varying vec3 local;
void main(){
 vec4 pigment=texture2D(art,.5+local.xy*.5);
 float nucleus=1.-clamp(dot(local.xy,local.xy),0.,1.);
 gl_FragColor=vec4(pigment.rgb*(1.+nucleus*nucleus*.35),pigment.a*.60);
 #include <colorspace_fragment>
}`

/** Real depth-tested planets, volumetric sky dome and GPU-resident debris. */
export class ThreeSpace {
  readonly root = new Group()
  private readonly stars: Points<BufferGeometry, ShaderMaterial>
  private readonly planets: Group[] = []
  private readonly galaxies: Mesh<SphereGeometry,ShaderMaterial>[] = []
  private readonly galaxyPaintKeys = ['', '', '']
  private readonly debris: InstancedMesh
  private readonly pose = new Object3D()
  private readonly sky: Mesh<SphereGeometry, ShaderMaterial>
  private readonly textures = new Set<import('three').Texture>()
  private disposed = false
  private planetWorker: Worker | null = null
  private paintSerial = 0
  private readonly paintJobs = new Map<number, {
    resolve(pixels: Uint8ClampedArray): void; reject(error: Error): void
  }>()
  private region = -1
  private paintEpoch = 0
  private paintSignature = ''
  private readonly journey = createRaidJourneyView()
  private previousStage = 0
  private stage = 0
  private readonly terrain = new Mesh(new PlaneGeometry(11000, 11000, 112, 112),
    new MeshStandardMaterial({ color: 0xffffff, roughness: .46, metalness: .18, transparent: true }))
  private readonly terrainTime = { value: 0 }
  private readonly terrainMaps: import('three').Texture[] = []
  private readonly shadow: OrbitalShadow = { x: 0, y: 0, width: 1, length: 1, rotation: 0, strength: 0, sunSide: 0 }
  private elapsed = 0
  private previous = 0
  private readonly bay = new Mesh(new PlaneGeometry(1,1), new MeshBasicMaterial({
    transparent: true, alphaTest: .02, depthWrite: false,
  }))
  private readonly bays: import('three').Texture[] = []
  private readonly starUniforms = { time: { value: 0 }, travel: { value: 0 }, focal: { value: 900 } }

  constructor() {
    const positions: number[] = [], seeds: number[] = []
    let state = 84717
    const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296 }
    for (let i = 0; i < 2300; i++) {
      positions.push((random()-.5)*5000, (random()-.5)*5000, -random()*2200)
      seeds.push(random())
    }
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
    geometry.setAttribute('seed', new Float32BufferAttribute(seeds, 1))
    this.stars = new Points(geometry, new ShaderMaterial({
      vertexShader: starVertex, fragmentShader: starFragment, uniforms: this.starUniforms,
      transparent: true, depthWrite: false, blending: AdditiveBlending, premultipliedAlpha: true,
    }))
    this.stars.frustumCulled = false
    this.root.add(this.stars)
    this.sky = new Mesh(new SphereGeometry(9000, 48, 24), new ShaderMaterial({
      vertexShader: skyVertex, fragmentShader: skyFragment, side: BackSide, depthWrite: false,
      uniforms: { art: { value: null }, region: { value: [0, 0] }, angularScale: { value: [1,1] }, time: { value: 0 } },
    }))
    this.sky.renderOrder = -100
    this.root.add(this.sky)
    this.load('assets/raid-fx/cosmos-regions-remaster-v2.webp').then(texture => {
      if (!this.disposed) this.sky.material.uniforms.art.value = texture
    }).catch(() => {})
    for (let i = 0; i < 3; i++) {
      const galaxy = new Mesh(new SphereGeometry(1,48,24),new ShaderMaterial({
        vertexShader: galaxyVertex, fragmentShader: galaxyFragment,
        uniforms: { art: { value: null } }, transparent: true, depthWrite: false,
        blending: AdditiveBlending,
      }))
      galaxy.visible = false
      this.galaxies.push(galaxy)
      this.root.add(galaxy)
    }
    for (let i = 0; i < 3; i++) {
      const group = new Group()
      const material = new MeshStandardMaterial({ color: 0xffffff, roughness: .85, metalness: .02 })
      const globe = new Mesh(new SphereGeometry(1, 72, 48), material)
      const air = new Mesh(new SphereGeometry(1.035, 48, 32), new ShaderMaterial({
        vertexShader: airVertex, fragmentShader: airFragment, side: BackSide,
        transparent: true, depthWrite: false, blending: AdditiveBlending,
        uniforms: { color: { value: new Color(0x54adff) } },
      }))
      group.add(globe, air)
      {
        const ring = new Mesh(new RingGeometry(1.26, 1.94, 128), new MeshStandardMaterial({
          color: 0xcda46e, roughness: .78, side: 2, transparent: true, opacity: .65,
        }))
        ring.material.onBeforeCompile = shader => {
          shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
            #include <color_fragment>
            float radius = length(vViewPosition.xy);
          `)
          // RingGeometry UV v is radial, so detail stays attached to the ring
          // under perspective rotation and the sphere naturally occludes it.
          shader.vertexShader = 'varying float ringRadius;\n'+shader.vertexShader
          shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>',
            '#include <begin_vertex>\n ringRadius = length(position.xy);')
          shader.fragmentShader = 'varying float ringRadius;\n'+shader.fragmentShader
          shader.fragmentShader = shader.fragmentShader.replace('float radius = length(vViewPosition.xy);', `
            float r = (ringRadius-1.26)/.68;
            float grain = .72+.13*sin(r*470.)+.08*sin(r*1279.)+.05*sin(r*91.);
            float gap = 1.-.92*exp(-pow((r-.63)*75.,2.));
            diffuseColor.rgb *= grain*mix(vec3(.72,.65,.54),vec3(1.22,1.13,.94),r);
            diffuseColor.a *= gap*smoothstep(0.,.025,r)*(1.-smoothstep(.94,1.,r));
          `)
        }
        ring.material.depthWrite = false
        ring.rotation.x = .9
        group.add(ring)
      }
      group.visible = false
      this.planets.push(group)
      this.root.add(group)
    }
    this.debris = new InstancedMesh(new IcosahedronGeometry(1, 1),
      new MeshStandardMaterial({ color: 0x667888, roughness: .83, metalness: .18 }), 96)
    this.debris.frustumCulled = false
    this.bay.visible = false
    this.root.add(this.bay)
    for (const [index, view] of ['portrait','landscape'].entries()) {
      const image = new Image(), mask = new Image()
      image.src = getPublicAssetUrl('assets/carrier/carrier-bay-'+view+'-v1.webp')
      mask.src = getPublicAssetUrl('assets/carrier/carrier-door-'+view+'.svg')
      void Promise.all([image.decode(),mask.decode()]).then(() => {
        if (this.disposed) return
        const canvas = document.createElement('canvas')
        canvas.width = image.naturalWidth; canvas.height = image.naturalHeight
        const context = canvas.getContext('2d')!
        context.drawImage(image,0,0)
        context.globalCompositeOperation = 'destination-in'
        context.drawImage(mask,0,0,canvas.width,canvas.height)
        const map = new CanvasTexture(canvas)
        map.colorSpace = SRGBColorSpace
        this.textures.add(map)
        this.bays[index] = map
      }).catch(() => {})
    }
    this.root.add(this.debris)
    this.terrain.rotation.x = -.65
    this.terrain.visible = false
    this.terrain.material.onBeforeCompile = shader => {
      shader.uniforms.uTerrainTime = this.terrainTime
      shader.vertexShader = 'uniform float uTerrainTime;\n' + shader.vertexShader
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `
        vec3 transformed = position;
        transformed.z += sin(position.x*.004+uTerrainTime*.65)*12.
          + cos(position.y*.003+uTerrainTime*.39)*18.;
      `)
    }
    this.root.add(this.terrain)
    for (const [index, file] of ['terrain-water-v1.webp', 'terrain-basalt-v1.webp'].entries()) {
      this.load('assets/raid-fx/' + file).then(map => { this.terrainMaps[index] = map }).catch(() => {})
    }
  }

  private async load(path: string) {
    const texture = await loader.loadAsync(getPublicAssetUrl(path))
    texture.colorSpace = SRGBColorSpace
    if (this.disposed) { texture.dispose(); throw new Error('Space scene disposed') }
    this.textures.add(texture)
    return texture
  }

  private async paintGalaxy(index: number, asset: string) {
    const path = asset === 'galaxy' ? 'galaxy.webp' : 'galaxy_'+asset.slice(-1)+'.webp'
    const map = await this.load('assets/others/'+path)
    if (this.disposed || this.galaxyPaintKeys[index] !== asset) {
      map.dispose(); this.textures.delete(map)
      return
    }
    const uniform = this.galaxies[index].material.uniforms.art
    const old = uniform.value as import('three').Texture | null
    if (old) { old.dispose(); this.textures.delete(old) }
    uniform.value = map
  }

  private reprojectPlanet(pixels: Uint8ClampedArray, radius: number, aspect: number) {
    if (!this.planetWorker) {
      this.planetWorker = new Worker(new URL('./planetPaint.worker.ts',import.meta.url), { type: 'module' })
      this.planetWorker.onmessage = (event: MessageEvent<{id: number; pixels: Uint8ClampedArray}>) => {
        this.paintJobs.get(event.data.id)?.resolve(event.data.pixels)
        this.paintJobs.delete(event.data.id)
      }
      this.planetWorker.onerror = event => {
        for (const job of this.paintJobs.values()) job.reject(new Error(event.message))
        this.paintJobs.clear()
        this.planetWorker?.terminate()
        this.planetWorker = null
      }
    }
    const id = this.paintSerial++
    return new Promise<Uint8ClampedArray>((resolve,reject) => {
      this.paintJobs.set(id,{resolve,reject})
      this.planetWorker!.postMessage({id,pixels,radius,aspect},[pixels.buffer])
    })
  }

  private async paintPlanet(index: number, path: string, epoch: number, discRadius: number, tile?: number) {
    const texture = await this.load(path)
    if (this.disposed || epoch !== this.paintEpoch) { texture.dispose(); this.textures.delete(texture); return }
    const image = texture.image as HTMLImageElement
    // Reproject the approved disc painting onto a complete spherical UV map once.
    const source = document.createElement('canvas')
    source.width = source.height = 512
    const ctx = source.getContext('2d', { willReadFrequently: true })!
    if (tile === undefined) ctx.drawImage(image, 0, 0, 512, 512)
    else {
      const cell = image.width/2, gutter = image.width*24/1024
      ctx.drawImage(image,(tile%2)*cell+gutter,Math.floor(tile/2)*cell+gutter,
        cell-2*gutter,cell-2*gutter,0,0,512,512)
    }
    const pixels = ctx.getImageData(0, 0, 512, 512).data
    const canvas = document.createElement('canvas')
    canvas.width = 1024; canvas.height = 512
    const target = canvas.getContext('2d')!
    const output = target.createImageData(1024, 512)
    const paint = await this.reprojectPlanet(pixels,discRadius,tile === undefined ? image.width/image.height : 1)
    if (this.disposed || epoch !== this.paintEpoch) { texture.dispose(); this.textures.delete(texture); return }
    output.data.set(paint)
    target.putImageData(output, 0, 0)
    texture.dispose()
    this.textures.delete(texture)
    const map = new CanvasTexture(canvas)
    map.colorSpace = SRGBColorSpace
    this.textures.add(map)
    const globe = this.planets[index].children[0] as Mesh<SphereGeometry, MeshStandardMaterial>
    const previous = globe.material.map
    if (previous) { previous.dispose(); this.textures.delete(previous) }
    globe.material.map = map
    globe.material.needsUpdate = true
  }

  update(frame: PixiRaidBackgroundFrame & { carrierBackdrop?: number; carrierShift?: number }) {
    const seconds = frame.time / 1000
    const dt = this.previous ? Math.min(.05, Math.max(0, seconds-this.previous)) : 0
    this.previous = seconds
    if (!frame.paused && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) this.elapsed += dt
    const t = this.elapsed
    const region = cosmicRegionIndex(frame.stageTheme)
    const scene = getRaidBackgroundScene(frame.stageTheme)
    if (frame.stageNumber !== undefined && this.stage !== frame.stageNumber) {
      this.previousStage = this.stage
      this.stage = frame.stageNumber
    }
    sampleRaidJourney(frame, this.journey, this.previousStage)
    if (region !== this.region) {
      this.region = region
      this.sky.material.uniforms.region.value = [region%2,Math.floor(region/2)]
    }
    const signature = region+'|'+scene.planets[0]?.asset+'|'+scene.planets[1]?.asset+'|'+
      scene.planets[2]?.asset+'|'+this.journey.planet
    if (signature !== this.paintSignature) {
      this.paintSignature = signature
      this.paintEpoch++
      for (let i = 0; i < this.planets.length; i++) {
        if (i === 0 && this.journey.planet >= 0) {
          this.paintPlanet(i,'assets/raid-fx/destination-worlds-remaster-v2.webp',
            this.paintEpoch,.481,this.journey.planet).catch(() => {})
          continue
        }
        const asset = scene.planets[i]?.asset
        if (!asset) continue
        this.paintPlanet(i,'assets/others/'+(paths[asset] ?? paths.planet1),
          this.paintEpoch,asset === 'planet2' ? .29 : asset === 'planet1' ? .447 : .478).catch(() => {})
      }
    }
    const cx = frame.width*.5, cy = frame.height*.5
    this.sky.position.set(cx, cy, frame.height*.5/Math.tan(35*Math.PI/360))
    this.sky.material.uniforms.angularScale.value = [
      1/(2*Math.atan(Math.tan(35*Math.PI/360)*frame.width/frame.height)), 180/(35*Math.PI),
    ]
    this.sky.material.uniforms.time.value = t
    this.stars.position.set(cx, cy, 0)
    this.starUniforms.time.value = t
    this.starUniforms.travel.value = t * (20 + frame.stageRush*65)
    this.starUniforms.focal.value = Math.max(frame.width, frame.height) * frame.dpr
    for (let i = 0; i < this.planets.length; i++) {
      const planet = this.planets[i], authored = scene.planets[i]
      planet.visible = Boolean(authored)
      planet.children[2].visible = authored?.asset === 'planet2'
      if (!authored) continue
      const depth = 900 + i*700
      planet.position.set(frame.width*(authored.x-.5)*2+cx, frame.height*(.5-authored.yOffset)*2+cy, -depth)
      const radius = Math.min(frame.width, frame.height) * (.31-i*.07)
      planet.scale.setScalar(radius)
      planet.rotation.y = t * (.012+i*.003)
      planet.rotation.z = .18+i*.28
    }
    const focal = frame.height*.5/Math.tan(35*Math.PI/360)
    for (let i = 0; i < this.galaxies.length; i++) {
      const galaxy = this.galaxies[i], authored = scene.galaxies[i]
      galaxy.visible = Boolean(authored)
      if (!authored) continue
      if (this.galaxyPaintKeys[i] !== authored.asset) {
        this.galaxyPaintKeys[i] = authored.asset
        this.paintGalaxy(i,authored.asset).catch(() => {})
      }
      const depth = 2800+i*500, perspective = (focal+depth)/focal
      galaxy.position.set(cx+(authored.x-.5)*frame.width*perspective,
        cy+(.5-authored.y)*frame.height*perspective,-depth)
      const radius = authored.width*frame.width*scene.galaxyScale*perspective*.5
      galaxy.scale.set(radius,authored.height*frame.height*scene.galaxyScale*perspective*.5,radius*.12)
      galaxy.rotation.set(.18+Math.sin(t*.008+i)*.06,.24,authored.rotation)
    }
    const journey = this.journey
    if (journey.enabled && journey.planet >= 0) {
      const planet = this.planets[0]
      planet.visible = journey.worldAlpha < .999
      const focal = frame.height*.5/Math.tan(35*Math.PI/360)
      const depth = 900
      const perspective = (focal+depth)/focal
      planet.position.set(cx+(journey.x-.5)*frame.width*perspective,
        cy+(.5-journey.y)*frame.height*perspective, -depth)
      planet.scale.setScalar(journey.size*Math.min(frame.width,frame.height)*.5*perspective)
    }
    this.terrain.visible = journey.worldAlpha > .001
    if (this.terrain.visible) {
      const map = this.terrainMaps[journey.worldTheme === 9102 ? 1 : 0]
      if (map && this.terrain.material.map !== map) {
        this.terrain.material.map = map
        this.terrain.material.needsUpdate = true
      }
      this.terrain.material.opacity = journey.worldAlpha
      this.terrain.position.set(cx, cy-250, -4300)
      this.terrainTime.value = t
      this.terrain.material.roughness = journey.worldTheme === 9102 ? .84 : .34
    }
    this.bay.visible = (frame.carrierBackdrop ?? 0) > .001
    if (this.bay.visible) {
      const map = this.bays[frame.landscape ? 1 : 0]
      if (map && this.bay.material.map !== map) {
        this.bay.material.map = map
        this.bay.material.needsUpdate = true
      }
      const focal = frame.height*.5/Math.tan(35*Math.PI/360)
      const perspective = (focal+300)/focal
      this.bay.position.set(cx,cy-(frame.carrierShift ?? 0)*frame.height*perspective,-300)
      this.bay.rotation.z = frame.landscape ? Math.PI/2 : 0
      const viewWidth = frame.landscape ? frame.height : frame.width
      const viewHeight = frame.landscape ? frame.width : frame.height
      const textureWidth = frame.landscape ? 1672 : 1024
      const textureHeight = frame.landscape ? 941 : 1536
      const cover = Math.max(viewWidth/textureWidth,viewHeight/textureHeight)
      this.bay.scale.set(textureWidth*cover*perspective,textureHeight*cover*perspective,1)
      this.bay.material.opacity = frame.carrierBackdrop ?? 0
      this.bay.material.depthWrite = (frame.carrierBackdrop ?? 0) > .98
    }
    this.shadow.strength = 0
    if (journey.approach > .01 && this.planets[0].visible) {
      const planet = this.planets[0]
      const focal = frame.height*.5/Math.tan(35*Math.PI/360)
      const scale = focal/(focal-planet.position.z)
      sampleOrbitalShadow(this.shadow, cx+(planet.position.x-cx)*scale,
        cy-(planet.position.y-cy)*scale, planet.scale.x*2*scale, frame.width, frame.height, journey.approach)
    }
    this.debris.visible = (frame.carrierBackdrop ?? 0) < .99
    for (let i = 0; i < 96; i++) {
      const depth = 120 + ((i*91.317-t*(28+frame.stageRush*50)) % 2400 + 2400) % 2400
      this.pose.position.set(cx + Math.sin(i*12.71)*1900, cy + Math.cos(i*4.37)*1900, -depth)
      const radius = i % 6 === 0 ? 5+i%11 : .6+(i%5)*.32
      this.pose.scale.setScalar(radius)
      this.pose.rotation.set(t*.11+i, t*.09+i*.7, i*.31)
      this.pose.updateMatrix()
      this.debris.setMatrixAt(i, this.pose.matrix)
    }
    this.debris.instanceMatrix.needsUpdate = true
  }

  eclipseAt(x: number, y: number) { return orbitalShadowCoverage(this.shadow, x, y) }
  sunlight() { return this.shadow.sunSide*Math.min(1,this.shadow.strength*4) }

  destroy() {
    this.disposed = true
    this.planetWorker?.terminate()
    for (const job of this.paintJobs.values()) job.reject(new Error('Space scene disposed'))
    this.paintJobs.clear()
    for (const texture of this.textures) texture.dispose()
    this.root.traverse(object => {
      if (object instanceof Mesh || object instanceof Points) {
        object.geometry.dispose()
        const materials = Array.isArray(object.material) ? object.material : [object.material]
        for (const material of materials) material.dispose()
      }
    })
    this.root.removeFromParent()
  }
}
