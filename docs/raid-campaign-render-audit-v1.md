# Raid campaign rendering review v1

## Evidence and scope

- **Coverage: 137/158 planned workload cases; sampling stopped early at the user's request. All 15 landscape stages were covered; portrait coverage is partial.** Missing cases: portrait/12/waves, portrait/12/boss, portrait/12/burst, portrait/12/entry, portrait/12/transition, portrait/13/waves, portrait/13/boss, portrait/13/burst, portrait/13/entry, portrait/13/transition, portrait/14/waves, portrait/14/boss, portrait/14/burst, portrait/14/entry, portrait/14/transition, portrait/15/waves, portrait/15/boss, portrait/15/burst, portrait/15/entry, portrait/15/transition, portrait/15/coop.
- Max quality, DPR 1: 1920 measured frames. Each completed case has eight warm-up frames and 12 or 24 measured frames; sample counts are retained per case. These are short diagnostic samples, unsuitable for sustained FPS or rare-stutter certification. A TypeScript check ran concurrently with part of the landscape sampling, so these CPU values are not an isolated benchmark.
- Native stage formations, native boss updates/attacks, combined weapon/option effects, 16 combat asteroids, impact bursts, stage entry/clear states, and local co-op at stages 1/5/10/15. The burst setup combines native workloads deliberately; it is not a natural-play frequency estimate.
- **16 actual landscape gameplay images**, including Devil Gundam: [gallery](../presentation-review/campaign-v1/bosses-v1.md). Normal game cameras, body scale, HUD and stage artwork are retained. Boss placement/HP/timers are controlled for inspection. Special bodies 5/10/15/Devil were not redesigned.
- Browser: Headless Chromium / SwiftShader. Viewports: landscape 844×390, portrait 393×852. No captured page errors or shader/WebGL frame errors. External service calls are blocked in this isolated fixture.
- Source review includes the frame scheduler, simulation/collision, Canvas overlay, Pixi scenery/foreground, Three ship presentation, preloading/pools, planetary atmosphere, cosmic shaders, carrier deck/clamps, and cleanup. This turn adds diagnostic tooling and review instructions; it does not change production graphics, gameplay or frame-rate settings.

Raw evidence: [loads-v1.json](../presentation-review/campaign-v1/loads-v1.json). Re-run with [the workflow](raid-render-review-workflow.md). The diagnostic resumes interrupted runs; it does not claim a baseline/candidate optimization comparison.

## Findings across the game

1. **Stage number is not a sufficient explanation for frame cost.** The same stage has different costs during waves, boss attacks, impacts and transitions. Review scenario distributions and submitted work together, rather than ranking one screenshot or one stage. Dense formations and combined effects use the shared combat/rendering paths across the campaign.
2. **There are three rendering surfaces.** Pixi draws scenery/projectiles/particles, Three draws live hulls, and Canvas draws overlays and special animations. GPU work, blending and browser compositing can remain expensive even when JavaScript submission is short. The current GPU timer measures only the Pixi render pass. Its asynchronous last-result value can carry across cases; raw GPU samples must not be interpreted as fresh per-frame or total GPU time.
3. **The preserved special bosses need a separate CPU review.** Squid, Snake and Final retain continuous native Canvas animation. The table below reports their measured body-drawing work without suggesting flattened animation frames or reduced detail. Devil remains 2D; its visual capture is included, but its attack phases are outside this campaign timing matrix.
4. **Shared GPU fill matters as much as triangles.** Cosmic gas uses three authored-art samples; galaxy discs integrate eight layers, while globes/atmospheres and transparent combat effects can overlap. Screen coverage and overdraw change with scenery and combat. Preserve these visuals; use hardware traces to determine whether shader arithmetic, texture bandwidth, blending, geometry or compositing is limiting each device before changing the path.
5. **Preparation and pooling already exist and must remain intact.** Three admits two hull preparations at a time, reserves pooled enemies and warms screen shader variants/buffers. Pixi pools projectiles/particles; foreground textures and live hull assets have retirement limits. Formation bursts can exceed the initial hull reserve, so first-use instance allocation/upload and long-run pool behavior deserve explicit cold/warm traces. This short warm-state run does not prove absence of allocation spikes or leaks.
6. **The frame loop already follows requestAnimationFrame without a fixed render cap.** Maximum presented FPS still depends on display refresh, pixel density, CPU/GPU work and thermal limits. The simulation has a long-frame dt guard; that is not an FPS cap. Nothing here establishes universal 120 FPS or guarantees no stutters.

