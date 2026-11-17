/**
 * Actual 3D cosmos for the independent 3D build.
 *
 * Runs INSIDE the existing Pixi application and its WebGPU/WebGL renderer.
 * No second graphics context, no second rAF loop, no collision/physics edits.
 * Spheres have lit surface geometry, the camera uses perspective, stars occupy
 * real XYZ positions, and stations/debris are reusable 3D meshes.
 *
 * Uses the original HD cosmos artwork as distant 3D nebula planes to retain
 * the game's established atmosphere and saturated colour scheme.
 */
import {
  AmbientLight, CylinderGeometry, DirectionalLight, IcosahedronGeometry,
  Material3D, Mesh3D, ParticleContainer3D, SphereGeometry, Sprite3D,
  TorusGeometry, View3D, packParticleColor,
} from '@pixi/3d'
import { Texture } from 'pixi.js'
import { getCosmosBackdrop, getCosmosLandmark } from './cosmosArt'

export type SpaceWorld3DFrame = {
  time: number
  stageTheme: number
  width: number
  height: number
  stageRush: number
  paused: boolean
  reducedMotion: boolean
  runToken: number
}

type StarPosition = { x: number; y: number; z: number; size: number; tint: number; speed: number }
type FlyingBody = { node: Mesh3D; x: number; y: number; depth: number; speed: number; seed: number }
const STAR_COUNT = 420
const ROCK_COUNT = 26
const WORLD_DEPTH = 240

const seeded = (seed: number, salt: number) => {
  let n = Math.imul(seed + 0x6d2b79f5, 1664525) ^ Math.imul(salt + 1, 1013904223)
  n ^= n >>> 16
  n = Math.imul(n, 2246822507)
  n ^= n >>> 13
  return (n >>> 0) / 4294967296
}
const between = (seed: number, salt: number, min: number, max: number) =>
  min + seeded(seed, salt) * (max - min)

const SPACE_THEMES = [
  { ice: 0x6bd8fa, mid: 0x2460b6, dark: 0x11244a, ring: 0xe5d5aa },
  { ice: 0xfc8c5b, mid: 0xbe3d54, dark: 0x4c1739, ring: 0xf8bf83 },
  { ice: 0x90fbe9, mid: 0x3885ac, dark: 0x1d365d, ring: 0x91d1d7 },
  { ice: 0xc1a0ff, mid: 0x6f52ca, dark: 0x271f65, ring: 0xbca8f2 },
  { ice: 0xffdc7c, mid: 0xc2834b, dark: 0x64414e, ring: 0xfce4b4 },
] as const

function colourHex(hex: number) {
  return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255] as const
}

/** A reusable equirectangular cloud-band/terrain texture: generated ONCE. */
function createPlanetTexture(seed: number, palette: (typeof SPACE_THEMES)[number]) {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 256
  const ctx = canvas.getContext('2d')
  if (!ctx) return Texture.WHITE
  const image = ctx.createImageData(canvas.width, canvas.height)
  const bright = colourHex(palette.ice)
  const middle = colourHex(palette.mid)
  const deep = colourHex(palette.dark)
  for (let y = 0; y < canvas.height; y++) {
    const latitude = y / canvas.height
    const bands = Math.sin(latitude * 72 + seed * 2.1)
      + 0.55 * Math.sin(latitude * 155 + seed * 0.67)
    for (let x = 0; x < canvas.width; x++) {
      const u = x / canvas.width
      const turbulence = Math.sin(u * 37 + latitude * 31 + 5 * Math.sin(u * 17 + latitude * 22))
        * .36 + Math.sin(u * 94 - latitude * 68) * .15
      const jet = bands * .24 + turbulence + .22 * Math.sin(latitude * 21 + u * 13)
      const crest = Math.max(0, Math.min(1, jet * .84 + .42))
      const mixed = crest > .58 ? bright : crest > .26 ? middle : deep
      const glow = .66 + .34 * Math.max(0, Math.min(1, latitude * 2.3))
      const bandShade = .75 + crest * .34
      const offset = (y * canvas.width + x) * 4
      image.data[offset] = Math.min(255, mixed[0] * glow * bandShade)
      image.data[offset + 1] = Math.min(255, mixed[1] * glow * bandShade)
      image.data[offset + 2] = Math.min(255, mixed[2] * glow * bandShade)
      image.data[offset + 3] = 255
    }
  }
  ctx.putImageData(image, 0, 0)
  const texture = Texture.from(canvas)
  texture.source.scaleMode = 'linear'
  return texture
}

function createStarTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 64
  const ctx = canvas.getContext('2d')
  if (!ctx) return Texture.WHITE
  const radial = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
  radial.addColorStop(0, 'rgba(255,255,255,1)')
  radial.addColorStop(.09, 'rgba(255,255,255,1)')
  radial.addColorStop(.26, 'rgba(255,255,255,.48)')
  radial.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = radial
  ctx.fillRect(0, 0, 64, 64)
  return Texture.from(canvas)
}

export class SpaceWorld3D {
  readonly view = new View3D({
    autoResize: true,
    environment: { skyColor: 0x7297bd, groundColor: 0x131c35, intensity: .55 },
  })
  private readonly geometries = [
    new SphereGeometry({ radius: 1, widthSegments: 48, heightSegments: 32 }),
    new IcosahedronGeometry({ radius: 1, detail: 1 }),
    new TorusGeometry({ radius: 1.22, tube: .04, radialSegments: 8, tubularSegments: 72 }),
    new TorusGeometry({ radius: 1.48, tube: .035, radialSegments: 8, tubularSegments: 72 }),
    new CylinderGeometry({ radiusTop: .25, radiusBottom: .25, height: 1.8, radialSegments: 12 }),
  ]
  private readonly starTexture = createStarTexture()
  private readonly planets = Array.from({ length: 3 }, () =>
    new Mesh3D({ geometry: this.geometries[0],
      material: new Material3D({ baseColor: 0xffffff, roughness: .84, metallic: .02 }),
      castShadow: false, receiveShadow: false }))
  private readonly rings = Array.from({ length: 2 }, (_, i) =>
    new Mesh3D({ geometry: this.geometries[2 + i],
      material: new Material3D({ baseColor: SPACE_THEMES[0].ring, roughness: .78, metallic: .12 }),
      castShadow: false, receiveShadow: false }))
  private readonly starfield = new ParticleContainer3D({
    texture: this.starTexture, capacity: STAR_COUNT, blendMode: 'add',
  })
  private readonly starPositions: StarPosition[] = Array.from({ length: STAR_COUNT }, (_, i) => {
    const z = between(i, 20, -WORLD_DEPTH, -12)
    // Camera frustum widens with depth. Distribute points in perspective
    // rather than making a flat sheet glued to the screen.
    return {
      x: between(i, 21, -1, 1) * -z * .66,
      y: between(i, 22, -1, 1) * -z * .46,
      z,
      size: between(i, 23, .09, .4),
      tint: packParticleColor(i % 13 === 0 ? 0xffdb9c : i % 7 === 0 ? 0x92ddff : 0xffffff,
        between(i, 24, .48, .98)),
      speed: between(i, 25, .55, 1.65),
    }
  })
  private readonly rocks: FlyingBody[] = []
  private readonly nebula = Array.from({ length: 5 }, () => new Sprite3D({
    texture: Texture.WHITE, width: 42, height: 42, alpha: .28,
  }))
  private readonly station: Mesh3D[] = []
  private readonly ownedTextures: Texture[] = []
  private readonly materials: Material3D[] = []
  private lastTime = 0
  private clock = 0
  private stageKey = -1
  private sceneToken = -1
  private disposed = false

