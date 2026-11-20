# Raid natural space rendering

Natural scenery and the combat layer continue to share the existing Pixi WebGL
renderer. Player and support ships keep their separate Three.js presentation.
No additional full-screen renderer or framebuffer composition pass is added.

- Planets and atmospheric moons use 72-by-36 textured sphere meshes with local
  perspective, rotating surface coordinates, smooth normals, terminator lighting,
  atmospheric limb scattering, and volcanic emission. Their original artwork
  supplies terrain detail. Painted rings retain their registered outer silhouette.
- Galaxies integrate eight samples through an inclined stellar disc. The original
  galaxy textures supply arms, nucleus, and dust detail. Nebula volumes and the
  existing perspective-projected star catalogue retain the shared orbital camera.
- Background and event asteroids use four shared, smoothly displaced rock meshes
  with crater artwork, surface normals, and independent three-axis rotation.
  Event rocks have eighteen reusable presentation slots with stable ownership by
  entity ID. Unexpected overflow remains visible through the existing Canvas path.
- Broken stations, wrecks, derelicts, fleet decorations, and their authored artwork
  retain their existing 2D rendering. A scenery slot temporarily showing a wreck
  is excluded from asteroid mesh substitution.

Geometry is generated once and reference counted. All five shared body geometries
and the actual surface shader are warmed into an 8-by-8 render texture during
loading. Flight updates change transforms and uniforms without geometry rebuilds,
pixel reads, new surface textures, or per-body temporary pose arrays. The existing
quality profiles and uncapped requestAnimationFrame scheduling are preserved.
Mesh animation uses the existing pause-aware celestial clock and reduced-motion
setting. A body warmup exception retains the painted planet/rock paths.

Asteroid presentation reads existing entities and never changes collision radii,
damage, splitting, or combat admission timing. Canvas asteroid drawing is skipped
only for IDs included in a successful GPU presentation. Warning-stage plans are
also sent as optional cosmetic multiplayer fields; the planned IDs enter the
existing collision arrays only when the original spawn delay expires.

Validation for this change is TypeScript only. No game launch, Playwright,
shader execution, screenshot comparison, device profiling, or FPS measurement
has been performed. Existing disc paintings are projected surface references,
not newly authored full-planet longitude maps.

## World distances and projection

`spaceWorld.ts` owns the camera and scenery placements in kilometres. Positions,
physical spans, and radii are independent of viewport pixels. Initial composition
is unprojected once into a persistent XYZ position; resizing changes the camera
projection without recreating the placement. Nearby rocks, dust, and painted
station wrecks occupy reusable local slots. Their size grows with proximity, and
they recycle after passing the camera or leaving its nearby viewing volume.
Station and wreck geometry remains 2D.

The authored distance bands describe this fictional setting:

| Layer | Distance or size convention |
| --- | --- |
| Near clipping | 0.08 km |
| Local scenery | Initial distances of roughly 8–34 km |
| Planet bodies | Fixed radii of 4,600–58,000 km; distance determines apparent size |
| Stellar catalogue | Coordinates in units of 1 trillion km |
| Nebula layers | 400 trillion km reference distance |
| Galaxies | 200 quadrillion km reference distance |

The stellar catalogue stays fixed in space. Only nearby dust wraps through local
cells. This prevents distant stars from behaving like fast particles passing the
cockpit. Distant bright-star art uses the same camera, while its optical flare
and twinkle retain their existing detail.

Campaign approaches retain their compressed cinematic timing. Each sampled
approach specifies a kilometre distance to a fixed-radius planet; the sphere's
perspective and visible hemisphere use the actual radius/distance ratio and
off-axis camera direction. Natural scenery ordering uses world depth. Scripted
fleet actors retain their authored flight paths at their assigned depth.

CPU world coordinates use double precision. GPU inputs are camera-relative
pixels or layer-scaled coordinates, keeping enormous stellar coordinates out of
near-field mesh buffers. Offscreen scenery is culled conservatively. No new
renderer, fullscreen pass, texture generation, physical simulation, render cap,
or quality reduction is introduced by the distance model. Combat rock ownership
uses reusable sets and linear scans, and avoids hiding/re-showing every live mesh
each frame. Geometry, textures, and object pools retain their existing bounds.

