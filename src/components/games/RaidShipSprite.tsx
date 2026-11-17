import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { RAID_ELITE_FRAME_PATHS } from './raid/shipArtwork'
import { drawRaidBankingCell, getRaidBankingAtlas, getRaidBankingAtlasUrl, isRaidGundamArt, raidBankingFrameIndex, raidBankingPreviewAngle } from './raid/bankingArt'
import { getRaidSideShipSpriteUrl } from './raid/sideArtwork'
import { getPublicAssetUrl } from './sound'
import { LEGACY_FIGHTER_COUNT, RAID_FIGHTER_ASSETS } from './raid/stageEncounters'

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
  return (landscape && getRaidSideShipSpriteUrl(shipKey)) || getRaidShipSpriteUrl(shipKey)
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
export function getRaidPicker3DPreviewUrl(shipKey: string, landscape: boolean) {
  if (!getRaidBankingAtlasUrl(shipKey)) return null
  const key = shipKey === 'mesiah' ? 'mesiahBlack' : shipKey
  return getPublicAssetUrl(`assets/ships/previews/${key}-${landscape ? 'landscape' : 'portrait'}-v1.webp`)
}

export function RaidShipPickerPreview({ shipKey, landscape }: { shipKey: string; landscape: boolean }) {
  const previewUrl = getRaidPicker3DPreviewUrl(shipKey, landscape)
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const source = previewUrl && failedUrl !== previewUrl
    ? previewUrl
    : getRaidMenuShipSpriteUrl(shipKey, landscape)

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

// Hangar and other 3D previews use a DPR-aware Canvas backed by the
// palette-matched atlas. The ship-selection cards opt into the original 2D art.
export function RaidShipSprite({ shipKey, size, className = 'raid__ship-sprite', sideView, preferOriginalArt = false }: { shipKey: string; size: number; className?: string; sideView?: boolean; preferOriginalArt?: boolean }) {
  const landscape = useLandscapeScreen()
  const viewLandscape = sideView ?? landscape
  // Keep the original 2D art in the ship picker: the small card should show
  // faithfully painted details rather than a magnified, baked banking frame.
  // In-flight, the hangar and support ships still use the corrected 3D atlas.
  const atlasUrl = (preferOriginalArt || isRaidGundamArt(shipKey)) ? null : getRaidBankingAtlasUrl(shipKey)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [loadedAtlas, setLoadedAtlas] = useState<string | null>(null)
  const [failedAtlas, setFailedAtlas] = useState<string | null>(null)

  useEffect(() => {
    if (!atlasUrl) return
    let active = true
    const sprite = getRaidBankingAtlas(shipKey)
    const paint = () => {
      if (!active) return
      const canvas = canvasRef.current
      if (!sprite?.loaded || !canvas) {
        setFailedAtlas(atlasUrl)
        return
      }
      const ratio = Math.min(3, Math.max(1, window.devicePixelRatio || 1))
      canvas.width = Math.max(1, Math.ceil(size * ratio))
      canvas.height = Math.max(1, Math.ceil(size * ratio))
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        setFailedAtlas(atlasUrl)
        return
      }
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
      ctx.clearRect(0, 0, size, size)
      drawRaidBankingCell(ctx, sprite, raidBankingFrameIndex(0, viewLandscape, false), size / 2, size / 2, size)
      setFailedAtlas(null)
      setLoadedAtlas(atlasUrl)
    }
    if (sprite?.loaded) paint()
    else if (sprite) void sprite.ready.then(paint)
    else setFailedAtlas(atlasUrl)
    return () => { active = false }
  }, [atlasUrl, shipKey, size, viewLandscape])

  const ready = atlasUrl !== null && loadedAtlas === atlasUrl && failedAtlas !== atlasUrl
  const legacyFallback = !atlasUrl || failedAtlas === atlasUrl
  return (
    <span className={className} aria-hidden="true" style={{
      position: 'relative', display: 'inline-flex', alignItems: 'center',
      justifyContent: 'center', width: size, height: size, flexShrink: 0,
    }}>
      {legacyFallback && <img
        src={getRaidMenuShipSpriteUrl(shipKey, viewLandscape)}
        alt="" draggable={false}
        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
      />}
      {atlasUrl && <canvas ref={canvasRef} aria-hidden="true" style={{
        position: 'absolute', left: 0, top: 0, width: '100%', height: '100%',
        transform: `rotate(${raidBankingPreviewAngle(viewLandscape)}deg)`,
        opacity: ready ? 1 : 0,
        transition: 'opacity 140ms ease-out',
        pointerEvents: 'none',
      }}/>}
    </span>
  )
}
