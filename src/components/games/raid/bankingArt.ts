import { getPublicAssetUrl } from '../sound'
import { getCanvasSpriteSource, makeImageCanvasSprite, releaseCanvasSprite } from './assets'
import type { CanvasSpriteEntry } from './assets'
import type { ProtectionHull } from './shipProtection'
import anchors from './bankingAnchors.json'

export const BANKING_COLUMNS = 7
export const BANKING_ROWS = 2
export const BANKING_CELL = 448
// Original v1 art is 224 px per pose; v2 bakes higher-quality 2x poses.
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
// landscape. This includes their hangar/selector portraits (see RaidShipSprite).
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

export function getRaidBankingAtlasUrl(shipKey: string) {
  const key = bankingKey(shipKey)
  return Object.prototype.hasOwnProperty.call(registrations, key) ? getPublicAssetUrl(`assets/ships/banking/${key}-v3.webp`) : null
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
  // Each frame is a 448 px, color-graded high-detail WebP baked offline.
  // Draw its exact colors directly: a second color filter softens panel edges,
  // desaturates metallic trim and doubles memory via a processed canvas copy.
  const sprite = makeImageCanvasSprite(`ship-banking:${url}`, url)
  atlases.set(url, sprite)
  return sprite
}

export function raidBankingFrameIndex(bank: number, landscape: boolean, reducedMotion: boolean) {
  const amount = reducedMotion ? 0 : Math.max(-1, Math.min(1, bank / .14))
  return (landscape ? BANKING_COLUMNS : 0) + Math.round(LEVEL_FRAME + amount * LEVEL_FRAME)
}

// Each atlas has seven baked physical roll poses. The tiny leftover angle
// between poses is applied as a subframe correction rather than rotating the
// whole baked roll a second time (which made turns look exaggerated/jumpy).
export function raidBankingResidualAngle(bank: number, landscape: boolean, reducedMotion: boolean) {
  if (reducedMotion) return 0
  const selectedPose = raidBankingFrameIndex(bank, landscape, false) % BANKING_COLUMNS
  const bakedAngle = (selectedPose - LEVEL_FRAME) * (0.14 / LEVEL_FRAME)
  return Math.max(-0.14 / 6, Math.min(0.14 / 6, bank - bakedAngle))
}

export function getRaidBankingFrame(shipKey: string, bank: number, landscape: boolean, reducedMotion: boolean): RaidBankingFrame | null {
  if (!shouldUseRaidBankingArt(shipKey, landscape)) return null
  const sprite = getRaidBankingAtlas(shipKey)
  if (!sprite?.loaded) return null
  const frame = raidBankingFrameIndex(bank, landscape, reducedMotion)
  const { nozzles, wing } = registrations[bankingKey(shipKey)]
  return { sprite, frame, nozzles: nozzles[frame], wing: wing?.[frame] }
}

export function getBankingProtectionHull(sprite: CanvasSpriteEntry, landscape: boolean): ProtectionHull {
  // Keep the energy shield stable during shallow banks. Computing a fresh
  // distance field every time the hull changes frame would stall flight.
  return { sprite, columns: BANKING_COLUMNS, rows: BANKING_ROWS, frame: raidBankingFrameIndex(0, landscape, false) }
}

export function drawRaidBankingCell(ctx: CanvasRenderingContext2D, sprite: CanvasSpriteEntry, frame: number,
  x: number, y: number, size: number) {
  // Preserve subpixel surface detail while shrinking baked 3D art to the
  // moving player's hull. Restore the caller's Canvas settings afterwards.
  ctx.save()
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(getCanvasSpriteSource(sprite),
    frame % BANKING_COLUMNS * BANKING_CELL, Math.floor(frame / BANKING_COLUMNS) * BANKING_CELL,
    BANKING_CELL, BANKING_CELL, x - size / 2, y - size / 2, size, size)
  ctx.restore()
}
