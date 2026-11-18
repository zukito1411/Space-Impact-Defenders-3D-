/**
 * Reuses the game's ORIGINAL 2D HD artwork as GPU surface maps for actual
 * 3D meshes. Every canvas is prepared once on entering the raid, never during
 * frame submission. Source textures remain owned by their existing atlases.
 *
 * Reproject planetary illustrations into UV maps, combine them with the
 * original surface/nebula artwork, and keep saturation close to the 2D game.
 */
import { Texture } from 'pixi.js'
import { getGraphicsQuality } from '../sound'
import { getJourneyPlanet, getJourneySurface, getCosmosBackdrop, getCosmosLandmark } from './cosmosArt'
import { getWreckTexture } from './wreckArt'
import { getCelestialArt } from './celestialArt'
import { getRaidOtherCanvasSprite } from './assets'

export type SpaceArtPack = {
  planetMaps: Texture[]
  armorMaps: Texture[]
  asteroidMaps: Texture[]
  ringMaps: Texture[]
  haloMaps: Texture[]
  nebulaMaps: Texture[]
  artSources: number
  realAsteroidSource: boolean
  dispose: () => void
}
// Atlas resolution is selected ONCE per loading session and never changes mid-frame.
const DETAIL = getGraphicsQuality()
// Do not shrink the original ~928px remastered planet tiles before
// projecting them onto spherical UVs: v40 downsampled those tiles to 768.
const SIZE = DETAIL === 'max' ? 1024 : DETAIL === 'high' ? 896 : DETAIL === 'medium' ? 640 : 512
const PLANET_WIDTH = DETAIL === 'max' ? 1280 : DETAIL === 'high' ? 1024 : DETAIL === 'medium' ? 768 : 512
const SCENERY_SIZE = DETAIL === 'max' ? 768 : DETAIL === 'high' ? 640 : DETAIL === 'medium' ? 512 : 384
const CLOUD_SIZE = DETAIL === 'max' ? 896 : DETAIL === 'high' ? 768 : DETAIL === 'medium' ? 640 : 512
const clamp = (v: number, lo = 0, hi = 255) => Math.max(lo, Math.min(hi, v))
const channels = (c: number) => [(c >> 16) & 255, (c >> 8) & 255, c & 255] as const

function newCanvas(w: number, h: number) {
  const canvas = document.createElement('canvas')
  canvas.width = w; canvas.height = h
  return canvas
}
/** Handle atlas sub-rectangles, Canvas, ImageBitmap and decoded Image. */
function paintFrame(ctx: CanvasRenderingContext2D, source: Texture | undefined,
                    x: number, y: number, w: number, h: number, vivid = true) {
  if (!source || source === Texture.WHITE) return false
  const raw = (source.source as unknown as { resource?: CanvasImageSource }).resource
  if (!raw || source.frame.width < 2 || source.frame.height < 2) return false
  try {
    ctx.save()
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    if (vivid) ctx.filter = 'saturate(1.5) contrast(1.16) brightness(1.10)'
    ctx.drawImage(raw, source.frame.x, source.frame.y, source.frame.width, source.frame.height, x, y, w, h)
    ctx.restore()
    return true
  } catch {
    ctx.restore()
    return false
  }
}
function upload(canvas: HTMLCanvasElement): Texture {
  const texture = Texture.from(canvas)
  texture.source.scaleMode = 'linear'
  // Static planet/asteroid/nebula surfaces benefit from correct texture LOD
  // when rotating in perspective. Generate mips once on upload, not per frame.
  texture.source.autoGenerateMipmaps = true
  texture.source.style.maxAnisotropy = 4
  return texture
}
function mix(a: number, b: number, t: number) { return a * (1 - t) + b * t }

/** 
 * An atlas planet is an illustration of a disk, not an equirectangular UV.
 * Use the disk as detailed geography while a corresponding original 2D
 * world-surface image supplies wraparound coverage on the back hemisphere.
 * No dark square frame corners, stretch-to-sphere trick or grayscale noise.
 */
