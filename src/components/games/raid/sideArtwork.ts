import { MECH_SIDE_PATHS } from './mechArtwork'
import { getPublicAssetUrl } from '../sound'
import { getMechFlightNozzles } from './mechFlight'
import { getRaidPicker3DPreviewUrl } from './bankingArt'
import { getRaidShipBaseVisualKey } from './shipArtwork'

function sideKey(shipKey: string) {
  const key = getRaidShipBaseVisualKey(shipKey)
  return key === 'mesiahBlack' ? 'mesiah' : key
}

export function getRaidSideShipSpriteUrl(shipKey: string) {
  if (MECH_SIDE_PATHS[shipKey]) return getPublicAssetUrl(MECH_SIDE_PATHS[shipKey])
  return getRaidPicker3DPreviewUrl(shipKey,true)
}

// Convert outlets measured in the right-facing artwork to logical flight space.
const outlet = (x: number, y: number, width: number): readonly [number, number, number] => [y, -x, width]
const SIDE_NOZZLES: Record<string, readonly (readonly [number, number, number])[]> = {
  rocket: [outlet(-.415, -.015, .05), outlet(-.415, .055, .05)],
  fast: [outlet(-.46, -.018, .05), outlet(-.46, .055, .05)],
  gatling: [outlet(-.44, -.03, .05), outlet(-.44, .065, .05)],
  laser: [outlet(-.44, -.022, .05), outlet(-.44, .055, .05)],
  dreadnought: [outlet(-.405, -.068, .033), outlet(-.46, .02, .074)],
  xwing: [outlet(-.435, -.065, .045), outlet(-.435, .065, .045)],
  spaceEt: [outlet(-.46, -.02, .05), outlet(-.46, .055, .05)],
  mesiah: [outlet(-.46, -.068, .044), outlet(-.48, .005, .055), outlet(-.46, .073, .044)],
  mesiahRaptorBlack: [outlet(-.43, .005, .055)],
  mesiahRaptorWhite: [outlet(-.455, .005, .055)],
  godGundam: getMechFlightNozzles('godGundam'),
  godGundamBurning: getMechFlightNozzles('godGundam'),
  spiegel: getMechFlightNozzles('spiegel'),
}
SIDE_NOZZLES.mesiahWhite = SIDE_NOZZLES.mesiah

export function getRaidSideShipNozzles(shipKey: string) {
  return SIDE_NOZZLES[sideKey(shipKey)]
}

