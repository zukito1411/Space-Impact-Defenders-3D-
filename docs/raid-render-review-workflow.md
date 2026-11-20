# Raid visual and performance review

Default review requirements for future Raid boss or rendering changes, also recorded in the root `AGENTS.md`:

1. Show named boss captures inline to the user using the actual landscape gameplay camera, normal model scale, HUD and stage background. A model-sheet camera or isolated mesh render is supplementary. Include all 15 campaign bosses and Devil Gundam; preserve the existing special bodies unless a redesign is requested.
2. Review rendering across the whole campaign. A reported slow stage is a reproduction case, not the entire performance scope. Cover normal formations, bosses, heavy weapon/asteroid/impact scenes, atmospheric worlds, entries and clears, plus local co-op. Exercise both flight orientations.
3. Keep graphics, model detail, effects, texture quality, draw distance, render resolution and gameplay behavior intact. Prefer shared batching, buffer/material reuse, loading preparation, bounded caches and removal of redundant work.
4. Record CPU update/draw/layer costs separately from submitted draw/triangle/texture counts. GPU submission time is CPU time, not GPU execution time. Report unsupported GPU timing explicitly. Physical-device FPS and sustained thermal behavior require their own measurements; a software renderer cannot establish a universal 120 FPS result.

## Repeatable runner

With Playwright and Chromium installed:

```sh
node scripts/review-raid-campaign-browser.mjs
```

The default produces only the 16 landscape boss images. Keep routine review bounded; whole-campaign analysis does not require running every workload combination automatically. The full load matrix is a separate, potentially long run: use `--profile` for captures plus profiling, or `--profile-only` for profiling alone. Run it when that depth of measurement is warranted and communicate the expected scope first.

The runner starts its own Vite fixture unless `RAID_TEST_URL` supplies an existing server. `CHROMIUM_PATH` optionally selects the Chromium executable. `--captures-only` explicitly selects visual review. `RAID_REVIEW_FRAMES` controls profile samples per case (24 by default, 12–180 allowed). `--resume` retains completed cases and existing images after an interrupted run; use it only with the same production source, quality, browser and viewports, together with `--profile` or `--profile-only`. Each case records its sample count; short samples are diagnostic, not sustained performance measurements. Keep CPU/GPU benchmark runs separate from builds and other heavy host work.

Outputs live in `presentation-review/campaign-v1/`:

- `boss-01-landscape-v1.png` through `boss-16-landscape-v1.png`: gameplay captures, with 16 representing the Devil Gundam anomaly.
- `bosses-v1.md` and `bosses-v1.json`: named review index.
- `loads-v1.json`: all-stage measurements, sample counts, quality, viewport density and error records.

After profiling, `node scripts/summarize-raid-campaign-review.mjs` checks that all 158 campaign workload cases and all 16 visual captures are indexed, then writes `docs/raid-campaign-render-audit-v1.md`. Use `--allow-partial` to report an interrupted run with explicit missing cases. Its CPU tables and submitted-work counts describe the recorded run; it does not certify device FPS. The browser runner currently selects SwiftShader explicitly, so its GPU timing is software execution rather than physical GPU evidence. The existing Pixi timer is asynchronous and can retain an earlier case's last result; do not treat those samples as fresh per-frame total GPU time.

The runner boots and launches through the actual Raid UI. Its diagnostic state setup is confined to the browser fixture. Native spawn, update and drawing callbacks are reused; it parks the normal rAF scheduler during controlled stepping to avoid double updates. It changes no production gameplay/rendering code and writes no player save data outside its isolated browser context. The FPS debug overlay is hidden in review images; the gameplay HUD remains visible.

The matrix uses Max quality at a declared device scale factor of 1 for comparable stage costs. Synthetic setup makes threats simultaneously visible and grants invulnerability for observation. This is a repeatable stress review, not a complete campaign playthrough or physical phone benchmark. Capture and CPU sampling do not measure browser compositing, input latency, network co-op, sustained memory/thermal behavior or every possible player loadout.
