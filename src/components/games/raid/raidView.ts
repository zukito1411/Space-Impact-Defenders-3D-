/** One oblique view of the flight plane, shared by live hulls and orbital space.
 * Gameplay anchors remain screen coordinates; only presentation uses this basis. */
export const RAID_CAMERA_FOV = 35
export const LANDSCAPE_VIEW_YAW = -56 * Math.PI / 180
export const raidCameraFocal = (height: number) => height * .5 / Math.tan(RAID_CAMERA_FOV * Math.PI / 360)
