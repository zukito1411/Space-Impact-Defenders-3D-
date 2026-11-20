import type { BossKind } from './types'

export const SPECIAL_BOSS_ART = {
  squid: 'assets/bosses/special/abyss-squid-v1.png',
  snake: 'assets/bosses/special/serpent-guardian-v1.png',
  final: 'assets/bosses/special/mirage-mothership-v1.png',
} as const
export type SpecialBossKind = keyof typeof SPECIAL_BOSS_ART
export const SERPENT_SKIN_ART = 'assets/bosses/special/serpent-skin-v1.png'
export const MOTHERSHIP_KEEL_ART = 'assets/bosses/special/mothership-keel-v1.png'
export const SQUID_SKIN_ART = 'assets/bosses/special/squid-skin-v1.png'
export function specialBossHullKey(kind: BossKind | null) {
  return kind === 'squid' ? 'abyssSquidHull' : kind === 'snake' ? 'serpentGuardianHull'
    : kind === 'final' ? 'mirageMothershipHull' : null
}
