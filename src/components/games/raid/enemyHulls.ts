import { CAMPAIGN_BOSS_ART, getGenericBossArt } from './bossCatalog'
import { FIGHTER_HULL_ART, FIGHTER_HULL_KEYS, fighterHullKey } from './fighterHulls'
import { LEGACY_FIGHTER_COUNT, RAID_FIGHTER_ASSETS } from './stageEncounters'
import type { Enemy } from './types'
import type { VolumeProfile } from './paintedVolume'

export type EnemyHullSpec = {
  assetPath: string
  profile: VolumeProfile
  resolution: number
  filter?: string
  family: 'normal' | 'elite' | 'boss'
}
const legacyKeys = Array.from({ length: LEGACY_FIGHTER_COUNT }, (_, index) => 'alienHull' + index)
const eliteKeys = Array.from({ length: 5 }, (_, index) => 'eliteHull' + index)
const bossKey = (stage: number) => 'commandHull' + stage
const entries: Array<[string, EnemyHullSpec]> = [
  ...legacyKeys.map((key, index): [string, EnemyHullSpec] => [key, {
    assetPath: `assets/aliens/alien_v${index}.png`, profile: 'organic', resolution: 144, family: 'normal',
  }]),
  ...FIGHTER_HULL_KEYS.map((key): [string, EnemyHullSpec] => [key, {
    assetPath: FIGHTER_HULL_ART[key], profile: 'fighter', resolution: 144, family: 'normal',
  }]),
  ...eliteKeys.map((key, index): [string, EnemyHullSpec] => [key, {
    assetPath: `assets/aliens/elite_${index}.png`, profile: 'organic', resolution: 160, family: 'elite',
  }]),
  ...CAMPAIGN_BOSS_ART.map((art): [string, EnemyHullSpec] => [bossKey(art.stage), {
    assetPath: art.assetPath, profile: 'capital', resolution: 160, family: 'boss',
  }]),
]
/** All hostile designs share decoded paint and indexed geometry across their instances. */
export const ENEMY_HULL_SPECS: Readonly<Record<string, EnemyHullSpec>> = Object.fromEntries(entries)
export const ENEMY_HULL_KEYS = entries.map(([key]) => key)
const normalizedIndex = (variant: number, count: number) => Number.isFinite(variant) ? Math.abs(Math.trunc(variant)) % count : 0
export function normalEnemyHullKey(variant: number) {
  const index = normalizedIndex(variant, LEGACY_FIGHTER_COUNT + RAID_FIGHTER_ASSETS.length)
  return fighterHullKey(index) ?? legacyKeys[index]
}
export function enemyHullKey(enemy: Pick<Enemy, 'isBoss' | 'isMiniBoss' | 'bossKind' | 'bossArtStage' | 'variant'>) {
  if (enemy.isBoss) {
    // Keep the stage-5/10/15 and Devil Gundam renderers, including mirages, intact.
    if (enemy.bossKind === 'squid' || enemy.bossKind === 'snake' || enemy.bossKind === 'final' || enemy.bossKind === 'devil') return null
    const art = getGenericBossArt(enemy.bossKind ?? 'carrier', enemy.bossArtStage)
    return art ? bossKey(art.stage) : null
  }
  return enemy.isMiniBoss ? eliteKeys[normalizedIndex(enemy.variant, eliteKeys.length)] : normalEnemyHullKey(enemy.variant)
}
