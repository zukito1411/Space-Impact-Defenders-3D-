/** Mechs retain their authored 2D silhouettes and pose sheets in every view. */
export const MECH_PORTRAIT_PATHS: Readonly<Record<string, string>> = {
  godGundam: 'assets/ships/god-gundam.png',
  godGundamBurning: 'assets/ships/god-gundam-burning.png',
  spiegel: 'assets/ships/spiegel.png',
}
export const MECH_SIDE_PATHS: Readonly<Record<string, string>> = {
  godGundam: 'assets/ships/sideview/god-gundam-flight-v4.webp',
  godGundamBurning: 'assets/ships/sideview/god-gundam-burning-flight-v5.webp',
  spiegel: 'assets/ships/sideview/spiegel-flight-v2.webp',
}
export function isRaid2DMech(key: string) {
  return key === 'godGundam' || key === 'godGundamBurning' || key === 'spiegel'
}
