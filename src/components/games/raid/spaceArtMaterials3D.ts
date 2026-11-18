/**
 * Reuses the game's ORIGINAL 2D HD artwork as GPU surface maps for actual
 * 3D meshes. Every canvas is prepared once on entering the raid, never during
 * frame submission. Source textures remain owned by their existing atlases.
 *
 * Reproject planetary illustrations into UV maps, combine them with the
 * original surface/nebula artwork, and keep saturation close to the 2D game.
 */
import { Texture } from 'pixi.js'
import { getJourneyPlanet, getJourneySurface, getCosmosBackdrop, getCosmosLandmark } from './cosmosArt'
import { getWreckTexture } from './wreckArt'
import { getCelestialArt } from './celestialArt'

export type SpaceArtPack = {
  planetMaps: Texture[]
  armorMaps: Texture[]
  asteroidMaps: Texture[]
  ringMaps: Texture[]
  haloMaps: Texture[]
  nebulaMaps: Texture[]
  artSources: number
  dispose: () => void
}
const SIZE = 384
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
  texture.source.autoGenerateMipmaps = false
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
  const w = 512, h = 256
  const surface = newCanvas(w, h), sctx = surface.getContext('2d')!
  const rgb = channels(color)
  sctx.fillStyle = 'rgb(' + rgb.map(c => clamp(c * .56)).join(',') + ')'
  sctx.fillRect(0, 0, w, h)
  const sourceReady = paintFrame(sctx, terrain, 0, 0, w, h)
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
      const longitudeFront = forward >= 0
      // Original 2D globe pixels are projected onto the front hemisphere,
      // with only faint mirrored coverage around the far side.
      const u = clamp((.5 + longitudeX * (longitudeFront ? .41 : -.33)) * (SIZE - 1), 0, SIZE - 1) | 0
      const v = clamp((.5 - sinLat * .41) * (SIZE - 1), 0, SIZE - 1) | 0
      const si = (v * SIZE + u) * 4
      const texBrightness = Math.max(ddata.data[si], ddata.data[si + 1], ddata.data[si + 2])
      const good = artReady && ddata.data[si + 3] > 90 && texBrightness > 28
      // Keep the illustrated continents while fully textured terrain wraps
      // around both sides of the actual 3D sphere.
      const strength = good ? (longitudeFront ? .79 : .30) * (.68 + .32 * Math.max(0, forward)) : 0
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
function makeSceneryMap(source: Texture | undefined, color: number) {
  const size = 384
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
  const size = 512, canvas = newCanvas(size, size), ctx = canvas.getContext('2d')!
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
  const asteroidMaps = Array.from({length:3}, (_,i) =>
    add(makeSceneryMap(getCelestialArt((i+1) % 4) ?? getWreckTexture(i), themed[i])))
  const ringMaps = Array.from({length:3}, (_,i) =>
    add(makeSceneryMap(getCelestialArt((i+2) % 4) ?? getCosmosBackdrop(i), themed[(i+1)%5])))
  const haloMaps = themed.map(color => {
    const tex = makeHaloMap(color); owned.push(tex); return tex
  })
  const nebulaMaps = Array.from({length:8}, (_,i) =>
    add(makeSoftCloud(i % 2 ? getCosmosBackdrop(i % 4) : getCelestialArt(i % 4)
      ?? getCosmosLandmark(i % 4), themed[i%5])))
  return {
    planetMaps, armorMaps, asteroidMaps, ringMaps, haloMaps, nebulaMaps,
    artSources, dispose: () => {
      for (const texture of owned) texture.destroy(true)
      owned.length = 0
    },
  }
}
