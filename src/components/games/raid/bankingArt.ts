import { getPublicAssetUrl } from '../sound'
import { getCanvasSpriteSource, makeImageCanvasSprite, releaseCanvasSprite } from './assets'
import type { CanvasSpriteEntry } from './assets'
import type { ProtectionHull } from './shipProtection'
import anchors from './bankingAnchors.json'

export const BANKING_COLUMNS = 7
export const BANKING_ROWS = 2
export const BANKING_CELL = 448
// The source atlas is oriented nose-up for both flight-camera modes. UI previews
// must apply the flight camera's quarter turn when shown on a landscape screen.
export function raidBankingPreviewAngle(landscape: boolean) { return landscape ? 90 : 0 }
export function raidBankingPreviewNozzle(x: number, y: number, landscape: boolean) {
  return landscape ? { x: -y, y: x } : { x, y }
}
const LEVEL_FRAME = 3
// Preserve the metal's original paint instead of flattening it to dim gray.
export const RAID_BANKING_HULL_FILTER = 'none'
const BANKING_CACHE_LIMIT = 6
const atlases = new Map<string, CanvasSpriteEntry>()

type ExhaustOutlet = readonly [x: number, y: number, width: number]
export type BankingPoint = readonly [x: number, y: number]
type BankingRegistration = { nozzles: ExhaustOutlet[][]; wing?: BankingPoint[][] }

const registrations = anchors as unknown as Readonly<Record<string, BankingRegistration>>

export type RaidBankingFrame = {
  sprite: CanvasSpriteEntry
  frame: number
  nozzles: readonly ExhaustOutlet[]
  wing?: readonly BankingPoint[]
}

// Gundam models retain their detailed hand-painted 2D combat poses in
// landscape. In gameplay these remain 2D; the selector now has 3D preview-only art.
export function isRaidGundamArt(shipKey: string) {
  return shipKey === 'godGundam' || shipKey === 'godGundamBurning' ||
    shipKey === 'spiegel' || shipKey === 'coreLander' ||
    shipKey === 'coreLanderBurning' || shipKey === 'coreLanderElite' ||
    shipKey === 'coreLanderBurningElite'
}

export function shouldUseRaidBankingArt(shipKey: string, landscape: boolean) {
  return !(landscape && isRaidGundamArt(shipKey))
}

function bankingKey(shipKey: string) {
  return shipKey === 'mesiah' ? 'mesiahBlack' : shipKey
}

const legacyMechAtlases = new Set(['godGundam', 'godGundamBurning', 'spiegel'])

export function getRaidBankingAtlasUrl(shipKey: string) {
  const key = bankingKey(shipKey)
  if (!Object.prototype.hasOwnProperty.call(registrations, key)) return null
  const version = legacyMechAtlases.has(key) ? 7 : 14
  return getPublicAssetUrl(`assets/ships/banking/${key}-v${version}.webp`)
}

export function getRaidPicker3DPreviewUrl(shipKey: string, landscape: boolean) {
  const key = bankingKey(shipKey)
  if (!Object.prototype.hasOwnProperty.call(registrations, key)) return null
  const version = legacyMechAtlases.has(key) ? 1 : landscape ? 7 : 5
  return getPublicAssetUrl(`assets/ships/previews/${key}-${landscape ? 'landscape' : 'portrait'}-v${version}.webp`)
}

// Hangar UI uses the same registered exhaust roots as the flight atlas.
export function getRaidBankingNozzles(shipKey: string, landscape: boolean) {
  const key = bankingKey(shipKey)
  return Object.prototype.hasOwnProperty.call(registrations, key)
    ? registrations[key].nozzles[raidBankingFrameIndex(0, landscape, false)]
    : null
}

export function getRaidBankingAtlas(shipKey: string) {
  const url = getRaidBankingAtlasUrl(shipKey)
  if (!url) return null
  const cached = atlases.get(url)
  if (cached) return cached
  if (atlases.size >= BANKING_CACHE_LIMIT) {
    const [oldUrl, oldAtlas] = atlases.entries().next().value!
    atlases.delete(oldUrl)
    releaseCanvasSprite(oldAtlas)
  }
  // Each frame is a 448 px, detail-preserved 2D-palette-matched WebP baked offline.
  // Draw its exact colors directly: a second color filter softens panel edges,
  // desaturates metallic trim and doubles memory via a processed canvas copy.
  const sprite = makeImageCanvasSprite(`ship-banking:${url}`, url)
  atlases.set(url, sprite)
  return sprite
}

