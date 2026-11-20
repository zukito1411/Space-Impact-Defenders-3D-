# Raid review requirements

- Before changing Raid rendering, inspect the current simulation, Canvas, Pixi, Three.js, loading and cleanup paths affected by the change.
- For boss visual changes, show all 15 campaign bosses plus Devil Gundam in named, actual landscape gameplay captures with the normal camera, model scale, HUD and stage scenery. Embed the review images in the user response. Isolated model sheets do not replace these captures.
- Performance analysis must cover the whole campaign and both orientations, including formations, bosses, heavy weapons/effects, asteroid clusters, atmospheric worlds, stage entries/clears and co-op. A reported slow stage is a reproduction case, not the entire scope.
- Preserve graphics, model detail, effects, texture quality, draw distance, rendering resolution and gameplay behavior. Prefer batching, reuse, preparation, bounded caches and removal of redundant work.
- Separate measured CPU update/submission costs, GPU execution, frame pacing and physical-device FPS. State the actual test environment and coverage. Never infer universal 120 FPS or no stutters from compilation, draw counts or software-rendered browser tests.

See [the repeatable review workflow](docs/raid-render-review-workflow.md) and `scripts/review-raid-campaign-browser.mjs`.