TypeScript validation does not establish device FPS or frame pacing.


## Distant admission and live passerby hulls

Local scenery keeps a stable world depth and physical size while the camera
travels along logical negative Y. Portrait flight therefore moves upward and
scenery passes downward; the existing landscape transform turns this into
rightward flight with leftward scenery. Rocks no longer converge from the middle
of the screen or expand along Z during ordinary cruise. Initial compositions
retain their authored scale. Recycling admits the complete object beyond the
leading edge, with conservative padding; artwork changes keep that recycled world
position. Nearby dust wraps beyond the viewport at its own depth and trails along
the travel axis. Distant stellar positions remain fixed. Campaign planet descent
and ascent retain their intentional scripted distance changes.

Gameplay asteroid clusters are planned during their existing warning delay.
Their non-collidable preview starts at one ninth of its entry-plane size and
approaches the exact future entry position. The same IDs and presentation slots
continue at normal spawn time. HP is refreshed from current player power at
combat admission. Guests receive optional incoming-plan and remaining-delay
fields. Collision, damage, and splitting continue to consume only the admitted
combat array. A failed GPU path retains the original warning UI and Canvas hazards.

`sceneryHulls.ts` draws friendly capital flybys and allied battle ships using the
same authored GLBs and paint as the main ship renderer. Geometry and paint are
loaded once per hull key, shared across scenery instances, and warmed during
loading. The existing Pixi context supplies perspective projection and depth
testing in its normal scenery submission; no per-frame canvas copies, readbacks,
extra WebGL context, or extra full-screen pass are needed. Owned textures and
buffers are disposed with the scenery, and source hulls remain pinned while in
use. Broken stations and derelicts retain their 2D paths. The six hostile fighter
variants use the live textured hull path described below; other alien artwork
keeps its original presentation.

Picker preview orientation now requires both landscape Raid mode and a landscape
screen. A saved landscape preference cannot force side artwork onto a portrait
picker. The source portrait/landscape preview images were inspected directly.

These fixes were checked with TypeScript only; gameplay visuals and frame pacing
still require runtime verification.


## Cosmos lighting and volume refinement

Natural bodies and friendly GLB scenery now share one smoothed, camera-space sun
direction. A visible authored sun supplies its projected direction; scenes without
one retain a consistent upper-left key light. Paused time freezes smoothing.
Planet surface paint and normals now interpolate with the same perspective as
its close-range geometry. Non-ringed planets rotate continuously around a fixed
axis; ringed paintings keep their registered orientation.

Temperate worlds reuse the existing `clouds.png` artwork for a separately moving
weather field, offset ground shadows, and subdued ocean reflections. Coverage is
set per planet style; rock and volcanic surfaces do not receive white weather.
Each visible planet has one small analytic atmosphere quad: ray/sphere chord
length supplies optical density, day/night lighting, and a thin 1.8-percent shell
beyond the terrain silhouette, including close and off-axis views. This uses no
blur, additional sphere mesh, framebuffer composition, or new art download.

Galaxies use front-to-back absorption through the existing eight texture samples,
so dark dust lanes attenuate the luminous disc. Nebula veils absorb distant light
before scattering their own color, retaining authored open pockets. The fixed
1,650-star catalogue includes a broad inclined stellar band and a wider range of
stellar colors; dust and star counts and quality profiles remain unchanged.

Planet and rock programs are compiled separately, eliminating weather sampling
from the rock program. Loading warmup covers both body variants, the atmosphere,
both gas programs, and the actual stellar catalogue. Frame updates reuse geometry,
textures, and typed uniforms. These measures bound work but are not measured FPS
or stutter guarantees. Validation remains TypeScript only; shaders and resulting
appearance have not been executed or visually verified.


## Ship lighting and painted metal

`shipLighting.ts` supplies a shared linear-RGB presentation frame from the actual
orbital sun direction, current cosmos region, and planetary descent/ascent blend.
Both the main Three ship layer and the friendly Pixi GLB scenery consume it. A
warm sun remains the main key, with weak blue, amber, teal, or violet regional
fill. Pelagic flight adds cool atmospheric/ocean bounce; Cinder adds warm ground
bounce. Stage 5 and 10 keep their existing planetary rendering and stage rules.
The carrier's existing backdrop coverage drives a separate ceiling-and-deck
lighting blend while docking, launching, and recovering.

