/** One oblique view of the flight plane, shared by live hulls and orbital space.
 * Gameplay anchors remain screen coordinates; only presentation uses this basis. */
export const RAID_CAMERA_FOV = 35
export const LANDSCAPE_VIEW_YAW = -56 * Math.PI / 180
export const ORGANIC_BOSS_VIEW_YAW = -24 * Math.PI / 180
export const raidCameraFocal = (height: number) => height * .5 / Math.tan(RAID_CAMERA_FOV * Math.PI / 360)

/** Side-on hangar framing, shared by the hull and its deck attachments. */
export function hullViewYaw(landscape: boolean, dock = 0) {
  if (!landscape) return 0
  const parked = Math.max(0,Math.min(1,dock))
  return LANDSCAPE_VIEW_YAW+(-78*Math.PI/180-LANDSCAPE_VIEW_YAW)*parked
}
