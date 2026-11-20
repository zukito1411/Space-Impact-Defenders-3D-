#!/usr/bin/env python3
"""Bake tightly framed HD selector views from the actual 3D banking art.

Selector previews are NOT the original 2D sprites or downscaled full atlases.
For each ship, crop the level-flight banking pose from the current palette-
matched 3D atlas, remove transparent padding, and store independent portrait
and right-facing landscape WebP images. The 3D banking gameplay is untouched.

A small additional color cleanup is applied only to Mesiah's original v7
banking atlas, producing a separate v8 asset for hangar, combat and selection.
It reduces brown/grimy midtone contamination without painting over genuine
gold accents, blue lights, 3D edges or existing high-frequency detail.
"""
from __future__ import annotations

from pathlib import Path
import math
import numpy as np
from PIL import Image

BANKING = Path("art/source-ships/banking")
PREVIEWS = Path("public/assets/ships/previews")
SOURCE_CELL = 448
COLUMNS = 7
ROWS = 2
PREVIEW_CELL = 640
MESIAH = ("mesiahBlack", "mesiahWhite")


def clean_mesiah_atlas(key: str) -> None:
    original = BANKING / f"{key}-v7.webp"
    target = BANKING / f"{key}-v8.webp"
    with Image.open(original) as source:
        rgba = source.convert("RGBA")
        if rgba.size != (COLUMNS * SOURCE_CELL, ROWS * SOURCE_CELL):
            raise ValueError(f"Unexpected atlas size: {original}: {rgba.size}")
        alpha = rgba.getchannel("A")
        hsv = np.asarray(rgba.convert("RGB").convert("HSV"), dtype=np.float32).copy()
        hue, saturation, value = (hsv[..., index] / 255.0 for index in range(3))

        # Warm, low/mid-saturation dirt on steel becomes more neutral; actual
        # bright gold trim and bright amber engine reflections are preserved.
        warm = np.clip((hue - .025) / .035, 0.0, 1.0) * \
               np.clip((.165 - hue) / .045, 0.0, 1.0)
        mid = np.clip((value - .08) / .15, 0.0, 1.0) * \
              np.clip((.70 - value) / .22, 0.0, 1.0)
        dirt = warm * mid * np.clip((.70 - saturation) / .25, 0.0, 1.0)
        saturation = np.maximum(0.0, saturation * (1.0 - .45 * dirt) - .04 * dirt)

        # Lift naturally neutral armor midtones so dark Mesiah reads as clean
        # polished spacecraft plating instead of near-black, muddy texture.
        metal = np.clip((.38 - saturation) / .24, 0.0, 1.0) * \
                np.clip((value - .11) / .20, 0.0, 1.0) * \
                np.clip((.76 - value) / .22, 0.0, 1.0)
        value = np.clip(value + .050 * metal + .035 * dirt, 0.0, .998)

        # Protect and slightly energize authentic blue/cyan illumination.
        cool = np.clip((hue - .43) / .08, 0.0, 1.0) * \
               np.clip((.74 - hue) / .10, 0.0, 1.0) * \
               np.clip((saturation - .25) / .20, 0.0, 1.0)
        saturation = np.clip(saturation * (1.0 + .10 * cool), 0.0, .998)
        value = np.clip(value + .025 * cool, 0.0, .998)

        hsv[..., 1] = saturation * 255.0
        hsv[..., 2] = value * 255.0
        image = Image.fromarray(hsv.astype(np.uint8), mode="HSV").convert("RGB")
        image.putalpha(alpha)
        image.save(target, "WEBP", quality=97, method=5, exact=True)

    print(f"Cleaned Mesiah hull: {original.name} -> {target.name}")


def get_trimmed_view(atlas: Image.Image, landscape: bool) -> Image.Image:
    row = 1 if landscape else 0
    frame = atlas.crop((
        3 * SOURCE_CELL, row * SOURCE_CELL,
        4 * SOURCE_CELL, (row + 1) * SOURCE_CELL,
    )).convert("RGBA")
    if landscape:
        # Portrait banking sprites are nose-up; the landscape flight camera
        # turns them clockwise. Render right-facing previews here once.
        frame = frame.transpose(Image.Transpose.ROTATE_270)

    alpha = frame.getchannel("A")
    silhouette = alpha.point(lambda a: 255 if a >= 48 else 0)
    bounds = silhouette.getbbox()
    if bounds is None:
        raise ValueError("No opaque 3D ship pixels in the selected banking frame")

    width, height = bounds[2] - bounds[0], bounds[3] - bounds[1]
    # 11% breathing room around actual geometry, rather than displaying all
    # 448 px of mostly-transparent banking-cell padding.
    side = max(1, math.ceil(max(width, height) * 1.16))
    center_x = (bounds[0] + bounds[2]) / 2
    center_y = (bounds[1] + bounds[3]) / 2
    left = round(center_x - side / 2)
    top = round(center_y - side / 2)
    cropped = frame.crop((left, top, left + side, top + side))
    return cropped.resize(
        (PREVIEW_CELL, PREVIEW_CELL), Image.Resampling.LANCZOS
    )


def build_previews() -> None:
    PREVIEWS.mkdir(parents=True, exist_ok=True)
    originals = sorted(BANKING.glob("*-v7.webp"))
    if len(originals) != 27:
        raise ValueError(f"Expected 27 banked 3D ships; found {len(originals)}")

    count = 0
    for original in originals:
        key = original.name.removesuffix("-v7.webp")
        path = BANKING / f"{key}-v8.webp" if key in MESIAH else original
        with Image.open(path) as atlas:
            if atlas.size != (COLUMNS * SOURCE_CELL, ROWS * SOURCE_CELL):
                raise ValueError(f"Invalid 3D atlas: {path}: {atlas.size}")
            for landscape, suffix in ((False, "portrait"), (True, "landscape")):
                image = get_trimmed_view(atlas, landscape)
                target = PREVIEWS / f"{key}-{suffix}-v1.webp"
                # WebP preserves transparent shape and source material color
                # while staying much smaller than shipping 27 full atlases.
                image.save(target, "WEBP", quality=98, method=5, exact=True)
                count += 1
    print(f"Generated {count} HD, tight-cropped 3D ship-selection previews")


def main() -> None:
    BANKING.mkdir(parents=True, exist_ok=True)
    for key in MESIAH:
        clean_mesiah_atlas(key)
    build_previews()


if __name__ == "__main__":
    main()
