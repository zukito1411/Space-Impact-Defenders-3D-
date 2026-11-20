#!/usr/bin/env python3
"""Enhance source banking renders into 2x, richer-detail WebP atlases.

Frame order, geometry, transparent silhouettes and the registered nozzles
remain unchanged. This improves existing raster detail; it does not invent
new 3D mesh detail.
"""
from __future__ import annotations

from argparse import ArgumentParser
from pathlib import Path
from PIL import Image, ImageEnhance, ImageFilter

SOURCE_CELL = 224
OUTPUT_CELL = 448
COLUMNS = 7
ROWS = 2


def enhance_pose(tile: Image.Image) -> Image.Image:
    if tile.mode != "RGBA":
        tile = tile.convert("RGBA")
    # RGBA/Lanczos uses premultiplied alpha for clean ship silhouettes.
    enlarged = tile.resize((OUTPUT_CELL, OUTPUT_CELL), Image.Resampling.LANCZOS)
    alpha = enlarged.getchannel("A")
    rgb = enlarged.convert("RGB")
    # Restore the metallic paint, separation between panels and lit accents.
    rgb = ImageEnhance.Color(rgb).enhance(1.28)
    rgb = ImageEnhance.Contrast(rgb).enhance(1.105)
    rgb = ImageEnhance.Brightness(rgb).enhance(1.035)
    rgb = rgb.filter(ImageFilter.UnsharpMask(radius=1.05, percent=142, threshold=3))
    rgb.putalpha(alpha)
    return rgb


def enhance_atlas(source: Path, target: Path) -> None:
    with Image.open(source) as original:
        expected = (SOURCE_CELL * COLUMNS, SOURCE_CELL * ROWS)
        if original.size != expected:
            raise ValueError(f"{source}: expected {expected}, got {original.size}")
        original.load()
        atlas = Image.new(
            "RGBA", (OUTPUT_CELL * COLUMNS, OUTPUT_CELL * ROWS), (0, 0, 0, 0)
        )
        for row in range(ROWS):
            for col in range(COLUMNS):
                tile = original.crop((
                    col * SOURCE_CELL, row * SOURCE_CELL,
                    (col + 1) * SOURCE_CELL, (row + 1) * SOURCE_CELL,
                ))
                atlas.alpha_composite(
                    enhance_pose(tile), (col * OUTPUT_CELL, row * OUTPUT_CELL)
                )
    atlas.save(target, "WEBP", quality=96, method=5, exact=True)
    with Image.open(target) as verify:
        if verify.size != atlas.size or verify.mode != "RGBA":
            raise ValueError(f"Generated atlas is invalid: {target}")
    print(f"{source.name} -> {target.name}: {target.stat().st_size:,} bytes")


def main() -> None:
    parser = ArgumentParser()
    parser.add_argument(
        "--folder", type=Path, default=Path("art/source-ships/banking")
    )
    parser.add_argument("--only", action="append", help="Ship key to process")
    options = parser.parse_args()
    files = sorted(options.folder.glob("*-v1.webp"))
    if options.only:
        files = [
            path for path in files
            if path.name.removesuffix("-v1.webp") in options.only
        ]
    if not files:
        raise SystemExit("No source banking atlases found.")
    for path in files:
        enhance_atlas(
            path, path.with_name(path.name.replace("-v1.webp", "-v2.webp"))
        )
    print(f"Enhanced {len(files)} 3D ship atlases.")


if __name__ == "__main__":
    main()
