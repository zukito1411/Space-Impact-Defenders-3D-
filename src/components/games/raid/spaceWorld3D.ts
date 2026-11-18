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
  AmbientLight, CubeGeometry, Container3D, CylinderGeometry, DirectionalLight,
  Geometry3D, IcosahedronGeometry, Material3D, Mesh3D, ParticleContainer3D,
  SphereGeometry, Sprite3D, TorusGeometry, View3D, packParticleColor,
} from '@pixi/3d'
import { Texture } from 'pixi.js'
import { createSpaceArtPack } from './spaceArtMaterials3D'

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

/** 
 * A true GPU annulus instead of a thick TorusGeometry tube. This planar
 * radial mesh produces realistic Saturn-style rings with rings woven out
 * of the already-loaded colorful dust atlas (alpha-tapered at both edges).
 * 80 segments = 162 verts, no CPU remeshing or per-frame allocations.
 */
function createAnnulus(inner: number, outer: number) {
  const segments = 80
  const positions = new Float32Array((segments + 1) * 2 * 3)
  const normals = new Float32Array((segments + 1) * 2 * 3)
  const uvs = new Float32Array((segments + 1) * 2 * 2)
  const indices = new Uint16Array(segments * 6)
  for (let i = 0; i <= segments; i++) {
    const t = i / segments
    const angle = t * Math.PI * 2
    const c = Math.cos(angle), sn = Math.sin(angle)
    for (let j = 0; j < 2; j++) {
      const radius = j === 0 ? inner : outer
      const p = (i * 2 + j) * 3
      positions[p] = c * radius
      positions[p + 1] = 0
      positions[p + 2] = sn * radius
      normals[p + 1] = 1
      const uv = (i * 2 + j) * 2
      uvs[uv] = t
      uvs[uv + 1] = j
    }
    if (i < segments) {
      const a = i * 2, ix = i * 6
      indices[ix] = a
      indices[ix + 1] = a + 2
      indices[ix + 2] = a + 1
      indices[ix + 3] = a + 1
      indices[ix + 4] = a + 2
      indices[ix + 5] = a + 3
    }
  }
  return new Geometry3D({ positions, normals, uvs, indices })
}

export class SpaceWorld3D {
  readonly view = new View3D({
    autoResize: true,
    environment: { skyColor: 0x92bdff, groundColor: 0x40285d, intensity: .72 },
  })
  private readonly art = createSpaceArtPack()
  private readonly geometries = [
    new SphereGeometry({ radius: 1, widthSegments: 64, heightSegments: 40 }),
    new IcosahedronGeometry({ radius: 1, detail: 2 }),
    createAnnulus(1.08, 1.78),
    createAnnulus(1.82, 1.98),
    new CylinderGeometry({ radiusTop: .25, radiusBottom: .25, height: 1.8, radialSegments: 12 }),
    new CubeGeometry({ width: 1, height: 1, depth: 1 }),
    new TorusGeometry({ radius: 1.24, tube: .085, radialSegments: 12, tubularSegments: 64 }),
  ]
  private readonly starTexture = createStarTexture()
  private readonly planets = Array.from({ length: 3 }, (_, index) =>
    new Mesh3D({
      geometry: this.geometries[0],
      material: new Material3D({
        baseColor: 0xffffff, baseColorTexture: this.art.planetMaps[index],
        roughness: .78, metallic: .035,
        emissive: { color: SPACE_THEMES[index].ice, strength: .19 },
      }),
      castShadow: false, receiveShadow: false,
    }))
  private readonly planetHalos = Array.from({ length: 3 }, (_, i) =>
    new Sprite3D({ texture: this.art.haloMaps[i], width: 28, height: 28, alpha: .92 }))
  private readonly rings = Array.from({ length: 2 }, (_, i) =>
    new Mesh3D({
      geometry: this.geometries[i + 2],
      material: new Material3D({
        baseColor: 0xffffff, baseColorTexture: this.art.ringMaps[i],
        alphaMode: 'blend', alpha: .94, roughness: .81, metallic: .08,
        emissive: { color: 0xc7dcff, strength: .30 },
      }),
      castShadow: false, receiveShadow: false,
    }))
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
  private readonly nebula = Array.from({ length: 8 }, () => new Sprite3D({
    texture: Texture.WHITE, width: 44, height: 44, alpha: .36,
  }))
  private readonly station = new Container3D()
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

