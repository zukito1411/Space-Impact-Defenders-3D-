#!/usr/bin/env python3
"""Bake anti-noise, 2D-color-matched banking atlases from the ORIGINAL 3D frames.

Never derive a new version from the sharpened 2x v2/v3 atlases: the old
142% UnsharpMask amplified compression artifacts and artificial panel lines.
Read v1 224px source once, suppress isolated noise only lightly without
smearing cockpit and wing-edge linework, then resample with Lanczos and
match the hand-painted 2D ship's color distribution.
Alpha, seven bank poses, nozzles, muzzle positions and hitboxes are unchanged.
This is not a new high-polygon model and cannot invent missing mesh details.
"""
from pathlib import Path
from argparse import ArgumentParser
import numpy as np
from PIL import Image, ImageFilter

ROOT = Path("public/assets/ships")
CELL, COLS, ROWS = 448, 7, 2
SOURCE_CELL = 224
NAMES = dict(rocket="black-comet", fast="red-wraith", gatling="crimson-saw",
             laser="night-lance", dreadnought="obsidian-ark",
             xwing="crosswing-nova", spaceEt="space-jet",
             mesiahBlack="mesiah-black", mesiahWhite="mesiah-white",
             mesiahRaptorBlack="mesiah-raptor-black",
             mesiahRaptorWhite="mesiah-raptor-white",
             coreLander="core-lander", coreLanderBurning="core-lander-burning",
             godGundam="god-gundam", godGundamBurning="god-gundam-burning",
             spiegel="spiegel")
PORTRAIT = dict(coreLander="core-lander.png",
                coreLanderBurning="core-lander-burning.png",
                coreLanderElite="core-lander-elite.webp",
                coreLanderBurningElite="core-lander-burning-elite.webp",
                godGundam="god-gundam.png",
                godGundamBurning="god-gundam-burning.png",
                spiegel="spiegel.png",
                mesiahRaptorBlack="mesiah-raptor-black.png",
                mesiahRaptorWhite="mesiah-raptor-white.png")
SIDE = dict(mesiahBlack="mesiah", mesiahWhite="mesiah-white",
            godGundam="god-gundam-flight-v4.webp",
            godGundamBurning="god-gundam-burning-flight-v5.webp",
            spiegel="spiegel-flight-v2.webp")

def references(key):
    elite = key.endswith("Elite")
    base = key[:-5] if elite else key
    name = NAMES[base]
    side = SIDE.get(base, name) if not elite else name + "-elite"
    if not side.endswith((".png", ".webp")):
        side += "-v1.png"
    front = PORTRAIT.get(key, name + ("-elite" if elite else "") +
                         "-remaster-v1.webp")
    paths = [p for p in (ROOT/"sideview"/side, ROOT/front) if p.is_file()]
    if not paths:
        raise FileNotFoundError(f"No original 2D artwork for {key}")
    return paths

def pixels(image):
    im = image.convert("RGBA")
    hsv = np.array(im.convert("RGB").convert("HSV"), dtype=np.float32)/255.
    alpha = np.array(im.getchannel("A"))
    mask = (alpha >= 150) & (hsv[...,2] > .105) & (hsv[...,2] < .985)
    return hsv[mask][::4]

def clean_source_pose(tile):
    """Suppress ringing/noisy 1px texture edges BEFORE doubling the resolution.

    Filtering an already sharpened v2 or recolored v3 texture retains its
    ringing; this operates only on the unmodified v1 pixels.
    """
    tile = tile.convert("RGBA")
    alpha = tile.getchannel("A")
    original = tile.convert("RGB")
    # A full median pass destroys the 1px cockpit and panel features that
    # make the original 2D artwork look crisp. Blend in only a small amount
    # of its outlier suppression and preserve the original painted structure.
    denoised = original.filter(ImageFilter.MedianFilter(size=3))
    rgb = Image.blend(original, denoised, 0.18)
    rgb.putalpha(alpha)
    # RGBA resizing uses alpha-aware interpolation at transparent edges.
    return rgb.resize((CELL, CELL), Image.Resampling.LANCZOS)

