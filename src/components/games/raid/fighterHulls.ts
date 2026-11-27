import { LEGACY_FIGHTER_COUNT, RAID_FIGHTERS, RAID_FIGHTER_ASSETS } from './stageEncounters'

// Preserve the six hostile designs and their full original paint, rather than
// substituting player GLBs for visually unrelated enemies.
export const FIGHTER_HULL_KEYS = ['fighterNeedle', 'fighterCinder', 'fighterViolet',
  'fighterCrimson', 'fighterJade', 'fighterAuric'] as const
export const FIGHTER_HULL_ART: Readonly<Record<string, string>> = Object.fromEntries(
  FIGHTER_HULL_KEYS.map((key, index) => [key, RAID_FIGHTER_ASSETS[index]]))
export const SHIELDED_FIGHTER_HULLS: ReadonlySet<string> = new Set(
  FIGHTER_HULL_KEYS.filter((_, index) => RAID_FIGHTERS[index].shield > 0),
)
export const RAID_FIGHTER_MAX_BANK = .24

export function fighterHullBank(velocity = 0) {
  return Math.max(-RAID_FIGHTER_MAX_BANK, Math.min(RAID_FIGHTER_MAX_BANK, velocity * .007))
}

export function fighterHullKey(variant: number) {
  return FIGHTER_HULL_KEYS[variant - LEGACY_FIGHTER_COUNT]
}
/** The source fighter paintings face down; positive Three roll turns them right. */
export function fighterHullHeading(vx: number, vy: number, width: number, height: number) {
  return Math.abs(vx)+Math.abs(vy) < .001 ? 0 : Math.atan2(vx * width, vy * height)
}

export function fighterGunHeading(shotAngle: number | undefined, hullHeading: number, width: number, height: number) {
  return shotAngle === undefined ? hullHeading : fighterHullHeading(Math.sin(shotAngle), Math.cos(shotAngle), width, height)
}
