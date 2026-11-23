import { Container, Sprite, type Texture } from 'pixi.js'
import { seededNoise } from './utils'

export const ASTROPHAGE_START = 16.2
export const ASTROPHAGE_DURATION = 11
const PARTICLE_COUNT = 96
const TINTS = [0xff2843, 0xe71b3a, 0x9e0d31, 0xff685d]

/** Decorative dust shared with the scenery pass. All points use the preloaded star texture. */
export class AstrophageField {
  readonly root = new Container()
  private readonly haze: Sprite[] = []
  private particles: Array<{ sprite: Sprite; lane: number; offset: number; start: number; depth: number }> = []

  constructor() {
    this.root.visible = false
  }

  prepare(texture: Texture) {
    for (let i = 0; i < 5; i++) {
      const sprite = new Sprite(texture)
      sprite.anchor.set(.5)
      sprite.blendMode = 'add'
      sprite.tint = i % 2 === 0 ? 0xb80a29 : 0x830c2a
      this.haze.push(sprite)
      this.root.addChild(sprite)
    }
    this.particles = Array.from({ length: PARTICLE_COUNT }, (_, i) => {
      const sprite = new Sprite(texture)
      sprite.anchor.set(.5)
      sprite.blendMode = 'add'
      sprite.tint = TINTS[i % TINTS.length]
      this.root.addChild(sprite)
      return {
        sprite, lane: i % 3, offset: seededNoise(i, 17) - .5,
        start: seededNoise(i, 31), depth: seededNoise(i, 47),
      }
    })
  }

  update(age: number, width: number, height: number, low: boolean, reduced: boolean) {
    const elapsed = age - ASTROPHAGE_START
    const opacity = Math.max(0, Math.min(1, elapsed / 1.5, (ASTROPHAGE_DURATION - elapsed) / 1.9))
    this.root.visible = opacity > 0 && this.particles.length > 0
    if (!this.root.visible) return

    const travel = reduced ? elapsed * .66 : elapsed
    this.root.alpha = opacity
    for (let i = 0; i < this.haze.length; i++) {
      const sprite = this.haze[i]
      const y = (.42 + i * .196 + travel * .027) % 1.42 - .21
      const curve = Math.sin(y * 5.1 + i * .8)
      sprite.position.set(width * (.49 + curve * .23), y * height)
      sprite.width = width * (.44 + .10 * (i % 2))
      sprite.height = height * .65
      sprite.rotation = curve * .28
      sprite.alpha = .17
    }

    const budget = low ? 50 : PARTICLE_COUNT
    const scale = Math.max(.85, Math.min(1.55, width / 430))
    for (let i = 0; i < this.particles.length; i++) {
      const { sprite, lane, offset, start, depth } = this.particles[i]
      sprite.visible = i < budget
      if (!sprite.visible) continue
      const y = (start * 1.18 + travel * (.020 + depth * .11)) % 1.18 - .09
      const bend = Math.sin(y * 6.5 + lane * .93 + travel * .16)
      const x = .32 + lane * .17 + bend * .12 + offset * (.11 + depth * .14)
      const size = scale * (2.5 + depth * depth * 9)
      sprite.position.set(x * width, y * height)
      sprite.width = size
      sprite.height = size * (1.05 + depth * 1.35)
      sprite.rotation = bend * .31
      sprite.alpha = .30 + depth * .51
    }
  }
}
