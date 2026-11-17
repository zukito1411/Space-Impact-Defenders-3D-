#!/usr/bin/env python3
"""Pack true model-derived Blender frames into the game's 7x2 banking atlas."""
from argparse import ArgumentParser
from pathlib import Path
from PIL import Image

ROWS, COLUMNS = 2, 7


def main():
    p = ArgumentParser()
    p.add_argument("--frames", type=Path, required=True)
    p.add_argument("--out", type=Path, required=True)
    p.add_argument("--cell", type=int, default=448)
    a = p.parse_args()
    if not 224 <= a.cell <= 1024:
        raise SystemExit("invalid banking cell size")
    atlas = Image.new("RGBA", (COLUMNS * a.cell, ROWS * a.cell))
    for row in range(ROWS):
        for col in range(COLUMNS):
            path = a.frames / f"{row}_{col}.png"
            if not path.is_file():
                raise SystemExit(f"Missing source-model render {path}")
            with Image.open(path) as frame:
                if frame.width != frame.height or frame.width < a.cell:
                    raise SystemExit(f"Invalid render resolution {path}: {frame.size}")
                image = frame.convert("RGBA")
                if image.width != a.cell:
                    image = image.resize((a.cell, a.cell), Image.Resampling.LANCZOS)
                atlas.alpha_composite(image, (col * a.cell, row * a.cell))
    a.out.parent.mkdir(parents=True, exist_ok=True)
    atlas.save(a.out, "WEBP", quality=98, method=6, exact=True)
    with Image.open(a.out) as result:
        assert result.size == atlas.size and result.mode == "RGBA"
    print(f"Verified {ROWS*COLUMNS} real-geometry banking renders: {a.out}")


if __name__ == "__main__":
    main()