def calibrate(key, image):
    refs=[]
    for path in references(key):
        with Image.open(path) as source:
            source.thumbnail((640,640),Image.Resampling.LANCZOS)
            data=pixels(source)
            if len(data)>50:
                refs.append(data[::max(1,len(data)//15000)])
    if not refs:
        raise ValueError(f"2D reference colors missing: {key}")
    reference=np.concatenate(refs)
    portrait = image.crop((3*CELL,0,4*CELL,CELL))
    landscape = image.crop((3*CELL,CELL,4*CELL,2*CELL))
    original=np.concatenate([pixels(portrait),pixels(landscape)])
    if len(original)<100:
        raise ValueError(f"3D pixels missing: {key}")
    qs=[.05,.22,.42,.60,.78,.94]
    source_levels=np.maximum.accumulate(np.quantile(original[:,2],qs) +
                                        np.arange(len(qs))*1e-6)
    target_levels=np.clip(np.quantile(reference[:,2],qs),.045,.99)
    def accent(data):
        selected=data[(data[:,1]>.17)&(data[:,2]>.12)]
        return float(np.quantile(selected[:,1],.7)) if len(selected) else .3
    gain=float(np.clip(accent(reference)/max(accent(original),.05),.85,1.9))
    colored=reference[(reference[:,1]>.22)&(reference[:,2]>.19)]
    if len(colored)>150:
        hist,_=np.histogram(colored[:,0],bins=24,range=(0,1),
                            weights=colored[:,1]*np.sqrt(colored[:,2]))
        centers=(np.arange(24)+.5)/24
        target_hues=centers[hist >= max(hist.max()*.15,hist.mean()*.65)]
    else:
        target_hues=np.array([],dtype=np.float32)
    return source_levels,target_levels,gain,target_hues

def grade(tile, settings):
    """Maximum vivid paint and strong 2D-matched contrast on clean 3D poses.

    Saturate the existing painted metal and cockpits without introducing
    sharpened halos, changing geometry, or tinting naturally neutral armor.
    """
    low, high, gain, target_hues = settings
    im = tile.convert("RGBA")
    hsv = np.array(im.convert("RGB").convert("HSV"), dtype=np.uint8)
    alpha = im.getchannel("A")

    hue = hsv[..., 0].astype(np.float32) / 255.0
    original_saturation = hsv[..., 1].astype(np.float32) / 255.0
    value = hsv[..., 2].astype(np.float32) / 255.0

    # Punchier separation of dark panels, colorful hull paint and bright
    # specular highlights, driven by the corresponding original 2D artwork.
    matched = np.interp(value, low, high)
    contrast_value = np.clip((matched - 0.5) * 1.32 + 0.5, 0.0, 1.0)
    intensity = np.maximum(value * 0.68,
                           value * 0.12 + contrast_value * 0.88)
    intensity = np.clip(intensity, 0.0, 0.998)

    # Very strong chroma only where paint already has hue. Do not create
    # false colors in near-white, near-black or neutral metallic materials.
    sat_weight = np.clip((original_saturation - 0.03) / 0.24, 0.0, 1.0)
    saturation = original_saturation * (
        1.22 + (gain - 1.0) * sat_weight * 1.35
    )
    chroma_boost = np.clip((saturation - 0.10) / 0.34, 0.0, 1.0)
    saturation *= 1.0 + chroma_boost * 0.32
    # Protect neutral areas based on the *original* source saturation,
    # not the already-boosted saturation which would shift greys toward tint.
    neutral_mask = np.clip((0.16 - original_saturation) / 0.16, 0.0, 1.0)
    saturation *= 1.0 - neutral_mask * 0.18
    saturation = np.clip(saturation, 0.0, 0.998)

    # Steer saturated accents toward their matching ship's authentic
    # hand-painted 2D hue families, while preserving banking illumination.
    if len(target_hues):
        distances = (hue[..., None] - target_hues + 0.5) % 1.0 - 0.5
        nearest = np.take_along_axis(
            distances, np.argmin(np.abs(distances), axis=-1)[..., None], -1
        )[..., 0]
        weight = np.clip((0.20 - np.abs(nearest)) / 0.13, 0.0, 1.0) * np.clip(
            (saturation - 0.08) / 0.42, 0.0, 0.55
        )
        hue = (hue - nearest * weight) % 1.0

    hsv[..., 0] = np.clip(hue * 255.0, 0, 255).astype(np.uint8)
    hsv[..., 1] = np.clip(saturation * 255.0, 0, 255).astype(np.uint8)
    hsv[..., 2] = np.clip(intensity * 255.0, 0, 255).astype(np.uint8)

    out = Image.fromarray(hsv, "HSV").convert("RGB")
    out.putalpha(alpha)
    return out

def build(key, directory):
    source=directory/(key+"-v1.webp")
    dest=directory/(key+"-v7.webp")
    with Image.open(source) as atlas:
        if atlas.size!=(COLS*SOURCE_CELL,ROWS*SOURCE_CELL):
            raise ValueError(f"{source}: invalid banking frame dimensions")
        # Calibrate on clean 3D frames, not on sharpened or repeatedly
        # tone-mapped renders from previous passes.
        top = clean_source_pose(atlas.crop((3*SOURCE_CELL,0,4*SOURCE_CELL,SOURCE_CELL)))
        side = clean_source_pose(atlas.crop((3*SOURCE_CELL,SOURCE_CELL,4*SOURCE_CELL,2*SOURCE_CELL)))
        calibration = Image.new("RGBA",(COLS*CELL,ROWS*CELL),(0,0,0,0))
        calibration.alpha_composite(top,(3*CELL,0))
        calibration.alpha_composite(side,(3*CELL,CELL))
        settings=calibrate(key,calibration)
        result=Image.new("RGBA",(COLS*CELL,ROWS*CELL),(0,0,0,0))
        for row in range(ROWS):
            for col in range(COLS):
                frame=atlas.crop((col*SOURCE_CELL,row*SOURCE_CELL,
                                  (col+1)*SOURCE_CELL,(row+1)*SOURCE_CELL))
                result.alpha_composite(grade(clean_source_pose(frame),settings),
                                       (col*CELL,row*CELL))
    result.save(dest,"WEBP",quality=96,method=5,exact=True)
    with Image.open(dest) as verify:
        assert verify.size==(COLS*CELL,ROWS*CELL), (dest, verify.size)
        assert verify.mode in ("RGBA","RGB"), (dest, verify.mode)
    print(f"{key}: {', '.join(p.name for p in references(key))}; "
          f"2D saturation match factor={settings[2]:.2f}; "
          f"output={dest.stat().st_size:,} bytes")

if __name__=="__main__":
    parser=ArgumentParser()
    parser.add_argument("--only",action="append")
    args=parser.parse_args()
    folder=ROOT/"banking"
    files=sorted(folder.glob("*-v1.webp"))
    if args.only:
        files=[p for p in files if p.name.removesuffix("-v1.webp") in args.only]
    assert files, "No original v1 banking atlases found"
    for file in files:
        build(file.name.removesuffix("-v1.webp"),folder)
    print(f"Rebuilt {len(files)} banking atlases from unsharpened v1 poses matched to original 2D ships.")
