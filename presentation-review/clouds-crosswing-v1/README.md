# Cloud wind and X-wing alignment

Stages 5 and 10 now transport all cloud and broad mist layers horizontally at independent wind speeds. The previous clouds moved only a few pixels per second and the broad mist layers only oscillated around fixed positions. The new wind follows the existing scene clock, pauses with gameplay, respects reduced motion and wraps beyond the visible cloud edge. Terrain movement and quality are unchanged.

Normal and Elite X-wing lower foils, lasers and engines now share the corresponding upper assembly's plan coordinates. The lower foil tips have symmetric vertical separation. Live laser and engine attachment markers were updated with the authored source, so their effects follow the aligned parts. Original paint, UVs and all unrelated mesh vertices/faces remain intact. Both live hulls retain one merged primitive.

Validation: production build; atmospheric geometry, lifecycle, pause/reduced-motion and wind transport checks; paired shipped hardpoint and primitive checks. The dedicated browser workflow records real stage 5/10 landscape gameplay motion and both X-wing variants in portrait and landscape, checks actual layer motion and attachment columns, and produces lossless animated WebP previews. These are visual and functional checks, not physical-device FPS measurements.
