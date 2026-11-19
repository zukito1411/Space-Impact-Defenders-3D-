# Native 3D ship source rendering (Blender 4.3)

The original banking images were rendered at 224 pixels per pose. Repeatedly upscaling and sharpening those images cannot recover lost geometry. This workflow creates genuine render passes from the **authored Blender mesh** (real cockpit, fins, surface bevels and materials) with a separate reference to the game's original 2D paint.

## Recovered source models

Two original Blender 4.3 project files were recovered from the project's previous uploads:

| Ship | Real source model | Exact SHA-256 |
|---|---|---|
| Crosswing Nova | `crosswing-nova-open-x.blend` | `a42ff60597b6f1b207a5cc4eaa42d6d3dc237bd44ea6c3a6306c31c32c23375f` |
| Space Jet | `space-jet-3d-tail-fin.blend` | `16773487a63e815c26cb1798be8f4d8703328b2b55ec323b27512dcba0eebb9e` |

**These files have not been copied into GitHub.** The repository's connected GitHub file editor cannot upload binary `.blend` bytes. Save the original files into `art/3d/models/` when adding them to the repository. Do not rename or alter them; the manual workflow validates SHA-256. The rendered game remains intact without them.

No authored Blender source was recovered for the other ships. Do not describe their existing baked atlases as high-polygon models.

## Refining shipped spacecraft artwork

The spacecraft in flight and the ship picker use baked banking renders. The current detail pass starts with those renders and uses the game's top-view sprites as reference for wing panels, vents, rocket housings and exhaust collars. The Crimson Saw and Red Wraith turret assemblies are drawn into each pose, including their Elite variants.

With Pillow, NumPy and `opencv-python-headless` installed, run `python3 scripts/refine-3d-ship-details.py` from the repository root to rebuild the version 9 atlases and version 2 picker previews. Pass individual banking keys such as `fast` or `gatlingElite` to rebuild selected ships.

## Rendering approach

1. Load the actual 3D mesh and retain the UV textures and existing shader-node connections.
2. Sample the matching remastered original 2D ship artwork; calibrate **untextured named** hull, glass and accent materials. Preserve any preexisting textured paint rather than overwriting its surface detail.
3. Render transparent **1024×1024 PNG** poses in Cycles at 64 samples with a blue nebula key, steel-blue fill and warm hangar rim.
4. Use seven actual mesh roll angles and two flight camera elevations. Assemble to the existing 7×2 sheet. Downsample once to 448-pixel cells with antialiasing, without any unsharp mask.
5. Before integration, visually approve neutral portrait/landscape and all bank frames; compare the cockpit/stripes/silhouette to the 2D reference, then remeasure muzzle, wing and exhaust geometry in `bankingAnchors.json`. A new mesh render may not match the old anchor locations.

Run locally:

```bash
blender -b -t 4 --python scripts/render_source_model_banking.py -- \
  --model art/3d/models/crosswing-nova-open-x.blend \
  --ship xwing \
  --reference public/assets/ships/crosswing-nova-remaster-v1.webp \
  --out model-preview/xwing --pixels 1024 --samples 64

python3 scripts/pack_source_model_banking.py \
  --frames model-preview/xwing --out model-preview/xwing-source-v6.webp
```

Or open **Actions → Render source Blender ship models (review only) → Run workflow** after uploading the verified `.blend` files to the repository. The workflow creates reviewable PNG renders and one `-source-v6.webp` test atlas as artifacts; it **does not** silently update game artwork, physics, main, or the signed Android APK. This prevents a new render from unexpectedly misaligning weapons/collisions.

The ship picker uses cropped neutral poses from the flight atlases. Gundam and Spiegel use the original 2D art in landscape flight.

## Constraints

Exact paint placement and 100% shape equivalence cannot be guaranteed by automatic material sampling. Final detailing requires a mesh/UV review against the original sprite. A color filter by itself cannot recreate missing 3D geometry.
