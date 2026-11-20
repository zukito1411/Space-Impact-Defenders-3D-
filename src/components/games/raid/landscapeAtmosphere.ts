import { PlanetFlightSurface } from './planetFlightSurface'
import { PlanetFlightTerrain } from './planetFlightTerrain'
import { planetFlightTravel, projectPlanetFlightPoint, type PlanetFlightPoint } from './planetFlightCamera'
import { samplePlanetMountain } from './planetTerrainGeometry'
import type { ShipLightingFrame } from './shipLighting'
import { Container, Graphics, Sprite, Texture, type Renderer } from 'pixi.js'
import { atmosphereNoise, bakeAtmosphereCloud, bakePlanetTerrain, bakePlanetWater, sampleLandscapeAtmosphere } from './planetAtmosphereArt'
import type { LandscapeAtmosphereFrame, PlanetAtmosphereKind } from './planetAtmosphereArt'
import { getPlanetWeatherArt, getSurfaceTerrain } from './surfaceArt'
import { samplePlanetFlightParticle } from './planetFlightParticles'
import type { PlanetFlightParticle } from './planetFlightParticles'
import { CelestialScenery } from './celestialScenery'

type Art = { sky: Texture; terrain: Texture[]; water: Texture }
const mod = (n: number, span: number) => ((n % span) + span) % span
function canvas(width: number, height: number) {
  const source = document.createElement('canvas'); source.width = width; source.height = height
  return source
}
function texture(source: HTMLCanvasElement, repeat = false) {
  const result = Texture.from(source)
  result.source.scaleMode = 'linear'
  result.source.autoGenerateMipmaps = true
  if (repeat) { result.source.style.addressModeU = 'repeat'; result.source.style.addressModeV = 'clamp-to-edge' }
  return result
}
function pixels(data: Uint8ClampedArray, width: number, height: number, repeat = false) {
  const source = canvas(width, height), ctx = source.getContext('2d')!
  const image = ctx.createImageData(width, height); image.data.set(data); ctx.putImageData(image, 0, 0)
  return texture(source, repeat)
}
function makeTerrain(kind: PlanetAtmosphereKind, layer: number) {
  const source = canvas(1024, 256), ctx = source.getContext('2d')!
  const image = ctx.createImageData(1024, 256)
  image.data.set(bakePlanetTerrain(kind, layer)); ctx.putImageData(image, 0, 0)
  const basalt = getSurfaceTerrain(1)
  if (basalt) {
    ctx.globalCompositeOperation = 'source-atop'; ctx.globalAlpha = layer === 0 ? .2 : .32
    ctx.filter = 'saturate(.18) brightness(.65)'
    for (let x = 0; x < 1024; x += 256) ctx.drawImage(basalt.source.resource as CanvasImageSource, x, 0, 256, 256)
  }
  return texture(source, true)
}
function makeSky(kind: PlanetAtmosphereKind) {
  const source = canvas(1024, 512), ctx = source.getContext('2d')!, wet = kind === 'pelagic'
  const sky = ctx.createLinearGradient(0, 0, 0, 512)
  for (const [offset, color] of (wet ? [[0, '#080f24'], [.33, '#1a2749'], [.58, '#5f5372'], [.69, '#7595a5'], [.79, '#193a50'], [1, '#071c31']]
    : [[0, '#0c1120'], [.32, '#302432'], [.57, '#69434a'], [.69, '#b06c49'], [.8, '#42303a'], [1, '#101723']]) as [number, string][]) sky.addColorStop(offset, color)
  ctx.fillStyle = sky; ctx.fillRect(0, 0, 1024, 512)
  // Fine atmospheric density breaks up the flat gradient, lit from the horizon.
  const image = ctx.getImageData(0, 0, 1024, 512)
  for (let y = 0; y < 512; y++) for (let x = 0; x < 1024; x++) {
    const density = atmosphereNoise(x / 110, y / 24, wet ? 17 : 78) - .48
    const strength = Math.sin(y / 512 * Math.PI) * 19
    const i = (y * 1024 + x) * 4
    image.data[i] += density * strength; image.data[i + 1] += density * strength; image.data[i + 2] += density * strength * 1.4
  }
  ctx.putImageData(image, 0, 0)
  const glow = ctx.createRadialGradient(740, 310, 0, 740, 310, 360)
  glow.addColorStop(0, wet ? 'rgba(217,183,170,.18)' : 'rgba(255,145,65,.15)'); glow.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = glow; ctx.fillRect(0, 0, 1024, 512)
  return texture(source)
}
function makeWater() {
  const water = pixels(bakePlanetWater(), 1024, 512)
  water.source.style.addressMode = 'repeat'
  return water
}