  constructor() {
    this.view.eventMode = 'none'
    this.view.camera.fov = 61
    this.view.camera.near = .5
    this.view.camera.far = 320
    this.view.camera.position.set(0, 0, 12)
    this.view.camera.lookAt({ x: 0, y: 0, z: -50 })

    const sun = new DirectionalLight({ color: 0xd8edff, intensity: 2.6 })
    sun.position.set(-9, 8, 14)
    sun.lookAt({ x: 0, y: 0, z: -40 })
    this.view.root.addChild(new AmbientLight({ color: 0x819fc1, intensity: .36 }), sun)
    this.view.root.addChild(this.starfield)
    this.planets.forEach((planet) => this.view.root.addChild(planet))
    this.rings.forEach((ring) => this.view.root.addChild(ring))
    this.nebula.forEach((cloud) => this.view.root.addChild(cloud))

    // A real 3D deep-space landmark and separate tumbling asteroid field.
    // Reuse geometry/materials so each field batches instead of rebuilding
    // meshes, and keep these as scenic objects only (no collision changes).
    const rocky = new Material3D({ baseColor: 0x607995, roughness: .94 })
    const slate = new Material3D({ baseColor: 0x384967, roughness: .91 })
    const bright = new Material3D({ baseColor: 0x9a8195, roughness: .83 })
    this.materials.push(rocky, slate, bright)
    for (let i = 0; i < ROCK_COUNT; i++) {
      const rock = new Mesh3D({
        geometry: this.geometries[1],
        material: this.materials[i % this.materials.length],
        castShadow: false, receiveShadow: false,
      })
      const scale = between(i, 4, .12, .68)
      rock.scale.set(scale * between(i, 5, .75, 1.4), scale, scale * between(i, 6, .65, 1.3))
      const z = between(i, 7, -94, -22)
      const x = between(i, 8, -1, 1) * -z * .75
      const y = between(i, 9, -1, 1) * -z * .46
      rock.position.set(x, y, z)
      this.rocks.push({ node: rock, x, y, depth: z, speed: between(i, 10, .22, .67), seed: i })
      this.view.root.addChild(rock)
    }

    const hull = new Material3D({ baseColor: 0x7b9bc2, roughness: .57, metallic: .62 })
    const glow = new Material3D({ baseColor: 0x63cbef, roughness: .39, metallic: .35 })
    this.materials.push(hull, glow)
    for (let i = 0; i < 3; i++) {
      const mesh = new Mesh3D({
        geometry: i === 0 ? this.geometries[4] : this.geometries[i + 1],
        material: i === 2 ? glow : hull,
        castShadow: false, receiveShadow: false,
      })
      if (i === 1) mesh.scale.set(2.1, 2.1, .32)
      if (i === 2) mesh.scale.set(1.45, 1.45, .28)
      mesh.position.set(-19, -10, -56)
      mesh.rotation.x = .85
      this.station.push(mesh)
      this.view.root.addChild(mesh)
    }

    // Each surface material gets its texture exactly once, never per frame.
    SPACE_THEMES.forEach((theme, index) => {
      const texture = createPlanetTexture(index + 1, theme)
      this.ownedTextures.push(texture)
    })
    this.changeStage(1)
    this.update({ time: 0, stageTheme: 1, width: 720, height: 1280,
      stageRush: 0, paused: false, reducedMotion: false, runToken: 0 })
  }