function makePlanetMap(disk: Texture | undefined, terrain: Texture | undefined,
                       color: number, seed: number) {
  const w = PLANET_WIDTH, h = PLANET_WIDTH / 2
  const surface = newCanvas(w, h), ctx = surface.getContext('2d')!
  const rgb = channels(color)
  ctx.fillStyle = 'rgb(' + rgb.map(c => clamp(c * .56)).join(',') + ')'
  ctx.fillRect(0, 0, w, h)
  const terrainReady = paintFrame(ctx, terrain, 0, 0, w, h)

  // A photographed/painted circular planet is NOT an equirectangular map.
  // The previous front/back projection distorted its center into a
  // kaleidoscopic mirror and generated a half-colored meridian as it spun.
  // Preserve a SINGLE rectangular crop of the original HD illustration's
  // central detailed surface across the whole 360-degree UV: the mesh is
  // actually spherical and the original shading/colors remain high fidelity.
  // Crop 60% from its centre, entirely INSIDE the circular planet artwork,
  // so no black background corners or baked transparent silhouette enter
  // the UV texture.
  const raw = (disk?.source as { resource?: CanvasImageSource } | undefined)?.resource
  const frame = disk?.frame
  let diskReady = false
  if (raw && frame && frame.width > 16 && frame.height > 16) {
    try {
      ctx.save()
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.filter = 'saturate(1.28) contrast(1.14) brightness(1.05)'
      ctx.drawImage(raw,
        frame.x + frame.width * .20, frame.y + frame.height * .20,
        frame.width * .60, frame.height * .60,
        0, 0, w, h)
      ctx.restore()
      diskReady = true
    } catch {
      ctx.restore()
    }
  }
  if (!diskReady && !terrainReady) {
    for (let stripe = 0; stripe < 32; stripe++) {
      const y = Math.floor(stripe * h / 32)
      ctx.fillStyle = 'rgba(' + rgb.join(',') + ',' +
        (.15 + .4 * (.5 + .5 * Math.sin(stripe * 2.7 + seed * 4))) + ')'
      ctx.fillRect(0, y, w, Math.max(1, h / 32))
    }
  }

  // A true 3D globe rotates past u=0/1. Feather the left/right 2D cut
  // boundaries into one seamless meridian ONCE (rather than superimposing
  // an unrelated painted surface over 50% of the visible planet).
  const pixels = ctx.getImageData(0, 0, w, h)
  const seam = Math.max(2, Math.floor(w * .12))
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < seam; x++) {
      const left = (y * w + x) * 4
      const right = (y * w + w - 1 - x) * 4
      const t = x / Math.max(1, seam - 1)
      const ramp = t * t * (3 - 2 * t)
      for (let c = 0; c < 3; c++) {
        const midpoint = (pixels.data[left + c] + pixels.data[right + c]) * .5
        pixels.data[left + c] = mix(midpoint, pixels.data[left + c], ramp)
        pixels.data[right + c] = mix(midpoint, pixels.data[right + c], ramp)
      }
      pixels.data[left + 3] = 255
      pixels.data[right + 3] = 255
    }
  }
  ctx.putImageData(pixels, 0, 0)
  return { texture: upload(surface), usedArt: diskReady || terrainReady }
}

/**
 * Real asteroids must NOT be textured using celestial GAS imagery.
 * Extract the detailed central rock surface from the actual asteroid art
 * used in the 2D game, then make a seam-matched UV texture that can rotate
 * around the 3D icosahedron. All extraction happens once, at load time.
 */