/** Upright, pooled horizon layers inside the rotated logical playfield. */
export class LandscapePlanetAtmosphere {
  readonly root = new Container()
  private readonly sky = new Sprite(Texture.WHITE)
  private readonly celestialSky = new CelestialScenery()
  private surface: PlanetFlightSurface | null = null
  private readonly water = new Sprite(Texture.WHITE)
  private readonly terrain = new Map<PlanetAtmosphereKind, PlanetFlightTerrain>()
  private readonly attachment: PlanetFlightPoint = { x: 0, y: 0, scale: 1 }
  private readonly clouds = Array.from({ length: 8 }, () => new Sprite(Texture.WHITE))
  private readonly mist = [new Sprite(Texture.WHITE), new Sprite(Texture.WHITE)]
  private readonly vents = Array.from({ length: 24 }, () => new Sprite(Texture.WHITE))
  private readonly plumes = Array.from({ length: 48 }, () => new Sprite(Texture.WHITE))
  private readonly motes = Array.from({ length: 72 }, () => new Sprite(Texture.WHITE))
  private readonly ashLayer = new Container()
  private readonly emberLayer = new Container()
  private readonly speedLines = Array.from({ length: 20 }, () => new Sprite(Texture.WHITE))
  private readonly spray = Array.from({ length: 6 }, () => new Sprite(Texture.WHITE))
  private readonly lightning = new Graphics()
  private readonly art = new Map<PlanetAtmosphereKind, Art>()
  private cloud: Texture | null = null
  private glow: Texture | null = null
  private streakTexture: Texture | null = null
  private flakeTexture: Texture | null = null
  private readonly particle: PlanetFlightParticle = { x: 0, y: 0, width: 0, height: 0, alpha: 0, rotation: 0, near: false }
  private current = ''
  private lastTime: number | null = null
  private motionTime = 0
  private readonly frame: LandscapeAtmosphereFrame = { width: 1, height: 1, horizon: 1, seconds: 0, cloudCount: 0, moteCount: 0 }
  constructor() {
    this.root.visible = false
    this.root.addChild(this.sky, this.celestialSky.root, this.water, ...this.vents, ...this.plumes, ...this.clouds, ...this.mist, ...this.spray, this.lightning, this.ashLayer, this.emberLayer, ...this.speedLines)
    for (const sprite of [...this.clouds, ...this.mist, ...this.vents, ...this.plumes, ...this.motes, ...this.speedLines, ...this.spray]) sprite.anchor.set(.5)
    for (const sprite of [...this.vents, ...this.motes]) sprite.blendMode = 'add'
    this.root.eventMode = 'none'
  }
  warm() {
    if (this.cloud) return
    this.cloud = pixels(bakeAtmosphereCloud(), 512, 192)
    const source = canvas(128, 128), ctx = source.getContext('2d')!
    const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 62)
    gradient.addColorStop(0, '#ffffff'); gradient.addColorStop(.12, 'rgba(255,255,255,.6)'); gradient.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, 128, 128); this.glow = texture(source)
    const streak = canvas(256, 8), line = streak.getContext('2d')!
    const taper = line.createLinearGradient(0, 0, 256, 0)
    taper.addColorStop(0, 'rgba(255,255,255,0)'); taper.addColorStop(.24, 'rgba(255,255,255,.2)')
    taper.addColorStop(.8, 'rgba(255,255,255,.95)'); taper.addColorStop(1, 'rgba(255,255,255,0)')
    line.fillStyle = taper; line.beginPath(); line.moveTo(0, 4); line.lineTo(206, 1); line.lineTo(256, 4); line.lineTo(206, 7); line.closePath(); line.fill()
    line.fillRect(40, 3.5, 205, 1); this.streakTexture = texture(streak)
    const flake = canvas(24,24), ash = flake.getContext('2d')!
    ash.fillStyle = '#d7c6b0'; ash.beginPath(); ash.moveTo(5,7); ash.lineTo(16,5); ash.lineTo(20,13); ash.lineTo(10,18); ash.lineTo(4,13); ash.closePath(); ash.fill()
    ash.fillStyle = '#fff6e6'; ash.fillRect(6,8,8,2); this.flakeTexture = texture(flake)
    const water = makeWater()
    this.surface = new PlanetFlightSurface(water)
    this.root.addChildAt(this.surface.mesh, this.root.getChildIndex(this.water) + 1)
    for (const kind of ['pelagic', 'cinder'] as const) this.art.set(kind, { sky: makeSky(kind),
      terrain: [0, 1, 2].map(layer => makeTerrain(kind, layer)), water })
    for (const kind of ['pelagic', 'cinder'] as const) {
      const terrain = new PlanetFlightTerrain(kind,getSurfaceTerrain(1) ?? this.art.get(kind)!.terrain[1])
      this.terrain.set(kind,terrain)
      this.root.addChildAt(terrain.mesh,this.root.getChildIndex(this.surface.mesh)+1)
    }
    for (const sprite of [...this.clouds, ...this.mist, ...this.plumes, ...this.spray]) sprite.texture = this.cloud
    for (const sprite of [...this.vents, ...this.motes]) sprite.texture = this.glow
    for (const sprite of this.speedLines) sprite.texture = this.streakTexture
  }
  async prepare(renderer: Renderer) {
    await this.surface?.prepare(renderer)
    for (const terrain of this.terrain.values()) await terrain.prepare(renderer)
  }
  update(logicalWidth: number, logicalHeight: number, time: number, kind: PlanetAtmosphereKind, quality: string, reduced: boolean, paused = false, speed = 0, lighting?: ShipLightingFrame) {
    const art = this.art.get(kind)
    if (!art) return
    if (this.lastTime === null) this.motionTime = time
    else if (!paused) this.motionTime += Math.max(0, Math.min(1000, time - this.lastTime))
    this.lastTime = time
    const frame = sampleLandscapeAtmosphere(logicalWidth, logicalHeight, this.motionTime, reduced, quality, this.frame)
    const { width: w, height: h, seconds: t } = frame, wet = kind === 'pelagic'
    this.root.visible = true; this.root.position.set(0, logicalHeight); this.root.rotation = -Math.PI / 2
    if (this.current !== kind) {
      this.current = kind; this.sky.texture = art.sky; this.water.texture = art.water
      for (const sprite of this.clouds) sprite.texture = getPlanetWeatherArt(wet ? 0 : 1) ?? this.cloud!
      for (const sprite of this.spray) sprite.texture = getPlanetWeatherArt(2) ?? this.cloud!
      for (const sprite of this.plumes) sprite.texture = getPlanetWeatherArt(3) ?? this.cloud!
      // Keep every mote, but submit each blend mode contiguously. Interleaving
      // one ember with three ash flakes forced two batch breaks per group.
      for (let i = 0; i < this.motes.length; i++) {
        const mote = this.motes[i], glowing = wet || i % 4 === 0
        mote.texture = glowing ? this.glow! : this.flakeTexture!
        mote.blendMode = glowing ? 'add' : 'normal'
        ;(glowing ? this.emberLayer : this.ashLayer).addChild(mote)
      }
    }
    // The shared oblique camera looks down at the surface. These full-screen
    // layers are completely covered by the opaque ground; skip their submission.
    this.sky.visible = false; this.celestialSky.root.visible = false
    this.sky.width = w; this.sky.height = h
    this.surface?.update(w,h,t,wet,wet ? art.water : getSurfaceTerrain(1) ?? art.terrain[1],lighting)
    this.water.visible = false; this.water.position.set(-w * .015 + Math.sin(t * .13) * w * .006, frame.horizon)
    this.water.width = w * 1.03; this.water.height = h - frame.horizon
    this.water.alpha = .96 + Math.sin(t * .33) * .025
    for (const [terrainKind, terrain] of this.terrain) {
      terrain.mesh.visible = terrainKind === kind
      if (terrain.mesh.visible) terrain.update(w,h,t,lighting)
    }
    for (let i = 0; i < this.clouds.length; i++) {
      const sprite = this.clouds[i]; sprite.visible = i < frame.cloudCount
      if (!sprite.visible) continue
      const lane = i % 4
      sprite.position.set(mod(w * (.16 + i * .217) - t * w * (.0018 + i * .00025) + w * .5, w * 1.6) - w * .3,
        h * (.12 + lane * .135) + (reduced ? 0 : Math.sin(t * .035 + i) * h * .009))
      const billow = 1 + Math.sin(t * (.034 + i * .003) + i * 1.7) * .025
      sprite.width = w * (.5 + i % 3 * .1) * billow; sprite.height = h * (.31 + i % 2 * .07) / billow
      sprite.tint = wet ? i % 2 ? 0x9aadc9 : 0xd0d4e4 : i % 2 ? 0xb9a4a8 : 0xe2c6b7
      sprite.alpha = (wet ? .34 + lane * .03 : .36 + lane * .025) * (.96 + Math.sin(t * .059 + i * 1.3) * .04)
      sprite.rotation = (i % 2 ? -.025 : .02) + Math.sin(t * .021 + i) * .008
    }
    for (let i = 0; i < 2; i++) {
      const fog = this.mist[i]
      fog.position.set(w * (.28 + i * .48) + Math.sin(t * .025 + i) * w * .025, h * (.68 + i * .16))
      fog.width = w * 1.2; fog.height = h * (i ? .14 : .16)
      fog.tint = wet ? 0x97cae0 : 0xc49278; fog.alpha = wet ? .11 : .095
    }
    const peaks = this.terrain.get('cinder')!.peaks, travel = planetFlightTravel(t)
    for (let i = 0; i < this.vents.length; i++) {
      const peak = peaks[i], vent = this.vents[i]
      const point = projectPlanetFlightPoint(peak.x,samplePlanetMountain(0,0,peak,false),peak.distance,w,h,travel,this.attachment)
      const visible = !wet && point.x > -w*.2 && point.x < w*1.2 && point.y > -h*.4 && point.y < h*1.3
      vent.visible = visible
      vent.position.set(point.x,point.y); vent.width = point.scale*.11; vent.height = point.scale*.035
      vent.tint = 0xff632b; vent.alpha = .32 + Math.sin(t*.7+i*2)*.055
      for (let p = 0; p < 2; p++) {
        const smoke = this.plumes[i*2+p]; smoke.visible = visible
        if (!visible) continue
        const age = mod(t*.055+p*.5+i*.23,1)
        smoke.position.set(point.x+point.scale*(.025+age*.08),point.y-point.scale*(.02+age*.2))
        smoke.width = point.scale*(.14+age*.24); smoke.height = point.scale*(.1+age*.17)
        smoke.rotation = -.22; smoke.tint = p ? 0x9c8696 : 0xdca590
        smoke.alpha = Math.sin(age*Math.PI)*(p ? .22 : .3)
      }
    }
    // A restrained local storm flicker, never a full-screen flash.
    this.lightning.clear()
    const storm = mod(t + 7, 19), flash = wet && !reduced && quality !== 'low' && storm < .18
    if (flash) {
      const x = w * .78, y = h * .38
      this.lightning.moveTo(x, y).lineTo(x - h * .013, y + h * .025).lineTo(x + h * .006, y + h * .022)
        .lineTo(x - h * .018, y + h * .07).stroke({ color: 0xc4caff, width: 1, alpha: .36 * (1 - storm / .18) })
    }
    for (let i = 0; i < this.spray.length; i++) {
      const sprite = this.spray[i]; sprite.visible = wet
      const phase = mod(t * .07 + i * .167, 1), x = mod(i * w * .31 - t * w * .006, w)
      sprite.position.set(x, h * (.75 + i % 2 * .18) - h * phase * .03)
      sprite.width = w * (.13 + phase * .07); sprite.height = h * (.025 + phase * .025)
      sprite.tint = 0x9ed3df; sprite.alpha = Math.sin(phase * Math.PI) * .13
    }
    const particleCount = frame.moteCount
    for (let i = 0; i < this.motes.length; i++) {
      const mote = this.motes[i]; mote.visible = i < particleCount
      if (!mote.visible) continue
      const p = samplePlanetFlightParticle(i, t, w, h, wet, speed, false, this.particle)
      mote.position.set(p.x,p.y); mote.width = p.width; mote.height = p.height; mote.rotation = p.rotation
      mote.tint = wet ? 0xa7c9de : i % 4 === 0 ? 0xff8948 : 0xada0a0; mote.alpha = p.alpha
    }
    const lineCount = reduced ? 0 : quality === 'low' ? 5 : quality === 'medium' ? 12 : 20
    for (let i = 0; i < this.speedLines.length; i++) {
      const line = this.speedLines[i]; line.visible = i < lineCount
      if (!line.visible) continue
      const p = samplePlanetFlightParticle(i, t, w, h, wet, speed, true, this.particle)
      line.position.set(p.x,p.y); line.width = p.width; line.height = p.height; line.alpha = p.alpha
      line.tint = wet ? 0xb3d3eb : 0xd5ac97
    }
  }
  get seconds() { return this.frame.seconds }
  hide() { this.root.visible = false; this.lastTime = null }
  destroy() {
    this.celestialSky.destroy()
    this.surface?.destroy(); this.surface = null
    for (const terrain of this.terrain.values()) terrain.destroy()
    this.terrain.clear()
    this.root.destroy({ children: true })
    const textures = new Set<Texture>()
    for (const art of this.art.values()) for (const item of [art.sky, art.water, ...art.terrain]) textures.add(item)
    if (this.cloud) textures.add(this.cloud)
    if (this.glow) textures.add(this.glow)
    if (this.streakTexture) textures.add(this.streakTexture)
    if (this.flakeTexture) textures.add(this.flakeTexture)
    for (const item of textures) item.destroy(true)
    this.art.clear(); this.cloud = null; this.glow = null; this.streakTexture = null; this.flakeTexture = null
  }
}