  private changeStage(stageTheme: number) {
    this.stageKey = stageTheme
    const region = (Math.max(1, stageTheme) - 1) % SPACE_THEMES.length
    const theme = SPACE_THEMES[region]
    this.planets.forEach((mesh, index) => {
      const material = mesh.material as Material3D
      material.textures.baseColor = this.ownedTextures[(region + index) % this.ownedTextures.length]
      material.baseColor = 0xffffff
      const z = -62 - index * 34
      const x = (index % 2 ? -1 : 1) * (10 + index * 18)
      mesh.position.set(x, index === 0 ? 13 : -9 + index * 6, z)
      const diameter = index === 0 ? 10 : index === 1 ? 4.8 : 2.9
      mesh.scale.set(diameter, diameter, diameter)
    })
    this.rings.forEach((ring, index) => {
      ;(ring.material as Material3D).baseColor = theme.ring
      ring.position.set(this.planets[0].position.x, this.planets[0].position.y,
        this.planets[0].position.z)
      ring.scale.set(10, 10, 10)
      ring.rotation.set(.4, .4 + index * .05, .16)
      ring.visible = region % 2 === 0
    })
    this.nebula.forEach((cloud, index) => {
      cloud.texture = getCosmosBackdrop((region + index) % 4)
        ?? getCosmosLandmark((region + index) % 4) ?? Texture.WHITE
      cloud.position.set((index % 2 ? -1 : 1) * (18 + 17 * index),
        index % 2 ? -20 : 19, -100 - index * 33)
      cloud.width = 55 + index * 16
      cloud.height = 58 + index * 14
      cloud.alpha = .18 + (index % 3) * .055
    })
  }

  update(frame: SpaceWorld3DFrame) {
    if (this.disposed) return
    if (this.stageKey !== frame.stageTheme || this.sceneToken !== frame.runToken) {
      this.sceneToken = frame.runToken
      this.changeStage(frame.stageTheme)
    }
    const dt = this.lastTime <= 0 ? 0 : Math.max(0, Math.min(.05, (frame.time - this.lastTime) / 1000))
    this.lastTime = frame.time
    if (!frame.paused && !frame.reducedMotion) this.clock += dt
    const t = this.clock
    const rush = 1 + Math.max(0, Math.min(1, frame.stageRush)) * 2.6

    // 3D camera perspective: fly forward through the star volume while distant
    // planets have independent orbital movement. Never follow player banking.
    this.view.camera.position.set(Math.sin(t * .075) * .36, Math.cos(t * .09) * .2, 12)
    this.view.camera.lookAt({ x: Math.sin(t * .045) * .28, y: 0, z: -50 })
    this.planets.forEach((planet, index) => {
      planet.rotation.y = t * (.018 + index * .009)
      planet.rotation.z = .11 * Math.sin(t * .025 + index)
    })
    this.rings.forEach((ring) => { ring.rotation.z = .16 + .018 * Math.sin(t * .11) })
    this.station.forEach((mesh, index) => {
      mesh.rotation.y = .16 + t * .009
      mesh.rotation.z = t * .012 + index * .1
    })
    this.nebula.forEach((cloud, index) => {
      cloud.rotation.z = .025 * Math.sin(t * .13 + index)
    })

    for (let i = 0; i < STAR_COUNT; i++) {
      const star = this.starPositions[i]
      const depthRange = WORLD_DEPTH - 12
      const depth = -12 - (((-star.z - 12) - t * (7 * rush * star.speed)) % depthRange + depthRange) % depthRange
      // Use perspective world coordinates proportional to the original depth;
      // receding stars remain anchored across camera movement, not attached
      // to the 2D player or dragged by steering.
      this.starfield.writePacked(i, star.x, star.y, depth, star.size, 0, star.tint)
    }
    this.starfield.upload()

    this.rocks.forEach(({ node, x, y, depth, speed, seed }) => {
      const range = 80
      const z = -18 - (((-depth - 18) - t * (1.1 * rush * speed)) % range + range) % range
      node.position.set(x, y, z)
      node.rotation.x = t * (.018 + seed * .001)
      node.rotation.y = t * (.03 + seed * .0009)
    })
  }

  destroy() {
    if (this.disposed) return
    this.disposed = true
    this.view.destroy({ children: true })
    this.geometries.forEach((geometry) => geometry.destroy())
    this.materials.forEach((material) => material.destroy())
    this.planets.forEach((planet) => planet.material.destroy())
    this.rings.forEach((ring) => ring.material.destroy())
    for (const texture of this.ownedTextures) texture.destroy(true)
    this.starTexture.destroy(true)
  }
}
