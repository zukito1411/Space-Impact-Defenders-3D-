import assert from 'node:assert/strict'
import { access, readFile, writeFile } from 'node:fs/promises'

const directory='presentation-review/campaign-v1'
const evidence=JSON.parse(await readFile(directory+'/loads-v1.json','utf8'))
const bosses=JSON.parse(await readFile(directory+'/bosses-v1.json','utf8'))
assert.deepEqual(evidence.errors,[])
assert.equal(bosses.length,16)
assert.equal(new Set(bosses.map(boss=>boss.stage)).size,16)
for(const boss of bosses)await access(directory+'/'+boss.file)
const {results}=evidence
const partial=process.argv.includes('--allow-partial')
const missing=[]
for(const view of ['landscape','portrait'])for(let stage=1;stage<=15;stage++) {
  for(const scenario of ['waves','boss','burst','entry','transition',...([1,5,10,15].includes(stage)?['coop']:[])]) {
    const matches=results.filter(row=>row.view===view&&row.stage===stage&&row.scenario===scenario).length
    assert.ok(matches<=1,`Repeated case: ${view}/${stage}/${scenario}`)
    if(!matches)missing.push(`${view}/${stage}/${scenario}`)
  }
}
if(!partial)assert.equal(results.length,158,`Missing ${missing.length} cases; use --allow-partial to report incomplete coverage`)
const maximum=(rows,key,stat='max')=>Math.max(...rows.map(row=>row[key]?.[stat]??0))
const median=values=>{
  const sorted=[...values].sort((a,b)=>a-b),middle=Math.floor(sorted.length/2)
  return sorted.length%2?sorted[middle]:(sorted[middle-1]+sorted[middle])/2
}
const decimal=value=>value.toFixed(2)
const count=value=>Math.round(value).toLocaleString('en-US')
const views=['landscape','portrait']
const table=[]
for(let stage=1;stage<=15;stage++)for(const view of views) {
  const rows=results.filter(row=>row.stage===stage&&row.view===view)
  if(!rows.length)continue
  const highest=[...rows].sort((a,b)=>b.drawMs.mean-a.drawMs.mean)[0]
  table.push(`| ${stage} | ${view} | ${decimal(maximum(rows,'simulationMs','mean'))} | ${decimal(highest.drawMs.mean)} (${highest.scenario}) | ${decimal(maximum(rows,'drawMs','p95'))} | ${count(maximum(rows,'pixiCalls'))} | ${count(maximum(rows,'shipCalls'))} | ${count(maximum(rows,'shipTriangles'))} |`)
}
const scenarioTable=[]
for(const scenario of ['waves','boss','burst','entry','transition','coop'])for(const view of views) {
  const rows=results.filter(row=>row.view===view&&row.scenario===scenario)
  if(!rows.length)continue
  scenarioTable.push(`| ${scenario} | ${view} | ${rows.length} | ${decimal(median(rows.map(row=>row.simulationMs.mean)))} | ${decimal(median(rows.map(row=>row.drawMs.mean)))} | ${decimal(median(rows.map(row=>row.canvasMs.mean)))} | ${count(maximum(rows,'pixiCalls'))} | ${count(maximum(rows,'shipCalls'))} |`)
}
const special=[]
for(const stage of [5,10,15])for(const view of views) {
  const row=results.find(row=>row.stage===stage&&row.view===view&&row.scenario==='boss')
  if(!row)continue
  special.push(`| ${stage} | ${view} | ${decimal(row.drawMs.mean)} | ${decimal(row.bossMs.mean)} | ${decimal(row.pixiSubmitMs.mean)} | ${decimal(row.shipSubmitMs.mean)} |`)
}
const samples=[...new Set(results.map(row=>row.samples))].sort((a,b)=>a-b)
const spikes=[...results].sort((a,b)=>b.drawMs.max-a.drawMs.max).slice(0,5).map(row=>
  `| ${row.stage} | ${row.view} | ${row.scenario} | ${decimal(row.drawMs.mean)} | ${decimal(row.drawMs.p95)} | ${decimal(row.drawMs.max)} | ${decimal(row.pixiSubmitMs.max)} |`)
