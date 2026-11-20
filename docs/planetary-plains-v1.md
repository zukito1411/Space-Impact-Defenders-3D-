# Stage 5 and Stage 10 surface-flight setting

These encounters take place within the planets' atmospheres, above the planetary plains. Stage 5 retains its ocean surface, islands and cloud layers. Stage 10 retains its volcanic ground, ridges, vents, ash and smoke. Their established surface-flight framing and journey transitions are part of the game's intended setting.

The earlier local orbital replacement was removed after the setting was clarified. The HUD panel backgrounds remain at 28% opacity, with text opacity and colors retained.

## Surface seams and sky props

The atmospheric planet/moon props are hidden, including their live 3D globe meshes. The normal space-stage planet path and approach/departure progression remain intact.

The old ocean material contained a nonperiodic top-to-bottom gradient and a baked highlight stripe. Repeating that plate on the perspective ground produced visible patch boundaries. Water now uses a deterministic 1024×512 tile whose values and slopes repeat in both axes. Sunlight/reflections come from the existing surface shader. Repeat sampling now filters across wrap edges and normal offsets use the actual texture dimensions. The artificial constant-height cyan shoreline strip was removed from Pelagic island paintings.

The tile is baked during loading and reused. The frame shader retains its existing three texture samples and single surface draw. There are no new effects passes, geometry, downloads or per-frame texture bakes. The owned water texture grows from 1024×256 to 1024×512 (about 1.33 MiB additional RGBA8 GPU storage including mipmaps). This is not a physical-device FPS certification.

Validation: `npm run build` passes TypeScript, Vite, artwork and PWA checks. `node scripts/test-planet-atmosphere.mjs` passes continuous water values/slopes, pixel-edge comparisons, existing terrain/material checks, pooling, pause/resume, reduced motion and texture cleanup. Actual landscape gameplay captures for both stages, with normal camera, model scale and HUD, are indexed in `presentation-review/surface-seams-v1/bosses-v1.md`. Capture assertions verify no atmospheric planet anchors or globe meshes are visible, surface flight remains active, water uses repeat sampling and HUD text stays fully opaque. Browser validation uses Chromium / SwiftShader at 844×390.

Re-run captures with `node scripts/review-planetary-environments.mjs --captures-only` (`CHROMIUM_PATH` may select the browser). The earlier restoration captures remain in `presentation-review/planetary-plains-v1/` for comparison.