export function raidBankingFrameIndex(bank: number, landscape: boolean, reducedMotion: boolean) {
  const amount = reducedMotion ? 0 : Math.max(-1, Math.min(1, bank / .14))
  const position = (landscape ? BANKING_COLUMNS : 0) + LEVEL_FRAME * (1 + amount)
  const nearest = Math.round(position)
  return Math.abs(nearest - position) < .0001 ? nearest : position
}

export function getRaidBankingFrame(shipKey: string, bank: number, landscape: boolean, reducedMotion: boolean): RaidBankingFrame | null {
  if (!shouldUseRaidBankingArt(shipKey, landscape)) return null
  const sprite = getRaidBankingAtlas(shipKey)
  if (!sprite?.loaded) return null
  const frame = raidBankingFrameIndex(bank, landscape, reducedMotion)
  const { nozzles, wing } = registrations[bankingKey(shipKey)]
  const lower = Math.floor(frame)
  const t = frame - lower
  if (!t) return { sprite, frame, nozzles: nozzles[lower], wing: wing?.[lower] }

  const next = nozzles[lower + 1]
  const nextWing = wing?.[lower + 1]
  return {
    sprite, frame,
    nozzles: nozzles[lower].map(([x, y, width], i) => [
      x + (next[i][0] - x) * t, y + (next[i][1] - y) * t, width + (next[i][2] - width) * t,
    ]),
    wing: nextWing && wing?.[lower].map(([x, y], i) =>
      [x + (nextWing[i][0] - x) * t, y + (nextWing[i][1] - y) * t]),
  }
}

export function getBankingProtectionHull(sprite: CanvasSpriteEntry, landscape: boolean): ProtectionHull {
  // Keep the energy shield stable during shallow banks. Computing a fresh
  // distance field every time the hull changes frame would stall flight.
  return { sprite, columns: BANKING_COLUMNS, rows: BANKING_ROWS, frame: raidBankingFrameIndex(0, landscape, false) }
}

// Mix the two premultiplied poses on transparent pixels so the scenery never
// enters the blend. A single reusable surface serves the entire formation.
let blendSurface: CanvasRenderingContext2D | null = null

function drawPose(ctx: CanvasRenderingContext2D, source: CanvasImageSource, frame: number,
  left: number, top: number, size: number) {
  ctx.drawImage(source, frame % BANKING_COLUMNS * BANKING_CELL,
    Math.floor(frame / BANKING_COLUMNS) * BANKING_CELL, BANKING_CELL, BANKING_CELL,
    left, top, size, size)
}

export function drawRaidBankingCell(ctx: CanvasRenderingContext2D, sprite: CanvasSpriteEntry, frame: number,
  x: number, y: number, size: number) {
  const lower = Math.floor(frame)
  const t = frame - lower
  const source = getCanvasSpriteSource(sprite)
  if (t && !blendSurface) {
    const canvas = ctx.canvas.ownerDocument.createElement('canvas')
    canvas.width = canvas.height = BANKING_CELL
    blendSurface = canvas.getContext('2d')
  }
  ctx.save()
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  if (t && blendSurface) {
    const mix = blendSurface
    mix.clearRect(0, 0, BANKING_CELL, BANKING_CELL)
    mix.globalCompositeOperation = 'source-over'
    mix.globalAlpha = 1 - t
    drawPose(mix, source, lower, 0, 0, BANKING_CELL)
    mix.globalCompositeOperation = 'lighter'
    mix.globalAlpha = t
    drawPose(mix, source, lower + 1, 0, 0, BANKING_CELL)
    ctx.drawImage(mix.canvas, x - size / 2, y - size / 2, size, size)
  } else {
    drawPose(ctx, source, Math.round(frame), x - size / 2, y - size / 2, size)
  }
  ctx.restore()
}
