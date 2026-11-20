import { DataTexture, EquirectangularReflectionMapping, FloatType, LinearSRGBColorSpace,
  PMREMGenerator, RGBAFormat, type WebGLRenderer, type WebGLRenderTarget } from 'three'
import { SHIP_LIGHTING_PALETTES } from './shipLighting'

/** Small rough-reflection probes, baked once at loading. Never capture the live
 * scene or allocate reflection framebuffers in the flight loop. */
export function prepareShipReflections(renderer: WebGLRenderer) {
  const generator = new PMREMGenerator(renderer), targets: WebGLRenderTarget[] = []
  try {
    generator.compileEquirectangularShader()
    for (let preset = 0; preset < SHIP_LIGHTING_PALETTES.length; preset++) {
      const palette = SHIP_LIGHTING_PALETTES[preset], width = 128, height = 64
      const pixels = new Float32Array(width * height * 4)
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const longitude = ((x + .5) / width - .5) * Math.PI * 2, latitude = ((y + .5) / height - .5) * Math.PI
        const nx = Math.cos(latitude) * Math.cos(longitude), ny = Math.sin(latitude), nz = Math.cos(latitude) * Math.sin(longitude)
        const upper = Math.max(0, ny), lower = Math.max(0, -ny)
        const key = Math.max(0, nx * -.61 + ny * .49 + nz * .62)
        const flank = Math.max(0, nx * .72 - ny * .3 + nz * .55)
        // Broad sources reflect softly on rough painted metal. Dock ceiling
        // strips are brighter, while space retains dark negative reflections.
        const ceiling = preset === 6 ? Math.exp(-(((ny - .68) / .15) ** 2)) * (.45 + .55 * nz * nz) : 0
        const i = (y * width + x) * 4
        for (let channel = 0; channel < 3; channel++) {
          pixels[i + channel] = palette.sky[channel] * (.025 + .13 * upper)
            + palette.ground[channel] * lower * .26 + palette.key[channel] * (key ** 24 * 2.2 + ceiling * 1.7)
            + palette.fill[channel] * flank ** 5 * .18
        }
        pixels[i + 3] = 1
      }
      const source = new DataTexture(pixels, width, height, RGBAFormat, FloatType)
      source.mapping = EquirectangularReflectionMapping
      source.colorSpace = LinearSRGBColorSpace
      source.needsUpdate = true
      try {
        const target = generator.fromEquirectangular(source)
        target.texture.name = 'raid-hull-reflection-' + preset
        targets.push(target)
      }
      finally { source.dispose() }
    }
    return targets
  } catch (error) {
    for (const target of targets) target.dispose()
    throw error
  } finally { generator.dispose() }
}