    const key = new DirectionalLight({ color: 0xf5faff, intensity: 2.25 })
    key.position.set(-11, 15, 28)
    key.lookAt({ x: 0, y: 0, z: -40 })
    const rim = new DirectionalLight({ color: 0x68d9ff, intensity: 1.32 })
    rim.position.set(17, -5, -12)
    rim.lookAt({ x: 0, y: 0, z: -58 })
    const magenta = new DirectionalLight({ color: 0xf37dff, intensity: 1.03 })
    magenta.position.set(-18, -12, 16)
    magenta.lookAt({ x: 0, y: 0, z: -58 })
    this.view.root.addChild(new AmbientLight({ color: 0xb1bdff, intensity: .48 }), key, rim, magenta)
    this.nebula.forEach(cloud => this.view.root.addChild(cloud))
    this.view.root.addChild(this.starfield)
    this.planetHalos.forEach(halo => this.view.root.addChild(halo))
    this.planets.forEach(planet => this.view.root.addChild(planet))
    this.rings.forEach(ring => this.view.root.addChild(ring))

    // A real 3D deep-space landmark and separate tumbling asteroid field.
    // Reuse geometry/materials so each field batches instead of rebuilding
    // meshes, and keep these as scenic objects only (no collision changes).
    const rockMaterials = Array.from({ length: 3 }, (_, i) =>
      new Material3D({
        baseColorTexture: this.art.asteroidMaps[i], baseColor: 0xffffff,
        roughness: .82, metallic: .10,
        emissive: { color: [0x2fa9d8, 0xf47a42, 0x9f6ff0][i], strength: .19 },
      }))
    this.materials.push(...rockMaterials)
    for (let i = 0; i < ROCK_COUNT; i++) {
      const rock = new Mesh3D({
        geometry: this.geometries[1],
        material: rockMaterials[i % rockMaterials.length],
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

    // Real multi-part 3D wreck/station. Four existing 2D wreck atlas
    // illustrations now supply metallic panel, armor, engine and trim maps.
    const hull = new Material3D({
      baseColorTexture: this.art.armorMaps[0], baseColor: 0xffffff,
      roughness: .42, metallic: .68,
      emissive: { color: 0x387fd3, strength: .32 },
    })
    const plates = new Material3D({
      baseColorTexture: this.art.armorMaps[1], baseColor: 0xffffff,
      roughness: .52, metallic: .57,
      emissive: { color: 0x8d67ea, strength: .28 },
    })
    const engines = new Material3D({
      baseColorTexture: this.art.armorMaps[2], baseColor: 0xc5f9ff,
      roughness: .27, metallic: .41,
      emissive: { color: 0x18d9ff, strength: 2.25 },
    })
    const gold = new Material3D({
      baseColorTexture: this.art.armorMaps[3], baseColor: 0xffdda8,
      roughness: .39, metallic: .59,
      emissive: { color: 0xffac43, strength: .55 },
    })
    this.materials.push(hull, plates, engines, gold)
    const stationParts = [
      // [geometry index, material index, position XYZ, scale XYZ]
      [5,0,0,0,0,3.9,.70,1.2],
      [5,1,0,.15,-.5,1.8,.85,1.7],
      [5,1,-2.7,0,0,1.6,.24,2.5],
      [5,1,2.7,0,0,1.6,.24,2.5],
      [5,0,-3.7,.11,0,.23,2.0,.40],
      [5,0,3.7,.11,0,.23,2.0,.40],
      [4,2,0,0,1.4,.83,.83,1.1],
      [4,3,-1.6,0,1.0,.48,.48,.86],
      [4,3,1.6,0,1.0,.48,.48,.86],
      [6,3,0,0,-.42,1.6,1.6,1.6],
      [6,2,0,0,.3,1.20,1.20,1.20],
      [0,2,0,0,1.85,.38,.38,.38],
    ] as const
    const stationMats = [hull, plates, engines, gold]
    for (const [g, m, x, y, z, sx, sy, sz] of stationParts) {
      const mesh = new Mesh3D({ geometry: this.geometries[g],
        material: stationMats[m], castShadow: false, receiveShadow: false })
      mesh.position.set(x, y, z)
      mesh.scale.set(sx, sy, sz)
      if (g === 4) mesh.rotation.x = Math.PI / 2
      this.station.addChild(mesh)
    }
    this.station.position.set(-20, -8, -57)
    this.station.rotation.set(.47, -.28, .08)
    this.view.root.addChild(this.station)

    this.changeStage(1)
    this.update({ time: 0, stageTheme: 1, width: 720, height: 1280,
      stageRush: 0, paused: false, reducedMotion: false, runToken: 0 })
  }

  private changeStage(stageTheme: number) {
    this.stageKey = stageTheme
    const region = (Math.max(1, stageTheme) - 1) % SPACE_THEMES.length
    const theme = SPACE_THEMES[region]
    // Distinct near/mid/far positions mean three real rotating spheres, not
    // flat circular sprites following the user's steering.
    const arrangement = [
      { x: 18, y: 18, z: -60, radius: 13.8 },
      { x: -28, y: -11, z: -96, radius: 6.3 },
      { x: 28, y: -19, z: -128, radius: 3.9 },
    ]
    this.planets.forEach((mesh, index) => {
      const material = mesh.material as Material3D
      material.textures.baseColor = this.art.planetMaps[(region + index) % this.art.planetMaps.length]
      material.baseColor = 0xffffff
      if (material.emissive) material.emissive.color = SPACE_THEMES[(region + index) % SPACE_THEMES.length].ice
      const { x, y, z, radius } = arrangement[index]
      mesh.position.set(x, y, z)
      mesh.scale.set(radius, radius, radius)
      const halo = this.planetHalos[index]
      halo.texture = this.art.haloMaps[(region + index) % this.art.haloMaps.length]
      halo.position.set(x, y, z - .9)
      halo.width = radius * 2.74
      halo.height = radius * 2.74
      halo.alpha = index === 0 ? .98 : .76
    })
    this.rings.forEach((ring, index) => {
      const mat = ring.material as Material3D
      mat.textures.baseColor = this.art.ringMaps[(region + index) % this.art.ringMaps.length]
      if (mat.emissive) mat.emissive.color = theme.ring
      ring.position.set(this.planets[0].position.x, this.planets[0].position.y,
        this.planets[0].position.z)
      ring.scale.set(14.65, 14.65, 14.65)
      ring.rotation.set(.53, .24 + index * .05, .14)
      ring.visible = region % 2 === 0 || index === 0
    })
    this.nebula.forEach((cloud, index) => {
      cloud.texture = this.art.nebulaMaps[(index + region * 2) % this.art.nebulaMaps.length]
      const z = -78 - (index % 5) * 33 - Math.floor(index / 5) * 18
      cloud.position.set((index % 2 ? -1 : 1) * (13 + index * 12),
        index % 3 === 0 ? 28 : index % 3 === 1 ? -22 : 2, z)
      cloud.width = 64 + (index % 4) * 25
      cloud.height = 62 + (index % 3) * 30
      cloud.alpha = index % 3 === 0 ? .47 : index % 3 === 1 ? .38 : .32
      cloud.rotation.set((index % 2 ? 1 : -1) * .10, .14 * Math.sin(index * 2.4), index * .18)
    })
    this.station.position.set(region % 2 ? -18 : -20, -8, -57)
  }

  /** Allows CI to prove original artwork reaches genuine 3D geometry. */
  getArtworkDiagnostics() {
    return {
      sourceAtlases: this.art.artSources,
      texturedPlanets: this.planets.filter(m => Boolean((m.material as Material3D).textures.baseColor)).length,
      texturedRocks: this.rocks.filter(m => Boolean((m.node.material as Material3D).textures.baseColor)).length,
      stationParts: this.station.children.length,
      volumetricClouds: this.nebula.length,
      atmosphericHalos: this.planetHalos.length,
    }
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
    this.station.rotation.y = -.28 + t * .016
    this.station.rotation.z = .08 + .10 * Math.sin(t * .025)
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
    this.geometries.forEach(geometry => geometry.destroy())
    this.materials.forEach(material => material.destroy())
    this.planets.forEach(planet => planet.material.destroy())
    this.rings.forEach(ring => ring.material.destroy())
    this.art.dispose()
    this.starTexture.destroy(true)
  }
}