## Workload summary

CPU milliseconds below measure native update/draw calls under this software renderer, with the existing performance instrumentation enabled and diagnostic draw-call wrappers installed. Optional GPU query polling and diagnostic instrumentation add overhead; this is not the ordinary uninstrumented game loop. The samples exclude ordinary input/network orchestration, React snapshot work outside sampled draws and browser compositing. Across-stage medians are descriptive; cases use short samples and different actor mixes, and compilation, garbage collection, software-driver stalls and host scheduling can affect outliers. Do not convert these numbers to device FPS.

Canvas excludes separately timed Three submission. Boss CPU is a subset of Canvas CPU, not an additional pass. Draw-call maxima are submitted work, not GPU execution time. Texture counts are not byte measurements or leak tests.

| Workload | View | Cases | Median update CPU ms | Median draw CPU ms | Median Canvas CPU ms | Max Pixi draws | Max Three draws |
|---|---|---:|---:|---:|---:|---:|---:|
| waves | landscape | 15 | 0.37 | 5.33 | 0.80 | 40 | 24 |
| waves | portrait | 11 | 0.32 | 5.63 | 0.91 | 30 | 19 |
| boss | landscape | 15 | 0.28 | 5.22 | 1.16 | 38 | 3 |
| boss | portrait | 11 | 0.30 | 4.94 | 1.23 | 31 | 3 |
| burst | landscape | 15 | 0.53 | 6.60 | 1.19 | 59 | 26 |
| burst | portrait | 11 | 0.52 | 6.48 | 0.99 | 50 | 21 |
| entry | landscape | 15 | 0.07 | 3.91 | 0.79 | 38 | 1 |
| entry | portrait | 11 | 0.07 | 3.73 | 0.60 | 28 | 1 |
| transition | landscape | 15 | 0.05 | 3.95 | 0.76 | 39 | 1 |
| transition | portrait | 11 | 0.07 | 3.60 | 0.60 | 29 | 1 |
| coop | landscape | 4 | 0.63 | 8.25 | 1.75 | 60 | 29 |
| coop | portrait | 3 | 0.64 | 5.71 | 1.71 | 47 | 24 |

## Preserved animated bosses

| Stage | View | Draw CPU mean ms | Boss Canvas CPU mean ms | Pixi submission CPU mean ms | Three submission CPU mean ms |
|---|---|---:|---:|---:|---:|
| 5 | landscape | 12.80 | 8.99 | 1.57 | 0.39 |
| 5 | portrait | 9.61 | 6.20 | 0.94 | 0.41 |
| 10 | landscape | 6.23 | 3.74 | 0.92 | 0.24 |
| 10 | portrait | 3.92 | 2.42 | 0.38 | 0.22 |
| 15 | landscape | 5.21 | 0.27 | 3.28 | 0.23 |

## Largest observed CPU draw outliers

These are observations, not established causes or device FPS. A single software-driver or host stall can dominate a short case's mean. The last column is the maximum Pixi submission CPU cost in the same case, not necessarily the same frame; raw summaries cannot reconstruct the full critical path. Reproduce with a hardware trace before assigning the stall to a particular asset, shader, allocation or stage mechanic.

| Stage | View | Case | Draw CPU mean ms | Draw CPU p95 ms | Draw CPU max ms | Pixi submission CPU max ms |
|---|---|---|---:|---:|---:|---:|
| 4 | portrait | waves | 89.68 | 985.60 | 985.60 | 983.10 |
| 3 | landscape | waves | 42.97 | 18.10 | 855.50 | 851.70 |
| 5 | landscape | boss | 12.80 | 24.80 | 29.80 | 6.20 |
| 5 | landscape | burst | 11.17 | 22.20 | 22.20 | 11.70 |
| 2 | landscape | burst | 8.42 | 18.40 | 21.00 | 15.90 |

## All-stage submitted work and CPU envelope

Each row summarizes all sampled scenarios for that stage/view. Independent maxima in a row can come from different frames/scenarios; they must not be added together. The p95 column is the highest individual-case p95, not a pooled stage percentile.