Live ships use neutral highlight tone mapping, painted-metal roughness of
0.46–0.64 and metalness of 0.14–0.32. Broad rough highlights and muted reflected
color leave the livery readable rather than producing a chrome finish. Whole-paint
emission is disabled for ordinary ships; exhaust, weapon, and other Canvas effects
are still rendered by their original systems. Eclipse coverage attenuates direct
diffuse/specular lighting per hull instead of overwriting the material's original
paint color. Existing source texture resolution and hull geometry are preserved;
up to 8x supported anisotropic filtering is configured once for angled paint.

`shipReflections.ts` prepares seven 128-by-64 linear HDR lighting panoramas and
32px-face prefiltered probes during loading (four space regions, two planetary
atmospheres, one dock). Only the active probe is sampled during flight. These are
bounded lighting approximations, not live scene captures or screen-space mirrors.
They add no flight-time reflection capture passes, shadow maps, or model rebuilds.
Lighting parameters reuse typed arrays and smooth using the pause-aware celestial
clock. All probes use the same layout, so selecting a region does not require a
new reflection shader variant. Probe selection switches at the midpoint of the
planetary/dock blend; light colors and intensities interpolate separately.

Material preparation is shared between warmup and live instances, including the
mech pose and eclipse shader hooks. A bounded 12-entry warm-material cache retains
compiled program references; live nodes cache their material bindings instead of
traversing the ship scene graph for every lighting update. Probe buffers and warm
materials are disposed with the renderer, and probes are regenerated after context
restoration. Direct lighting remains available if optional probe generation fails.

Verification is TypeScript only. No game launch, Playwright, image capture, shader
execution, or FPS profiling was performed. The lighting changes do not establish
that the earlier ship-art softness report is visually resolved.


## Fighter hulls, edge passes, and duplicate glow

The six `RAID_FIGHTER_ASSETS` keep their original full-resolution paintings and
alpha silhouettes. During loading, the existing volume worker builds closed,
indexed hull surfaces with depth, a raised canopy/spine, thinner wings, and smooth
shared-vertex normals. These are image-derived 3D surfaces, not new hand-authored
GLBs or generated side-elevation artwork. No unrelated player ship is substituted.
Only the fighter profile changes; the existing mech geometry path is preserved.

All six sources, paint textures, and material programs prepare before launch. Each
variant has eight reusable scene nodes (48 total); additional nodes can handle an
unusual overflow and return to the same bounded pool. Offscreen/dead fighter nodes
return immediately rather than lingering for 120 render frames. Mesh geometry and
paint stay shared across instances. GPU foreground and Canvas fallback callers
submit the same enemy IDs to the existing ship renderer, using pixel-space velocity
for heading and the current landscape side camera. Hits and charging effects keep
their authoritative timers and their correct local nose positions. Collisions,
spawn rules, damage, projectiles, and network simulation are unchanged.

The intact large ship in the reusable edge-pass slot now uses the existing
Dreadnought/Messiah capital GLBs and the landscape side camera. That slot's dynamic
model key is cleared when it holds an asteroid. Billboard restoration runs before
other scenery adapters so a hull/rock change cannot accidentally display both the
painted card and a 3D mesh. Broken fleet wrecks and stations remain painted scenery.

The old full-silhouette solar-rim and passive environment-glow overlays are skipped
when a live player hull is actually submitted. Reflected light is provided by the
3D material instead of a second painted silhouette. Ordinary hull-paint emission
is zero; gameplay shields, engines, invulnerability and special Gundam auras retain
their separate feedback. Validation remains TypeScript only; no runtime appearance
or FPS result has been established.

### Capital passing view and carrier attachment alignment

Landscape scenery hulls now use a 78-degree side camera rather than the player's
56-degree combat camera. The scripted capital pass keeps a nose-forward heading;
its old extra half-turn is removed. These passes use the existing capital GLBs,
with the original paint and meshes retained. This changes their
presentation, not the separate painted broken-station scenery.

