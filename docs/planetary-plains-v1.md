# Stage 5 and Stage 10 surface-flight setting

These encounters take place within the planets' atmospheres, above the planetary plains. Stage 5 retains its ocean surface, islands and cloud layers. Stage 10 retains its volcanic ground, ridges, vents, ash and smoke. Their established surface-flight framing and journey transitions are part of the game's intended setting.

The previous local orbital replacement was removed after the setting was clarified. The production background, atmosphere, ground shader and preload source are restored exactly to main `57ae388`. No new environment-quality or performance improvement is claimed by this restoration. The HUD panel backgrounds remain at 28% opacity, with text opacity and colors retained.

Validation: production `npm run build` passes TypeScript, Vite, artwork and PWA checks. Fresh actual landscape gameplay captures for Stage 5 and Stage 10, with normal camera, model scale and HUD, are indexed in `presentation-review/planetary-plains-v1/bosses-v1.md`. The focused capture runner verifies HUD background alpha 0.28 and panel/text opacity 1. Browser validation uses Chromium / SwiftShader at 844×390 and does not establish physical-device FPS.

Re-run captures with `node scripts/review-planetary-environments.mjs --captures-only` (`CHROMIUM_PATH` may select the browser).
