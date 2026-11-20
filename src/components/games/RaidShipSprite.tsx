import { MECH_PORTRAIT_PATHS, MECH_SIDE_PATHS } from './raid/mechArtwork'
import { useSyncExternalStore } from 'react'
import { getRaidPicker3DPreviewUrl, getRaidPicker3DPreviewPath, PLAYER_HULL_KEYS } from './raid/bankingArt'
import { getPublicAssetUrl } from './sound'
import { LEGACY_FIGHTER_COUNT, RAID_FIGHTER_ASSETS } from './raid/stageEncounters'

export { getRaidPicker3DPreviewUrl }

// Ship previews use model renders; Gundams keep their original 2D artwork.
export const RAID_SHIP_SPRITE_PATHS:Record<string,string>=Object.fromEntries(
  [...PLAYER_HULL_KEYS,'mesiah'].map(key=>[key,MECH_PORTRAIT_PATHS[key] ?? getRaidPicker3DPreviewPath(key,false)!]))

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
  if (MECH_PORTRAIT_PATHS[shipKey]) return getPublicAssetUrl(MECH_PORTRAIT_PATHS[shipKey])
  return getRaidPicker3DPreviewUrl(shipKey,false) ?? getRaidPicker3DPreviewUrl('rocket',false)!
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
  const mechPath = (landscape ? MECH_SIDE_PATHS : MECH_PORTRAIT_PATHS)[shipKey]
  if (mechPath) return getPublicAssetUrl(mechPath)
  return getRaidPicker3DPreviewUrl(shipKey,landscape) ?? getRaidPicker3DPreviewUrl('rocket',landscape)!
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

// Static menu artwork loads without a WebGL context.
export function RaidShipPickerPreview({ shipKey, landscape }: { shipKey: string; landscape: boolean }) {
  const wideScreen = useLandscapeScreen()
  return <span className="raid__ship-preview"><img
    src={getRaidMenuShipSpriteUrl(shipKey, landscape && wideScreen)}
    alt="" aria-hidden="true" loading="eager" decoding="async" draggable={false} /></span>
}

export function RaidShipSprite({ shipKey, size, className = 'raid__ship-sprite', sideView }: {
  shipKey: string; size: number; className?: string; sideView?: boolean
}) {
  const landscape = useLandscapeScreen()
  return <img src={getRaidMenuShipSpriteUrl(shipKey, sideView ?? landscape)}
    width={size} height={size} className={className} alt="" aria-hidden="true"
    loading="eager" decoding="async" draggable={false} style={{ objectFit: 'contain' }} />
}