const content=`# Raid campaign rendering review v1

## Evidence and scope

- **Coverage: ${results.length}/158 planned workload cases; ${missing.length ? 'sampling stopped early at the user\'s request. All 15 landscape stages were covered; portrait coverage is partial.' : 'all planned campaign cases completed.'}** Missing cases: ${missing.length?missing.join(', '):'none'}.
- Max quality, DPR 1: ${results.reduce((sum,row)=>sum+row.samples,0)} measured frames. Each completed case has eight warm-up frames and ${samples.join(' or ')} measured frames; sample counts are retained per case. These are short diagnostic samples, unsuitable for sustained FPS or rare-stutter certification. A TypeScript check ran concurrently with part of the landscape sampling, so these CPU values are not an isolated benchmark.
- Native stage formations, native boss updates/attacks, combined weapon/option effects, 16 combat asteroids, impact bursts, stage entry/clear states, and local co-op at stages 1/5/10/15. The burst setup combines native workloads deliberately; it is not a natural-play frequency estimate.
- **16 actual landscape gameplay images**, including Devil Gundam: [gallery](../${directory}/bosses-v1.md). Normal game cameras, body scale, HUD and stage artwork are retained. Boss placement/HP/timers are controlled for inspection. Special bodies 5/10/15/Devil were not redesigned.
- Browser: ${evidence.environment}. Viewports: landscape 844×390, portrait 393×852. No captured page errors or shader/WebGL frame errors. External service calls are blocked in this isolated fixture.
- Source review includes the frame scheduler, simulation/collision, Canvas overlay, Pixi scenery/foreground, Three ship presentation, preloading/pools, planetary atmosphere, cosmic shaders, carrier deck/clamps, and cleanup. This turn adds diagnostic tooling and review instructions; it does not change production graphics, gameplay or frame-rate settings.

Raw evidence: [loads-v1.json](../${directory}/loads-v1.json). Re-run with [the workflow](raid-render-review-workflow.md). The diagnostic resumes interrupted runs; it does not claim a baseline/candidate optimization comparison.

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
${scenarioTable.join('\n')}

## Preserved animated bosses

| Stage | View | Draw CPU mean ms | Boss Canvas CPU mean ms | Pixi submission CPU mean ms | Three submission CPU mean ms |
|---|---|---:|---:|---:|---:|
${special.join('\n')}

## Largest observed CPU draw outliers

These are observations, not established causes or device FPS. A single software-driver or host stall can dominate a short case's mean. The last column is the maximum Pixi submission CPU cost in the same case, not necessarily the same frame; raw summaries cannot reconstruct the full critical path. Reproduce with a hardware trace before assigning the stall to a particular asset, shader, allocation or stage mechanic.

| Stage | View | Case | Draw CPU mean ms | Draw CPU p95 ms | Draw CPU max ms | Pixi submission CPU max ms |
|---|---|---|---:|---:|---:|---:|
${spikes.join('\n')}

## All-stage submitted work and CPU envelope

Each row summarizes all sampled scenarios for that stage/view. Independent maxima in a row can come from different frames/scenarios; they must not be added together. The p95 column is the highest individual-case p95, not a pooled stage percentile.

| Stage | View | Highest mean update CPU ms | Highest mean draw CPU ms (case) | Highest case draw CPU p95 ms | Max Pixi draws | Max Three draws | Max Three triangles |
|---|---|---:|---|---:|---:|---:|---:|
${table.join('\n')}

## Next optimization gates, preserving visual quality

1. Collect physical-device p50/p95/p99 frame intervals with separate nonblocking Pixi and Three GPU timing, compositor traces and first-visible upload markers. Keep quality, DPR, camera, seeds and actor counts identical between baseline/candidate. Include cold launch/clamp release and full planetary entry/departure; the controlled entry/clear samples here do not time entire journeys or loading.
2. Use those traces to test shared repeated-hull instancing/material reuse and reduce redundant CPU transforms/submissions across waves and co-op. Preserve per-hull hit flashes, eclipse lighting, orientation, shadows and all triangles. Existing normal hull material consolidation and planetary blend batching are already present; this review is not new before/after evidence for those changes.
3. Profile animated boss Canvas subpasses and cached immutable artwork while retaining every time-driven limb, attack, glow and particle. Do not replace them with sparse baked animation frames.
4. Profile cosmic/atmospheric fill and overlapping transparent passes on hardware; consider exact shader algebra reuse or removal of provably redundant work. Preserve sample count, layers, resolution, draw distance and all authored detail, then compare deterministic gameplay images.
5. Run long campaign/restart/orientation sequences and mech/elite/support loadouts, asteroid/event combinations, network co-op and thermal/device tests. Those are not certified by this bounded matrix. Validate gameplay/collision independently of render visibility.
`
await writeFile('docs/raid-campaign-render-audit-v1.md',content)
console.log(`Wrote whole-campaign audit: ${results.length} cases; ${bosses.length} landscape boss captures`)
