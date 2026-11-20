# Planetary terrain in side flight

Stages 5 and 10 previously combined a perspective ground material with three flat ridge strips. Those strips scrolled independently and much more slowly; the ground also traveled in the opposite screen direction.

The landscape atmosphere now uses textured height-field geometry for rocky islands and cratered volcanic slopes. Terrain feet, ground UVs and crater/smoke attachments share the same oblique camera, world travel and seamless period. Depth determines the apparent speed of near and distant surfaces. Stage-colored lighting, weather, spray, ash and embers remain; the existing overhead portrait scene is preserved.

Each world admits one static terrain mesh during loading (32,472 vertices / 61,440 triangles). Geometry, normals and sorted indices are retained for flight; frame updates change camera/light uniforms and pooled weather poses. One terrain submission replaces the three ridge strips. The existing Pixi context and authored basalt texture are reused, with the original render resolution and texture detail. Preparation and disposal follow the existing atmospheric renderer lifecycle.

## Verification

- Production build and packaged artwork/PWA verification.
- Finite geometry, normalized normals, valid indices and backward travel direction.
- Existing atmospheric pooling, low quality, planet switching, pause/resume and material/mesh teardown checks.
- Actual gameplay pixel comparisons in Chromium/SwiftShader for both worlds at two travel times and across the world wrap.
- Exact ground/terrain travel agreement, ground-foot projection, crater attachment, pause and reduced-motion checks.
- Portrait scene visibility regression checks and normal landscape gameplay captures of stages 5 and 10.

Run the targeted browser review:

```sh
RAID_REVIEW_TERRAIN_CHECK=1 RAID_REVIEW_STAGES=5,10 RAID_REVIEW_OUTPUT=presentation-review/terrain-v1 node scripts/review-raid-campaign-browser.mjs --captures-only
```

The CI workflow installs Playwright's Chromium and media dependencies and uploads the review evidence. This is a targeted visual/movement review, not a physical-device FPS benchmark or an expanded campaign performance audit.

The older standalone `scripts/test-cosmos.mjs` is currently blocked by an existing test-double omission (`OrbitalCombatRocks` is undefined). Its `background.ts` input is unchanged by this update; the targeted browser checks use the real background renderer instead.
