import { useState, useSyncExternalStore } from 'react'
import hullFrames from './raid/menuHullFrames.json'
import { RAID_ELITE_FRAME_PATHS } from './raid/shipArtwork'
import { getRaidPicker3DPreviewUrl } from './raid/bankingArt'
import { getRaidSideShipSpriteUrl } from './raid/sideArtwork'
import { getPublicAssetUrl } from './sound'
import { LEGACY_FIGHTER_COUNT, RAID_FIGHTER_ASSETS } from './raid/stageEncounters'

export { getRaidPicker3DPreviewUrl }

export const RAID_SHIP_SPRITE_PATHS: Record<string, string> = {
  rocket: 'assets/ships/black-comet-remaster-v1.webp',
  fast: 'assets/ships/red-wraith-remaster-v1.webp',
  gatling: 'assets/ships/crimson-saw-remaster-v1.webp',
  laser: 'assets/ships/night-lance-remaster-v1.webp',
  dreadnought: 'assets/ships/obsidian-ark-remaster-v1.webp',
  xwing: 'assets/ships/crosswing-nova-remaster-v1.webp',
  spaceEt: 'assets/ships/space-jet-remaster-v1.webp',
  mesiah: 'assets/ships/mesiah-black-remaster-v1.webp',
  mesiahBlack: 'assets/ships/mesiah-black-remaster-v1.webp',
  mesiahWhite: 'assets/ships/mesiah-white-remaster-v1.webp',
  mesiahRaptorBlack: 'assets/ships/mesiah-raptor-black.png',
  mesiahRaptorWhite: 'assets/ships/mesiah-raptor-white.png',
  coreLander: 'assets/ships/core-lander.png',
  coreLanderBurning: 'assets/ships/core-lander-burning.png',
  godGundam: 'assets/ships/god-gundam.png',
  godGundamBurning: 'assets/ships/god-gundam-burning.png',
  spiegel: 'assets/ships/spiegel.png',
  ...RAID_ELITE_FRAME_PATHS,
}

const RAID_ALIEN_SPRITE_PATHS = [
  ...Array.from({ length: LEGACY_FIGHTER_COUNT }, (_, index) => `assets/aliens/alien_v${index}.png`),
  ...RAID_FIGHTER_ASSETS,
]
export const RAID_ALIEN_SPRITE_COUNT = RAID_ALIEN_SPRITE_PATHS.length
const RAID_ELITE_ASSET_PATHS = [
  'assets/aliens/elite_0.png',
  'assets/aliens/elite_1.png',
  'assets/aliens/elite_2.png',
  'assets/aliens/elite_3.png',
  'assets/aliens/elite_4.png',
] as const
export const RAID_ELITE_SPRITE_COUNT = RAID_ELITE_ASSET_PATHS.length

export function getRaidShipSpriteUrl(shipKey: string) {
  return getPublicAssetUrl(RAID_SHIP_SPRITE_PATHS[shipKey] ?? RAID_SHIP_SPRITE_PATHS.rocket)
}

// The menu artwork follows the actual display orientation, including rotation while open.
const orientationQuery = '(orientation: landscape)'
function subscribeOrientation(listener: () => void) {
  const query = window.matchMedia(orientationQuery)
  query.addEventListener('change', listener)
  return () => query.removeEventListener('change', listener)
}
function getLandscapeSnapshot() { return window.matchMedia(orientationQuery).matches }
export function useLandscapeScreen() {
  return useSyncExternalStore(subscribeOrientation, getLandscapeSnapshot, () => false)
}
export function getRaidMenuShipSpriteUrl(shipKey: string, landscape: boolean) {
  return getRaidPicker3DPreviewUrl(shipKey, landscape) || (landscape && getRaidSideShipSpriteUrl(shipKey)) || getRaidShipSpriteUrl(shipKey)
}

export function getRaidAlienSpriteUrl(variant: number) {
  const normalizedVariant = Number.isFinite(variant) ? Math.abs(Math.trunc(variant)) : 0
  const index = normalizedVariant % RAID_ALIEN_SPRITE_COUNT
  return getPublicAssetUrl(RAID_ALIEN_SPRITE_PATHS[index])
}

export function getRaidEliteSpriteUrl(variant: number) {
  const normalizedVariant = Number.isFinite(variant) ? Math.abs(Math.trunc(variant)) : 0
  const index = normalizedVariant % RAID_ELITE_SPRITE_COUNT
  return getPublicAssetUrl(RAID_ELITE_ASSET_PATHS[index])
}

// Ship-picker previews are pre-cropped directly from each ship's actual 3D
// banking atlas (both camera orientations). They are lighter and much clearer
// than loading all 27 full multi-pose textures onto the selection screen.
export function RaidShipPickerPreview({ shipKey, landscape }: { shipKey: string; landscape: boolean }) {
  const previewUrl = getRaidPicker3DPreviewUrl(shipKey, landscape)
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const source = previewUrl && failedUrl !== previewUrl
    ? previewUrl
    : (landscape && getRaidSideShipSpriteUrl(shipKey)) || getRaidShipSpriteUrl(shipKey)

  return (
    <span className="raid__ship-preview" aria-hidden="true">
      <img
        key={source}
        src={source}
        alt=""
        draggable={false}
        decoding="async"
        onError={() => { if (previewUrl && failedUrl !== previewUrl) setFailedUrl(previewUrl) }}
      />
    </span>
  )
}

// Small static displays share the tightly framed 3D renders used in selection.
export function RaidShipSprite({ shipKey, size, className = 'raid__ship-sprite', sideView }: {
  shipKey: string; size: number; className?: string; sideView?: boolean
}) {
  const landscape = useLandscapeScreen()
  const viewLandscape = sideView ?? landscape
  const key = shipKey === 'mesiah' ? 'mesiahBlack' : shipKey
  const frames = hullFrames as Readonly<Record<string, number[][]>>
  const frame = frames[key]?.[viewLandscape ? 1 : 0] ?? [0, 0, 1]
  return (
    <span className={className} aria-hidden="true" style={{
      position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: size, height: size, flexShrink: 0,
    }}>
      <img src={getRaidMenuShipSpriteUrl(shipKey, sideView ?? landscape)} alt="" draggable={false}
        decoding="async" style={{ position: 'absolute', left: `${frame[0] * 100}%`,
          top: `${frame[1] * 100}%`, width: `${frame[2] * 100}%`, height: `${frame[2] * 100}%`,
          objectFit: 'contain' }} />
    </span>
  )
}
