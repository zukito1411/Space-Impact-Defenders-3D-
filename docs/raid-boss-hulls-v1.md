# Capital hull detail and stage rendering

The twelve regular campaign bosses now use stage-specific deck and keel lofts. Armor shoulders, spines, head housings and citadels have distinct elevations; carrier bays and reactor surrounds are recessed. The original 512px paintings still define the clipped footprint and top UV registration. Stages 5, 10, 15, Devil Gundam and the player mechs retain their existing body renderers.

Physical armament uses stepped barrel jackets, recessed bores and mounting collars seated against the same deck-elevation function as the worker mesh. Each hull's armament merges into one static indexed mesh at admission. The original inward tubes on the round bosses remain reactor conduits, with separate outward-facing batteries on their perimeter pods. Weapon simulation, committed attack warnings, damage and collision geometry are unchanged.

The new generated `capital-armor-atlas-v1.png` supplies metal flanks and cannon jackets. It avoids stretching a top-view edge texel over a deep bulkhead. Deck paint remains original; steep armor faces sample the metal atlas in hull coordinates under the existing PBR lighting. The body geometry already clips transparent openings, so solid bulkheads do not inherit partially transparent edge texels. Opacity still controls damage/defeat fades. See `raid-boss-hulls-v1.json` for the asset receipt.

The atlas decodes once and uploads during the existing enemy preparation queue. All bosses share its texture and mip chain; unloading one boss does not dispose the shared atlas. It is included in the persistent image list, with cache generation v22. No flight-time canvas baking, pixel readback, model construction, point lights or shadow maps were added.

## Rendering cost

Ordinary reconstructed enemy hulls previously submitted the deck and walls as two material groups. They now use one material, retaining the existing wall tint through linear vertex colors and the original wall roughness/metalness through a wall attribute. Geometry, paint UVs and texture resolution are unchanged. The five ships in Stage 3's first formation rendered in **5 calls instead of 10**, retaining **133,096 triangles** in the isolated browser fixture. Its before/after screenshots were pixel-identical (zero changed pixels).

Cinder landscape motes previously alternated additive embers and normally blended ash. Two persistent containers group those materials; every particle retains its index, motion, size, color and visibility budget. The controlled Stage 10 scenery case went from **46 calls to 12**, with **10,690 triangles** in both captures. The corresponding ocean case stayed at 10 calls and 10,686 triangles. This changes composition order for overlapping ash and embers so luminous particles render after ash.

The twelve-boss review scene went from 24 calls / 735,872 triangles to **23 calls / 773,272 triangles**. Prism Sovereign uses its existing integrated crystal emitters; the other eleven hulls each add one merged armament draw. The shared atlas adds approximately **8 MiB** of nominal RGBA mipmapped GPU pixels, plus its decoded image; it is not twelve separate textures.

Stage 3 also brings the destination planet close enough to cover much of the playfield. Its surface and atmosphere now receive normalized sun and half-light vectors as uniforms, removing uniform-only normalization from the per-pixel shader paths. Surface size, draw distance, tessellation, cloud samples, atmosphere integration and render resolution are unchanged.

## Verification

- `tsc --noEmit -p tsconfig.json`.
- `test-enemy-volume.mjs`: existing fractional contours and UV bounds, all twelve detailed decks, original topology/XY registration, bounded heights, recessed bays and valid cannon dimensions.
- `test-planet-atmosphere.mjs`: no new display objects during flight, pause/reduced motion, material grouping, and repeated planet switching without duplicated motes.
- Command and campaign tests cover attack timing, warning/collision agreement, catalog identities and excluded bosses. On this CRLF checkout those existing extraction tests require in-memory LF normalization.
- A live Stage 3 diagnostic launched through the real menu/hangar, observed 12 enemies and 11 hostile shots, and exercised the real Verdant Reaper spawn/attack path without page errors. This was a diagnostic state setup, not a complete campaign playthrough.
- `test-stage-rendering-browser.mjs`: stage transitions and backlit actors, plus all twelve boss meshes in both views, physical cannon presence, bounded draw calls and shader errors. Review captures use `presentation-review/boss-hulls-v1-*.png`.

Browser checks use headless Chromium with SwiftShader here. Draw and triangle counts establish submitted work, not physical-device FPS. The scenery profile excludes live combat; Stage 3's gunships also change combat load relative to Stage 1. Device frame pacing, sustained temperature and actual 120Hz performance remain unverified.