| Stage | View | Highest mean update CPU ms | Highest mean draw CPU ms (case) | Highest case draw CPU p95 ms | Max Pixi draws | Max Three draws | Max Three triangles |
|---|---|---:|---|---:|---:|---:|---:|
| 1 | landscape | 0.71 | 8.18 (coop) | 13.60 | 48 | 20 | 286,304 |
| 1 | portrait | 0.93 | 8.67 (burst) | 15.80 | 47 | 20 | 286,304 |
| 2 | landscape | 0.69 | 8.42 (burst) | 18.40 | 47 | 17 | 317,664 |
| 2 | portrait | 0.52 | 6.93 (waves) | 15.30 | 48 | 17 | 317,664 |
| 3 | landscape | 0.65 | 42.97 (waves) | 18.10 | 48 | 19 | 428,884 |
| 3 | portrait | 0.46 | 7.09 (burst) | 16.30 | 49 | 19 | 428,884 |
| 4 | landscape | 0.60 | 6.54 (burst) | 13.30 | 47 | 19 | 488,376 |
| 4 | portrait | 0.84 | 89.68 (waves) | 985.60 | 49 | 19 | 488,376 |
| 5 | landscape | 0.91 | 12.80 (boss) | 24.80 | 36 | 22 | 556,040 |
| 5 | portrait | 0.77 | 9.61 (boss) | 19.90 | 29 | 22 | 556,040 |
| 6 | landscape | 0.51 | 8.03 (burst) | 15.60 | 46 | 19 | 562,800 |
| 6 | portrait | 0.59 | 5.61 (waves) | 10.30 | 48 | 19 | 562,800 |
| 7 | landscape | 0.51 | 9.38 (waves) | 19.80 | 50 | 20 | 545,568 |
| 7 | portrait | 0.51 | 7.86 (burst) | 11.90 | 50 | 20 | 545,568 |
| 8 | landscape | 0.38 | 5.60 (burst) | 12.50 | 48 | 20 | 550,544 |
| 8 | portrait | 0.48 | 6.48 (burst) | 13.20 | 46 | 20 | 550,544 |
| 9 | landscape | 0.55 | 5.33 (waves) | 10.80 | 47 | 20 | 653,972 |
| 9 | portrait | 0.50 | 5.63 (waves) | 12.50 | 48 | 20 | 653,972 |
| 10 | landscape | 0.63 | 7.32 (coop) | 12.00 | 38 | 24 | 739,092 |
| 10 | portrait | 0.64 | 5.71 (coop) | 8.60 | 26 | 24 | 739,092 |
| 11 | landscape | 0.53 | 6.89 (burst) | 12.00 | 45 | 20 | 605,316 |
| 11 | portrait | 0.61 | 6.11 (burst) | 12.50 | 46 | 20 | 605,316 |
| 12 | landscape | 0.54 | 5.63 (burst) | 11.50 | 45 | 22 | 706,156 |
| 13 | landscape | 0.42 | 6.52 (burst) | 17.70 | 45 | 22 | 696,264 |
| 14 | landscape | 0.41 | 6.86 (burst) | 12.10 | 46 | 24 | 744,276 |
| 15 | landscape | 0.57 | 8.33 (coop) | 17.50 | 60 | 29 | 909,416 |

## Next optimization gates, preserving visual quality

1. Collect physical-device p50/p95/p99 frame intervals with separate nonblocking Pixi and Three GPU timing, compositor traces and first-visible upload markers. Keep quality, DPR, camera, seeds and actor counts identical between baseline/candidate. Include cold launch/clamp release and full planetary entry/departure; the controlled entry/clear samples here do not time entire journeys or loading.
2. Use those traces to test shared repeated-hull instancing/material reuse and reduce redundant CPU transforms/submissions across waves and co-op. Preserve per-hull hit flashes, eclipse lighting, orientation, shadows and all triangles. Existing normal hull material consolidation and planetary blend batching are already present; this review is not new before/after evidence for those changes.
3. Profile animated boss Canvas subpasses and cached immutable artwork while retaining every time-driven limb, attack, glow and particle. Do not replace them with sparse baked animation frames.
4. Profile cosmic/atmospheric fill and overlapping transparent passes on hardware; consider exact shader algebra reuse or removal of provably redundant work. Preserve sample count, layers, resolution, draw distance and all authored detail, then compare deterministic gameplay images.
5. Run long campaign/restart/orientation sequences and mech/elite/support loadouts, asteroid/event combinations, network co-op and thermal/device tests. Those are not certified by this bounded matrix. Validate gameplay/collision independently of render visibility.