`hullDocking.ts` samples roof, keel and inner-fuselage contacts from the loaded
ship mesh once during asset admission. Contacts and the cockpit remain cached
with that hull asset. Carrier frames project these few points using the same
registration, 35-degree perspective, yaw and landscape quarter-turn as the live
ship. There are no per-frame raycasts or mesh rebuilds. Unavailable contacts keep
the existing atlas fallback rather than manufacturing a contact in empty space.

The detailed clamp atlas is retained. Smaller jaws meet these projected contacts;
the arms remain behind the hull and the jaws draw in the existing foreground
canvas. Jaws withdraw before the rigid links fold toward the deck rails. Foreground
jaws follow the carrier's translation and opacity, including recovery, and bases
remain at their final docking stations while the returning ship approaches.
Boarding uses the projected cockpit for the ladder/pilot and projects the original
canopy cutout around its hinge. Dock presentation suppresses flight banking so
contact sampling and the rendered hull stay in the same pose. This is layered
atlas hardware attached to a 3D hull, not a newly authored 3D clamp model.

Validation: TypeScript passed. No game launch, browser automation, visual capture,
or runtime/FPS measurement was performed.

### Ordinary player ships use models; Gundams remain 2D

Friendly final-battle fighters/cruisers, the edge pass and scripted capital flyby
use GLB meshes in Pixi's existing scenery context. Their sprites are placement
anchors with no painted body texture. Ordinary player ships, escorts, Messiah
drones/scouts and the recovery carrier submit to the existing Three renderer.
Model registration offsets rotate with their hulls. Bounded pools and the warm
material cache reuse prepared models without rebuilding their geometry.

God Gundam, Burning God Gundam and Spiegel keep their original 2D artwork in
portrait and landscape. This includes menu previews, flight, launch/docking,
normal firing, dash, barrage, passive strikes, resonance copies, afterimages,
trails, auras and sprite-based protection masks. The original bitmap assets are
restored under `public/assets/ships` and `public/assets/G-gundam-attacks`.
`mechArtwork.ts` identifies this exception. Both the live renderer bridge and the
Three renderer reject mech submissions; the hull loader never reconstructs a
3D mech. Mech pose sheets are decoded during normal asset preparation and their
protection masks are cached when the mech is selected.

Ordinary ship portrait/side/banking source art stays under `art/source-ships`.
Ordinary menu thumbnails use model renders without starting WebGL. Broken
stations and derelict artwork retain their existing 2D scenery paths. Model
binaries and metadata have a separate persistent cache; the image cache includes
all restored mech bodies and action sheets.

Only application and Vite TypeScript checks were run for this correction.
Gameplay appearance, device behavior and frame rate remain unverified. Affected
regression scripts were updated to preserve the mech exception, but not executed.

### Hostile hull coverage

`enemyHulls.ts` registers all 14 regular enemies, all five elite artwork variants,
and the 12 campaign command-boss designs. Endless/Super and Boss Rush select
these same registered identities through `getGenericBossArt`. Squid (stage 5),
Snake (stage 10), Final (stage 15), and Devil/Evil Gundam continue through their
existing animated 2D renderers, including Final's mirage poses. Player God Gundam,
Burning God Gundam and Spiegel retain their explicit 2D-only admission guard.

Enemy bodies now use indexed, closed Three meshes reconstructed from the
approved alpha silhouettes with their native-resolution paint. Organic enemies
have rounded carapaces and thin appendages. Command hulls have deeper armor decks,
a raised bridge and restrained painted-panel relief. This uses the existing
worker and renderer, with no extra WebGL context or substitute player geometry.
The six previously converted fighters retain their existing geometry profile.

Both the Pixi-foreground and Canvas-foreground paths submit the same enemy hull
keys. Standard boss and elite motion, hit flashes, defeat fading, bars, warnings,
projectiles and damage overlays retain their combat clocks. Body headings follow
logical flight coordinates; the landscape playfield provides the camera rotation.
No sprite body or polygon placeholder is substituted for a missing hostile mesh.

All 31 hostile designs are extracted, uploaded and shader-prepared before play,
with two admissions at a time. Instances share geometry and paint; bounded pools
reuse their object/material state. The warm-material cache retains the hostile
catalog and up to 17 other hull entries (48 total), and source-asset trimming
starts above 40 entries while retaining referenced meshes. No distance-field
shield meshes are prepared for enemies. The old per-enemy Canvas raster caches
and normal-enemy texture bakes have been removed from active rendering.

