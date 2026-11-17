#!/usr/bin/env python3
"""Build uniquely branded Android launcher icons for the independent 3D APK.

The source is the game's existing full-resolution PWA icon, not the default
Capacitor Android mascot. Render the small gold "3D" edition mark with adequate
contrast, and produce legacy, round, and adaptive foreground variants at every
Android density. Keep these assets separate from the original 2D project.
"""
from __future__ import annotations

from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageOps

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "public/pwa-512x512.png"
ANDROID_RES = ROOT / "android/app/src/main/res"
DENSITIES = {"mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}
MASTER_SIZE = 1024


def badge_font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    paths = (
        "/usr/share/fonts/truetype/dejavu/DejaVuSansCondensed-BoldOblique.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/liberation2/LiberationSans-BoldItalic.ttf",
        "DejaVuSans-Bold.ttf",
    )
    for path in paths:
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue
    return ImageFont.load_default(size=size)


def add_edition_mark(art: Image.Image) -> Image.Image:
    """Place the legible lower-right badge inside common circular crop masks."""
    art = art.copy().convert("RGBA")
    w, h = art.size
    # Badge sits inward from the edge so round launchers cannot cut off "3D".
    box = (int(.565 * w), int(.672 * h), int(.872 * w), int(.846 * h))
    draw = ImageDraw.Draw(art, "RGBA")
    ox = max(2, round(w * .012))
    oy = max(2, round(h * .016))
    draw.rounded_rectangle(
        (box[0] + ox, box[1] + oy, box[2] + ox, box[3] + oy),
        radius=round(.032 * w), fill=(0, 5, 18, 212),
    )
    draw.rounded_rectangle(
        box, radius=round(.032 * w), fill=(6, 18, 38, 245),
        outline=(255, 197, 69, 255), width=max(2, round(.009 * w)),
    )
    inner = (box[0] + round(.014 * w), box[1] + round(.013 * h),
             box[2] - round(.014 * w), box[3] - round(.014 * h))
    draw.rounded_rectangle(inner, radius=round(.019 * w),
                           fill=(195, 91, 10, 228))
    draw.rounded_rectangle(
        (inner[0], inner[1], inner[2], inner[1] + round(.05 * h)),
        radius=round(.014 * w), fill=(255, 205, 91, 241),
    )
    font = badge_font(round(.126 * w))
    x = (box[0] + box[2]) // 2
    y = (box[1] + box[3]) // 2 + round(.003 * h)
    draw.text((x + round(.003 * w), y + round(.006 * h)), "3D",
              font=font, anchor="mm", fill=(49, 16, 4, 255),
              stroke_width=max(1, round(.004 * w)),
              stroke_fill=(61, 21, 5, 255))
    draw.text((x, y), "3D", font=font, anchor="mm",
              fill=(255, 242, 184, 255),
              stroke_width=max(1, round(.002 * w)),
              stroke_fill=(121, 52, 10, 255))
    return art


def render() -> None:
    if not SOURCE.is_file():
        raise SystemExit(f"Missing 3D game icon source: {SOURCE}")
    with Image.open(SOURCE) as image:
        if min(image.size) < 192:
            raise SystemExit(f"Game icon source is too small: {image.size}")
        # Use the project's established game artwork (not a generic Android icon).
        original = ImageOps.fit(
            image.convert("RGBA"), (MASTER_SIZE, MASTER_SIZE),
            method=Image.Resampling.LANCZOS,
        )
    artwork = add_edition_mark(original)
    # The final installer icon is opaque even when the source has transparency.
    opaque = Image.new("RGBA", artwork.size, (5, 8, 22, 255))
    opaque.alpha_composite(artwork)

    for density, scale in DENSITIES.items():
        output = ANDROID_RES / f"mipmap-{density}"
        output.mkdir(parents=True, exist_ok=True)
        legacy_pixels = round(48 * scale)
        icon = opaque.resize((legacy_pixels, legacy_pixels), Image.Resampling.LANCZOS)
        icon.convert("RGB").save(output / "ic_launcher.png", optimize=True)

        # Explicit round variant for pre-adaptive and manufacturer launchers.
        circle = Image.new("L", (MASTER_SIZE, MASTER_SIZE), 0)
        ImageDraw.Draw(circle).ellipse(
            (0, 0, MASTER_SIZE - 1, MASTER_SIZE - 1), fill=255,
        )
        circle = circle.resize((legacy_pixels, legacy_pixels), Image.Resampling.LANCZOS)
        round_icon = icon.copy()
        round_icon.putalpha(circle)
        round_icon.save(output / "ic_launcher_round.png", optimize=True)

        # Android 8+ adaptive icons reserve outer padding for shape masks and
        # motion. Keep all branded detail within the central safe area.
        adaptive_px = round(108 * scale)
        foreground = Image.new("RGBA", (adaptive_px, adaptive_px))
        art_px = round(adaptive_px * 0.64)
        inset = (adaptive_px - art_px) // 2
        layer = opaque.resize((art_px, art_px), Image.Resampling.LANCZOS)
        foreground.alpha_composite(layer, (inset, inset))
        foreground.save(output / "ic_launcher_foreground.png", optimize=True)
        for filename, expected in (
            ("ic_launcher.png", (legacy_pixels, legacy_pixels)),
            ("ic_launcher_round.png", (legacy_pixels, legacy_pixels)),
            ("ic_launcher_foreground.png", (adaptive_px, adaptive_px)),
        ):
            with Image.open(output / filename) as generated:
                if generated.size != expected:
                    raise RuntimeError(f"Unexpected {filename} size in {density}")
        print(f"Branded 3D launcher icons: {density} ({legacy_pixels}px)")

    print("Generated all 15 Android launcher resources from the game's own icon.")


if __name__ == "__main__":
    render()
