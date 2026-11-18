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
function vividPixel(r: number, g: number, b: number, boost = 1.2): [number, number, number] {
  const light = .2126 * r + .7152 * g + .0722 * b
  return [
    clamp((r - light) * boost + light * 1.10 + 4),
    clamp((g - light) * boost + light * 1.10 + 4),
    clamp((b - light) * boost + light * 1.10 + 4),
  ]
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
  const surface = newCanvas(w, h), sctx = surface.getContext('2d')!
  const rgb = channels(color)
  sctx.fillStyle = 'rgb(' + rgb.map(c => clamp(c * .56)).join(',') + ')'
  sctx.fillRect(0, 0, w, h)
  const sourceReady = paintFrame(sctx, terrain, 0, 0, w, h)
  // The remastered planet disk already contains its original clouds,
  // contrast, and color. v38-v40 SCREEN-blended an unrelated nebula over
  // every pixel before wrapping, which made the whole globe look foggy.
  // Preserve the original source without a second painted veil.
  if (!sourceReady) {
    // Only used if the optional high-resolution atlas was not decoded.
    for (let stripe = 0; stripe < 32; stripe++) {
      const y = Math.floor(stripe * h / 32)
      const wave = .5 + .5 * Math.sin(stripe * 2.7 + seed * 4)
      sctx.fillStyle = 'rgba(' + rgb.join(',') + ',' + (.15 + .4 * wave) + ')'
      sctx.fillRect(0, y, w, Math.max(1, h / 32))
    }
  }

  const diskCanvas = newCanvas(SIZE, SIZE)
  const dctx = diskCanvas.getContext('2d')!
  const artReady = paintFrame(dctx, disk, 0, 0, SIZE, SIZE)
  const sdata = sctx.getImageData(0, 0, w, h)
  // Full-equirect UVs must wrap at u=0/1. The old 2D landscape art has
  // independent left/right borders; blend them into a single continuous
  // meridian before putting the texture on a rotating sphere.
  const seam = Math.floor(w * .16)
  for (let y = 0; y < h; y++) {
    for (let offset = 0; offset < seam; offset++) {
      const left = (y * w + offset) * 4
      const right = (y * w + (w - 1 - offset)) * 4
      const t = offset / Math.max(1, seam - 1)
      const a = t * t * (3 - 2 * t)
      for (let c = 0; c < 3; c++) {
        const midpoint = (sdata.data[left + c] + sdata.data[right + c]) * .5
        sdata.data[left + c] = mix(midpoint, sdata.data[left + c], a)
        sdata.data[right + c] = mix(midpoint, sdata.data[right + c], a)
      }
    }
  }
  const ddata = dctx.getImageData(0, 0, SIZE, SIZE)
  const out = sctx.createImageData(w, h)
  const sinus = new Float32Array(w)
  const cosinus = new Float32Array(w)
  for (let x = 0; x < w; x++) {
    const longitude = (x / (w - 1) - .5) * Math.PI * 2
    sinus[x] = Math.sin(longitude)
    cosinus[x] = Math.cos(longitude)
  }
  for (let y = 0; y < h; y++) {
    const latitude = (y / (h - 1) - .5) * Math.PI
    const cosLat = Math.cos(latitude)
    const sinLat = Math.sin(latitude)
    for (let x = 0; x < w; x++) {
      const di = (y * w + x) * 4
      const longitudeX = sinus[x] * cosLat
      const forward = cosinus[x] * cosLat
      // The original implementation jumped from a 79% front projection
      // to a 30% mirrored rear projection at longitude=+/-90deg, creating
      // a glaring hard vertical rectangle on the sphere. Reproject the
      // original illustration continuously, fade towards the silhouette,
      // and let the HD terrain art supply the back hemisphere seamlessly.
      // Wrap the SAME illustrated planet across all 360 degrees.
      // Previously the near hemisphere used a purple globe and the far
      // half used an unrelated blue landscape. As the sphere rotated,
      // that mismatch produced the hard vertical color seam visible in
      // the Stage 1 PNG. Reflect the source illustration smoothly on the
      // rear hemisphere; sine has identical samples at u=0 and u=1.
      const u = clamp((.5 + longitudeX * .425) * (SIZE - 1), 0, SIZE - 1) | 0
      const v = clamp((.5 - sinLat * .425) * (SIZE - 1), 0, SIZE - 1) | 0
      const si = (v * SIZE + u) * 4
      const sourceAlpha = artReady ? ddata.data[si + 3] / 255 : 0
      // A gentle alpha transition is only needed for the very edge of
      // the circular artwork. The detailed 2D planet itself remains
      // fully opaque instead of being washed out with 30-70% terrain.
      const strength = sourceAlpha * sourceAlpha * (3 - 2 * sourceAlpha)
      for (let c = 0; c < 3; c++)
        out.data[di + c] = mix(sdata.data[di + c], ddata.data[si + c], strength)
      const [r, g, b] = vividPixel(out.data[di], out.data[di + 1], out.data[di + 2], 1.20)
      out.data[di] = r; out.data[di + 1] = g; out.data[di + 2] = b
      out.data[di + 3] = 255
    }
  }
  sctx.putImageData(out, 0, 0)
  return { texture: upload(surface), usedArt: sourceReady || artReady }
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