function makeAsteroidMap(source: Texture | undefined, detail: Texture | undefined,
                         color: number, variant: number) {
  const size = SCENERY_SIZE
  const canvas = newCanvas(size, size)
  const ctx = canvas.getContext('2d')!
  const rgb = channels(color)
  ctx.fillStyle = 'rgb(' + rgb.map(c => Math.round(c * .38)).join(',') + ')'
  ctx.fillRect(0, 0, size, size)
  let usedArt = false
  const resource = (source?.source as { resource?: CanvasImageSource } | undefined)?.resource
  const frame = source?.frame
  if (resource && frame && frame.width > 0 && frame.height > 0) {
    try {
      ctx.save()
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.filter = 'saturate(1.22) contrast(1.21) brightness(1.04)'
      // Crop into the asteroid's detailed rocky body rather than stretching
      // its black/transparent rectangular margins around the whole sphere.
      const cropX = frame.x + frame.width * .20
      const cropY = frame.y + frame.height * .20
      const cropW = frame.width * .60
      const cropH = frame.height * .60
      ctx.translate(size * .5, size * .5)
      ctx.rotate(variant * Math.PI * .29)
      ctx.drawImage(resource, cropX, cropY, cropW, cropH,
        -size * .68, -size * .68, size * 1.36, size * 1.36)
      ctx.restore()
      usedArt = true
    } catch {
      ctx.restore()
    }
  }
  if (!usedArt) usedArt = paintFrame(ctx, detail, 0, 0, size, size)
  // A subtle second patch offsets the texture details between asteroid
  // variants; unlike a translucent gas veil, it never hides the original
  // rock's craters and sharp material contrast.
  if (usedArt && resource && frame && variant !== 0) {
    ctx.save()
    ctx.globalAlpha = .22
    ctx.globalCompositeOperation = 'overlay'
    ctx.drawImage(resource, frame.x + frame.width * .27,
      frame.y + frame.height * .27,
      frame.width * .43, frame.height * .43,
      size * .30, size * .27, size * .48, size * .44)
    ctx.restore()
  }
  // Seam-match left and right edges. A rotating rock has no billboard edge.
  const data = ctx.getImageData(0, 0, size, size)
  const seam = Math.floor(size * .09)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < seam; x++) {
      const left = (y * size + x) * 4
      const right = (y * size + (size - 1 - x)) * 4
      const t = x / Math.max(1, seam - 1)
      const smooth = t * t * (3 - 2 * t)
      for (let c = 0; c < 3; c++) {
        const avg = (data.data[left + c] + data.data[right + c]) * .5
        data.data[left + c] = mix(avg, data.data[left + c], smooth)
        data.data[right + c] = mix(avg, data.data[right + c], smooth)
      }
      data.data[left + 3] = 255
      data.data[right + 3] = 255
    }
  }
  ctx.putImageData(data, 0, 0)
  return { texture: upload(canvas), usedArt }
}

function makeSceneryMap(source: Texture | undefined, color: number) {
  const size = SCENERY_SIZE
  const canvas = newCanvas(size, size), ctx = canvas.getContext('2d')!
  const rgb = channels(color)
  ctx.fillStyle = 'rgb(' + rgb.map(c => clamp(c * .4)).join(',') + ')'
  ctx.fillRect(0, 0, size, size)
  const usedArt = paintFrame(ctx, source, 0, 0, size, size)
  if (!usedArt) {
    ctx.fillStyle = 'rgba(' + rgb.join(',') + ',.65)'
    for (let i = 0; i < 14; i++) {
      const span = i * 32 + 12
      ctx.fillRect(0, span % size, size, 4 + i % 7)
    }
  }
  // Retain a legible metal/rock silhouette under directional PBR lighting.
  return { texture: upload(canvas), usedArt }
}
/** 
 * Existing amber/cyan dust artwork becomes an annular band with tapered,
 * semi-transparent rings. A real radial 3D mesh maps this material across
 * its width; never use a featureless thick tube painted solid beige.
 */
