# Combat hull readability

The existing Three.js fill light now provides a neutral, viewing-side minimum during combat. This preserves paint and surface detail when a stage sun is behind a hull or an eclipse dims the main light. It applies to player, support, enemy and boss hulls, including instanced batches.

The fill blends 55% toward a pale neutral tint and uses intensity 1.5–2.0 depending on the backlight direction. Its direction favors the camera-facing surfaces. Stage key light, hemisphere light, environment reflections, materials and background lighting remain intact. The adjustment blends away in the carrier, which retains its original lighting.

No lights, draw calls, shadow maps, render passes, geometry, textures or resolution were added or reduced. Gameplay and stage scenery are unchanged.

## Validation

- Production build passed (`npm run build`).
- 17 controlled comparisons: four regional palettes, backlight and eclipse conditions, both hull orientations, plus the carrier. Seven submissions include a duplicate fighter to exercise instancing.
- Measurements use actual rendered opaque hull pixels with the same camera, meshes, paint and environment before/after. Only the old fill-light uniforms are restored for the comparison baseline.
- Every combat hull passed the brightness-gain and paint-clipping checks. Naturally dark alien/elite paint retains its darker character. Draw counts and instance batches matched the baseline in every case; carrier luminance was unchanged.
- All 15 campaign bosses plus Devil Gundam were captured in actual landscape gameplay with the normal camera, model scale, HUD and stage scenery. See [the named gallery](../presentation-review/readability-v1/bosses-v1.md) and [comparison data](../presentation-review/readability-v1/readability-checks.json).

Repeat the targeted review:

```sh
RAID_REVIEW_OUTPUT=presentation-review/readability-v1 RAID_REVIEW_LIGHTING_CHECK=1 CHROMIUM_PATH=/usr/bin/chromium node scripts/review-raid-campaign-browser.mjs --captures-only
```

Environment: Headless Chromium with SwiftShader, DPR 1, 844 × 390 render surface. The lighting comparisons cover both hull orientations; the named gameplay captures are landscape. This is visual and rendering-structure verification, not physical mobile/PC FPS or GPU-time certification. Expanded campaign workloads and co-op performance sampling were not run for this lighting-only change.
