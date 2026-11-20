# Normal boss lower hulls

The twelve mechanical campaign bosses previously used a nearly constant-depth lower shell, with their top painting also showing on the underside. Their lower hulls now have independent structural layouts: carrier cradles and hangar recesses, radial reactor frames, split scythe keels, segmented blade armor, fortress engine bastions and the Hydra's three-prong underframe. Later bosses have distinct reinforcement layouts.

The geometry worker builds these lower structures under the existing silhouette. Rolled lower shoulders and a separate negative-Z armor belt replace straight slab edges. Recessed reactor housings with modeled collars and dark internal wells merge into the same hull mesh. All added components are below the deck datum and checked against opaque source artwork before admission. Lower surfaces use the existing full-resolution metal/machinery atlas with independent mapping.

## Upper-hull preservation

- The original upper elevation function, art assets, paint coordinates, weapons, scale, camera and combat behavior are retained.
- Golden buffers from source commit `907482ac5c6d594474adb0dfb3d67d1b9a91a40a` verify byte-identical upper vertex positions, normals, UVs, triangle indices and baked cavity shading for all 15 bosses using an irregular clipped fixture with holes and thin wings.
- The complete shell buffers for the squid, serpent and final saucer are also byte-identical. Devil Gundam uses its existing separate artwork path.
- New painting is restricted to negative model Z; the upper deck retains its existing material behavior.

## Targeted validation

`node scripts/test-boss-keels.mjs` checks the preserved upper buffers, bounded lower relief, recessed bays and special shells. Existing volume and special-boss geometry checks also pass, along with the production build and packaged artwork/PWA checks.

The browser review checks all twelve actual loaded bosses in both orientations. It verifies that added housings stay below Z=0, the upper painting remains visible in a clean top view, the lower geometry renders in the normal landscape camera and actor draw counts remain bounded. Each underframe is merged during loading; flight never rebuilds its geometry.

The named gallery contains all 15 campaign bosses plus Devil Gundam in actual landscape gameplay with normal scale, camera, HUD and scenery. An isolated underside sheet supplements those captures. See [the gameplay gallery](../presentation-review/boss-keels-v1/bosses-v1.md).

Run:

```sh
RAID_REVIEW_KEEL_CHECK=1 RAID_REVIEW_OUTPUT=presentation-review/boss-keels-v1 node scripts/review-raid-campaign-browser.mjs --captures-only
```

Browser evidence uses headless Chromium/SwiftShader at DPR 1, with landscape 844×390 and portrait 393×852. This is a targeted geometry/appearance review, not a physical-device FPS claim or an expanded campaign performance audit.