function makeRingBand(source: Texture | undefined, color: number) {
  const w = 512, h = 128, canvas = newCanvas(w, h)
  const ctx = canvas.getContext('2d')!
  const [r,g,b] = channels(color)
  ctx.fillStyle = 'rgba(' + r + ',' + g + ',' + b + ',1)'
  ctx.fillRect(0,0,w,h)
  const usedArt = paintFrame(ctx, source, 0, 0, w, h)
  for (let stripe = 0; stripe < 28; stripe++) {
    const y = Math.round(stripe * h / 28)
    const flare = .17 + .28 * (.5 + Math.sin(stripe * 2.3) * .5)
    ctx.fillStyle = 'rgba(' + r + ',' + g + ',' + b + ',' + flare + ')'
    ctx.fillRect(0, y, w, stripe % 6 === 0 ? 3 : 1)
  }
  ctx.globalCompositeOperation = 'destination-in'
  const fade = ctx.createLinearGradient(0,0,0,h)
  fade.addColorStop(0,'rgba(255,255,255,0)')
  fade.addColorStop(.09,'rgba(255,255,255,.34)')
  fade.addColorStop(.22,'rgba(255,255,255,.78)')
  fade.addColorStop(.40,'rgba(255,255,255,.94)')
  fade.addColorStop(.57,'rgba(255,255,255,.70)')
  fade.addColorStop(.76,'rgba(255,255,255,.95)')
  fade.addColorStop(.89,'rgba(255,255,255,.25)')
  fade.addColorStop(1,'rgba(255,255,255,0)')
  ctx.fillStyle = fade;ctx.fillRect(0,0,w,h)
  ctx.globalCompositeOperation = 'source-over'
  return { texture: upload(canvas), usedArt }
}
function makeHaloMap(hex: number) {
  const size = 256, canvas = newCanvas(size, size), ctx = canvas.getContext('2d')!
  const [r,g,b] = channels(hex)
  const gradient = ctx.createRadialGradient(128, 128, 34, 128, 128, 127)
  gradient.addColorStop(0, 'rgba(' + r + ',' + g + ',' + b + ',0)')
  gradient.addColorStop(.36, 'rgba(' + r + ',' + g + ',' + b + ',.17)')
  gradient.addColorStop(.55, 'rgba(' + r + ',' + g + ',' + b + ',.73)')
  gradient.addColorStop(.70, 'rgba(' + r + ',' + g + ',' + b + ',.42)')
  gradient.addColorStop(1, 'rgba(' + r + ',' + g + ',' + b + ',0)')
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, size, size)
  return upload(canvas)
}
function makeSoftCloud(source: Texture | undefined, color: number) {
  const size = CLOUD_SIZE, canvas = newCanvas(size, size), ctx = canvas.getContext('2d')!
  const ready = paintFrame(ctx, source, 0, 0, size, size)
  if (!ready) {
    const [r,g,b] = channels(color)
    const gradient = ctx.createRadialGradient(256, 256, 8, 256, 256, 260)
    gradient.addColorStop(0, 'rgba(' + r + ',' + g + ',' + b + ',.72)')
    gradient.addColorStop(1, 'rgba(' + r + ',' + g + ',' + b + ',0)')
    ctx.fillStyle = gradient; ctx.fillRect(0,0,size,size)
  }
  ctx.globalCompositeOperation = 'destination-in'
  const radial = ctx.createRadialGradient(size / 2, size / 2, size * .06, size / 2, size / 2, size * .50)
  radial.addColorStop(0, 'rgba(255,255,255,1)')
  radial.addColorStop(.52, 'rgba(255,255,255,1)')
  radial.addColorStop(.78, 'rgba(255,255,255,.6)')
  radial.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = radial; ctx.fillRect(0,0,size,size)
  ctx.globalCompositeOperation = 'source-over'
  return { texture: upload(canvas), usedArt: ready }
}

/** Called once after the existing cosmos/celestial/wreck atlas preload. */
export function createSpaceArtPack(): SpaceArtPack {
  const owned: Texture[] = []
  let artSources = 0
  const add = ({ texture, usedArt }: { texture: Texture; usedArt: boolean }) => {
    owned.push(texture)
    if (usedArt) artSources++
    return texture
  }
  const themed = [0x62caff, 0xff895c, 0xb283ff, 0x67f6df, 0xffc95f]
  const planetMaps = Array.from({length:5}, (_,i) =>
    add(makePlanetMap(
      getJourneyPlanet(i % 2),
      i % 2 === 0 ? getJourneySurface(0) : getJourneySurface(1),
      themed[i], i)))
  const armorMaps = Array.from({length:4}, (_,i) =>
    add(makeSceneryMap(getWreckTexture(i + 4) ?? getCosmosLandmark(i), themed[i])))
  const asteroidEntry = getRaidOtherCanvasSprite('asteroid')
  // Background.loadAssets() has already awaited this entry before
  // SpaceWorld3D is constructed. Use its original full-resolution 2D asset.
  const actualAsteroid = asteroidEntry.loaded
    ? Texture.from(asteroidEntry.image)
    : undefined
  const asteroidMaps = Array.from({length:3}, (_,i) =>
    add(makeAsteroidMap(actualAsteroid,
      getWreckTexture(i) ?? getCelestialArt((i+1)%4), themed[i], i)))
  const ringMaps = Array.from({length:3}, (_,i) =>
    add(makeRingBand(getCelestialArt((i+2) % 4) ?? getCosmosBackdrop(i), themed[(i+1)%5])))
  const haloMaps = themed.map(color => {
    const tex = makeHaloMap(color); owned.push(tex); return tex
  })
  const nebulaMaps = Array.from({length:8}, (_,i) =>
    add(makeSoftCloud(i % 2 ? getCosmosBackdrop(i % 4) : getCelestialArt(i % 4)
      ?? getCosmosLandmark(i % 4), themed[i%5])))
  return {
    planetMaps, armorMaps, asteroidMaps, ringMaps, haloMaps, nebulaMaps,
    artSources, realAsteroidSource: Boolean(actualAsteroid), dispose: () => {
      for (const texture of owned) texture.destroy(true)
      owned.length = 0
    },
  }
}