Validation remains TypeScript-only. No game, Playwright, regression script,
device capture or FPS profiling was run. Visual alignment and measured performance
still need runtime verification.

### Raid launch regression: optional Pixi upload system

A Playwright run reproduced Start Raid returning to ship selection. Scenery
preparation called `renderer.prepare.upload` before Pixi's optional prepare
system had been registered, causing initialization to fail. `background.ts` now
imports `pixi.js/prepare` before creating the renderer, covering both scenery and
foreground texture uploads. Startup errors retain the underlying error message
and render above the ship-selection overlay, rather than inside the playfield.
After registration, Playwright traversed ship selection, the mission briefing,
hangar launch and active landscape combat. Both renderer flags were ready and
the score advanced from zero to 109. Application and Vite TypeScript checks
passed. Browser verification used local Chromium/SwiftShader; this does not
establish native GPU or mobile FPS.

### Hangar rendering, clamp caching and shared landscape view

The hangar retains its full animated space rendering through the original door
mask. No background occlusion rectangle or reduced scenery draw is applied.
The original artwork, native paint, geometry detail and draw distances remain.

Settled clamps cache into tight bitmaps in destination device-pixel coordinates,
including the exact rotation, scale and fractional translation used to draw the
atlas. Replaying those pixels avoids a second resampling pass. One cached pose
per destination context is bounded to four megapixels; larger poses use the
original draws instead of reducing quality. Fractional motion, translucent
compositing and filters also use the original atlas path. Release animation
continues on every presented frame. Stable dock mounts and sampled poses are
reused; changing projected hull contacts invalidates them. A docked 3D ship's
back/front clamp submissions fall from 12+4 atlas draws to 1+1 bitmap copies.

The first actual deck, clamp atlas, cockpit and enlarged hull frame renders while
the menu transition is closed. Shader compilation alone did not upload hull
vertex/index buffers. Ship preparation now renders actual pooled instances into
one reusable 8x8 target, then compiles their screen output/tone-mapping variants
before admitting them. Failed/cancelled admissions release materials and hull
references; the target is disposed with the renderer. Empty Three layers clear
a departing hull once and skip submissions until another 3D hull appears.
Unchanged launch CSS properties and stage/DPR attributes avoid repeated writes.
Rendering remains uncapped and follows requestAnimationFrame.

Landscape previously used separate yaw angles for players (56 degrees), some
enemies (28) and flybys (78). raidView.ts now defines one 56-degree oblique view
and 35-degree perspective. Heading rotates in the world flight plane before the
camera view basis is applied; banking remains a local ship pose. Three and Pixi
hulls use the same order, and orbital scenery uses the same landscape focal
length. Cockpit/clamp projections and nozzle samples match the new basis.
Portrait retains its original projection and transform behavior. All Gundams
remain on their 2D render/animation/attack paths.

Checks: application/Vite TypeScript; carrier boarding/clearance at 30/60/120 Hz;
rigid clamp links and stowed jaws; 48 independent Three/cockpit/contact projection
comparisons plus opposite-heading flight-plane invariants. An isolated Chromium
Canvas test at 844x390 compared cached versus live atlas draws: 16 submissions
became one for the combined rig, with average RGBA-channel error about 0.000033
(on the 0-255 scale) and no pixel exceeding total RGBA error 8. Both paths held
the test browser's 60 Hz cadence; that does not establish the clamps as the sole
source of whole-game stalls. Native device GPU/FPS and thermal behavior still
require device profiling; universal 120 FPS or zero stutter is not established.

Final Playwright verification traversed selection, briefing, boarding, ignition,
departure and live combat in portrait and landscape without page exceptions.
The landscape run checked 527 visible-hull frames against the shared camera
basis with no mismatches. Hangar and flight captures were inspected; stars
remain visible through the landscape door. Additional clamp pixel comparisons
covered separate back/front layers, the rotated landscape foreground context,
and fractional portrait transforms (worst full-frame channel MAE below 0.009).
Both TypeScript projects and the view/deck/clamp-rig scripts passed.
