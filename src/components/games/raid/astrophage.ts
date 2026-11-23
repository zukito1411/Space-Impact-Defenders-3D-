import { Container, Sprite, Texture } from 'pixi.js'
import { ASTROPHAGE_DURATION, ASTROPHAGE_START } from './cruiseTiming'
import type { ShipLightingFrame } from './shipLighting'
import { seededNoise } from './utils'

const PARTICLE_COUNT = 252
const LOW_PARTICLES = 132
const TINTS = [0xff4255, 0xe61a43, 0xc22656, 0xff705c, 0xff426f, 0xfa5260]
const RED_FILL = [1, .055, .095]
const RED_SKY = [1, .075, .15]
const RED_GROUND = [.62, .018, .057]
type Fleck = { sprite: Sprite; lane: number; offset: number; start: number; depth: number; phase: number; speed: number; glint: boolean }

function createGlintTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 64
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const halo = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
  halo.addColorStop(0, '#fff')
  halo.addColorStop(.12, 'rgba(255,255,255,.65)')
  halo.addColorStop(.45, 'rgba(255,255,255,.14)')
  halo.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = halo
  ctx.fillRect(0, 0, 64, 64)
  // A soft four-point flash retains a small core at low resolution.
  ctx.globalCompositeOperation = 'lighter'
  for (let i = 0; i < 2; i++) {
    const ray = ctx.createLinearGradient(0, 11, 0, 53)
    ray.addColorStop(0, 'rgba(255,255,255,0)')
    ray.addColorStop(.5, 'rgba(255,255,255,.82)')
    ray.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = ray
    ctx.beginPath()
    ctx.moveTo(32, 11)
    ctx.quadraticCurveTo(34, 30, 38, 32)
    ctx.quadraticCurveTo(34, 34, 32, 53)
    ctx.quadraticCurveTo(30, 34, 26, 32)
    ctx.quadraticCurveTo(30, 30, 32, 11)
    ctx.fill()
    ctx.translate(64, 0)
    ctx.rotate(Math.PI / 2)
  }
  return Texture.from(canvas, true)
}

/** The point cloud shares the scenery pass and the hulls' existing environmental lights. */
export class AstrophageField {
  readonly root = new Container()
  private readonly haze: Sprite[] = []
  private particles: Fleck[] = []
  private glintTexture: Texture | null = null
  private irradiance = 0

  constructor() {
    this.root.visible = false
  }

  prepare(texture: Texture) {
    this.glintTexture = createGlintTexture()
    for (let i = 0; i < 6; i++) {
      const sprite = new Sprite(texture)
      sprite.anchor.set(.5)
      sprite.blendMode = 'add'
      sprite.tint = i % 2 === 0 ? 0xdd1232 : 0x880f39
      this.haze.push(sprite)
      this.root.addChild(sprite)
    }
    this.particles = Array.from({ length: PARTICLE_COUNT }, (_, i) => {
      const glint = i % 10 === 0
      const sprite = new Sprite(glint ? this.glintTexture ?? texture : texture)
      sprite.anchor.set(.5)
      sprite.blendMode = 'add'
      sprite.tint = TINTS[i % TINTS.length]
      this.root.addChild(sprite)
      return {
        sprite, glint, lane: i % 4, offset: seededNoise(i, 17) - .5,
        start: seededNoise(i, 31), depth: seededNoise(i, 47),
        phase: seededNoise(i, 67) * Math.PI * 2, speed: .75 + seededNoise(i, 73) * 3.4,
      }
    })
  }

  update(age: number, width: number, height: number, low: boolean, reduced: boolean) {
    const elapsed = age - ASTROPHAGE_START
    const opacity = Math.max(0, Math.min(1, elapsed / 1.8, (ASTROPHAGE_DURATION - elapsed) / 2.1))
    this.root.visible = opacity > 0 && this.particles.length > 0
    if (!this.root.visible) {
      this.irradiance = 0
      return
    }

    const travel = reduced ? elapsed * .64 : elapsed
    this.root.alpha = opacity
    this.irradiance = opacity * (reduced ? .91 : .88 + .12 * Math.sin(elapsed * .92))
    for (let i = 0; i < this.haze.length; i++) {
      const sprite = this.haze[i]
      const y = (.34 + i * .198 + travel * .026) % 1.38 - .19
      const curve = Math.sin(y * 5.4 + i * .55)
      sprite.position.set(width * (.47 + curve * .23), y * height)
      sprite.width = width * (.52 + .09 * (i % 2))
      sprite.height = height * .56
      sprite.rotation = curve * .34
      sprite.alpha = .34
    }

    const budget = low ? LOW_PARTICLES : PARTICLE_COUNT
    const scale = Math.max(.86, Math.min(1.52, width / 410))
    for (let i = 0; i < this.particles.length; i++) {
      const { sprite, lane, offset, start, depth, phase, speed, glint } = this.particles[i]
      sprite.visible = i < budget
      if (!sprite.visible) continue
      const y = (start * 1.18 + travel * (.028 + depth * .075)) % 1.18 - .09
      const bend = Math.sin(y * 6.3 + travel * .23 + lane * .72)
      const x = .17 + lane * .185 + bend * .145 + offset * (.18 + depth * .13)
      const wave = reduced ? .68 : .5 + .5 * Math.sin(elapsed * speed + phase)
      const twinkle = wave * wave * wave
      const size = scale * (glint ? 10 + 15 * depth + twinkle * 8 : 2.8 + depth * depth * 9.5)
      sprite.position.set(x * width, y * height)
      sprite.width = size
      sprite.height = size * (glint ? 1.13 : 1.08 + depth * 1.05)
      sprite.rotation = bend * (glint ? .65 : .31)
      sprite.alpha = glint ? .27 + twinkle * .68 : .31 + depth * .37 + twinkle * .31
    }
  }

  illuminate(lighting: ShipLightingFrame) {
    const gain = this.irradiance
    if (gain <= 0) return
    for (let i = 0; i < 3; i++) {
      lighting.fillColor[i] += (RED_FILL[i] - lighting.fillColor[i]) * gain
      lighting.skyColor[i] += (RED_SKY[i] - lighting.skyColor[i]) * gain * .84
      lighting.groundColor[i] += (RED_GROUND[i] - lighting.groundColor[i]) * gain * .88
    }
    // Scattered red light stays visible on eclipse-side hulls, preserving the star's key.
    lighting.fillDirection[2] += (.92 - lighting.fillDirection[2]) * gain
    lighting.fillIntensity += 1.82 * gain
    lighting.ambientIntensity += .44 * gain
  }

  destroy() {
    this.glintTexture?.destroy(true)
    this.glintTexture = null
  }
}
