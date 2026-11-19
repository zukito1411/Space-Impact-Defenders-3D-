#!/usr/bin/env python3
"""Refine the shipped 3D banking renders against the original top-view art.

Requires Pillow, NumPy and opencv-python-headless. Run from the repository root.
Coordinates describe the existing neutral portrait pose in a 448px cell.
"""
from argparse import ArgumentParser
import importlib.util
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

preview_spec = importlib.util.spec_from_file_location(
    "ship_previews", Path(__file__).with_name("build-hd-raid-ship-previews.py")
)
previews = importlib.util.module_from_spec(preview_spec)
preview_spec.loader.exec_module(previews)
CELL, COLS, ROWS = previews.SOURCE_CELL, previews.COLUMNS, previews.ROWS
Y, X = np.mgrid[:CELL, :CELL].astype(np.float32)

# Port-side details mirror these starboard traces. Seams are polyline
# coordinates. Vent banks are (center x, first y, width, count, spacing).
# Fasteners mark panel breaks, removable pod mounts and booster collars.
PANELS = {
    # Black Comet has stepped delta armor, forebody service lines and two boosters.
    "rocket": (
        [[(234, 73), (244, 104), (246, 128)], [(266, 223), (275, 251), (298, 287), (333, 346)],
         [(275, 302), (304, 341), (337, 371)], [(250, 384), (283, 384)]],
        [(257, 148, 13, 3, 8), (271, 331, 12, 3, 8)],
        [(279, 276), (301, 301), (328, 344), (253, 315), (272, 379)],
    ),
    # Red Wraith has gold-edged wings, four wing pods and ribbed twin rocket cans.
    "fast": (
        [[(245, 133), (252, 151), (253, 167)], [(279, 208), (326, 233), (383, 265)],
         [(297, 252), (325, 255), (367, 281)], [(254, 302), (275, 324), (280, 363)],
         [(256, 389), (281, 389)], [(255, 401), (286, 401)]],
        [(281, 151, 10, 3, 7), (318, 177, 9, 2, 8), (270, 343, 10, 3, 7)],
        [(295, 223), (329, 245), (379, 272), (248, 278), (283, 369)],
    ),
    # Crimson Saw has red leading panels, black trailing hardware and paired pods.
    "gatling": (
        [[(245, 138), (253, 157), (252, 178)], [(267, 233), (294, 249), (361, 301)],
         [(273, 276), (304, 295), (361, 331)], [(250, 304), (262, 321), (264, 365)],
         [(254, 389), (280, 389)], [(254, 402), (282, 402)]],
        [(282, 180, 12, 3, 7), (267, 337, 10, 3, 7)],
        [(288, 257), (317, 280), (366, 315), (249, 286), (277, 367)],
    ),
    # Night Lance has folded white panels, turquoise conduits and nested nozzles.
    "laser": (
        [[(242, 102), (258, 139), (254, 162)], [(277, 173), (293, 211), (311, 259), (348, 326)],
         [(265, 247), (270, 279), (268, 301)], [(280, 371), (309, 371)], [(279, 400), (312, 400)]],
        [(249, 211, 11, 4, 7), (288, 323, 9, 3, 7)],
        [(274, 190), (283, 233), (308, 271), (330, 313), (304, 357)],
    ),
    # Obsidian Ark has overlapping wings, armor flaps and a large center engine.
    "dreadnought": (
        [[(235, 65), (253, 100), (265, 136)], [(270, 206), (294, 237), (316, 279), (382, 319)],
         [(287, 320), (307, 359), (321, 383)], [(228, 398), (243, 398)], [(278, 393), (303, 393)]],
        [(249, 267, 16, 3, 8), (294, 311, 12, 3, 7)],
        [(265, 150), (303, 260), (353, 305), (390, 332), (312, 385), (247, 375)],
    ),
    # Crosswing Nova retains its wing pose and gains inset armor,
    # wing-cannon brackets and the three exhaust collars from the top art.
    "xwing": (
        [[(231, 103), (234, 127), (234, 146)], [(263, 286), (279, 289), (345, 289)],
         [(264, 331), (283, 334), (340, 310)], [(344, 274), (357, 276), (357, 300)],
         [(248, 396), (271, 396)], [(249, 411), (270, 411)]],
        [(278, 304, 12, 3, 7), (257, 367, 14, 3, 7)],
        [(246, 254), (281, 284), (308, 298), (346, 284), (353, 309), (266, 381)],
    ),
    # Space Jet has segmented wings, blue lower panels, tip pods and rear cans.
    "spaceEt": (
        [[(232, 102), (237, 122), (237, 146)], [(260, 228), (274, 252), (322, 300), (357, 330)],
         [(257, 332), (302, 353), (367, 376)], [(246, 385), (279, 385)], [(246, 408), (284, 408)]],
        [(250, 264, 11, 3, 7), (375, 349, 7, 3, 8)],
        [(266, 251), (300, 280), (339, 321), (362, 355), (279, 374)],
    ),
    # Mesiah has stacked wing plates, outboard rocket tubes and an armored spine.
    "mesiah": (
        [[(233, 70), (243, 94), (247, 123)], [(268, 224), (294, 251), (361, 315), (375, 335)],
         [(273, 314), (309, 338), (360, 346)], [(275, 365), (311, 395), (327, 413)],
         [(247, 402), (265, 402)], [(275, 410), (293, 410)]],
        [(291, 176, 13, 4, 8), (265, 265, 15, 3, 8), (241, 351, 11, 3, 7)],
        [(252, 140), (282, 231), (329, 289), (368, 321), (320, 366), (303, 395)],
    ),
    # Mesiah Raptor has chevron control surfaces and recessed paired intakes.
    "mesiahRaptor": (
        [[(233, 82), (247, 126), (256, 156)], [(268, 223), (297, 259), (327, 309), (363, 377)],
         [(263, 304), (297, 325), (330, 361)], [(232, 379), (239, 391), (239, 404)]],
        [(248, 269, 12, 4, 7), (261, 322, 10, 3, 7)],
        [(246, 113), (266, 209), (295, 266), (323, 317), (354, 372), (243, 390)],
    ),
    # Core Lander has narrow cabin cheeks, two swept fins and three outlet roots.
    "coreLander": (
        [[(234, 54), (240, 72), (240, 81)], [(265, 205), (297, 243), (330, 296), (389, 376)],
         [(247, 269), (254, 281), (254, 300)]],
        [(245, 246, 10, 3, 7)],
        [(253, 160), (278, 221), (320, 275), (362, 335), (247, 286)],
    ),
    "coreLanderElite": (
        [[(232, 74), (242, 97), (240, 112)], [(262, 226), (289, 263), (322, 312), (337, 349)],
         [(248, 311), (262, 323), (266, 349)], [(227, 401), (245, 401)]],
        [(248, 246, 12, 4, 7)],
        [(257, 222), (285, 255), (314, 305), (325, 356), (250, 372)],
    ),
    # Burning variants have separate actuator positions and wing angles.
    "coreLanderBurning": (
        [[(235, 88), (242, 109), (242, 121)], [(274, 181), (313, 150), (373, 98)],
         [(279, 224), (326, 225), (384, 220)], [(270, 246), (320, 290), (379, 349)],
         [(248, 255), (253, 275), (250, 293)]],
        [(250, 200, 8, 3, 7)],
        [(258, 222), (304, 160), (335, 224), (307, 284), (245, 281)],
    ),
    "coreLanderBurningElite": (
        [[(234, 69), (242, 89), (244, 102)], [(285, 196), (326, 158), (396, 100)],
         [(289, 247), (334, 283), (398, 347)], [(250, 245), (254, 265), (247, 291)],
         [(226, 315), (241, 315)], [(226, 329), (241, 329)]],
        [(267, 214, 12, 3, 7)],
        [(271, 192), (314, 173), (382, 115), (312, 270), (370, 329), (245, 278)],
    ),
}


# The steep landscape camera exposes different pieces of the same hull.
# Place details on its visible panels instead of stretching the dorsal art
# onto the fuselage sides as the bank passes through edge-on.
SIDE_PANELS = {
    "rocket": (
        [[(222, 80), (213, 108), (210, 125)], [(233, 210), (226, 248), (229, 287), (250, 337)],
         [(202, 327), (190, 350), (185, 372)], [(200, 410), (240, 410)]],
        [(212, 141, 13, 3, 8), (219, 293, 11, 3, 7)],
        [(232, 198), (243, 284), (243, 362), (202, 395)],
    ),
    "fast": (
        [[(223, 136), (226, 155), (229, 178)], [(192, 229), (179, 247), (178, 281)],
         [(252, 225), (266, 247), (269, 280)], [(206, 302), (200, 331), (201, 363)],
         [(196, 398), (248, 398)]],
        [(237, 184, 10, 3, 7), (210, 332, 10, 3, 8)],
        [(211, 224), (247, 231), (190, 257), (262, 264), (234, 367)],
    ),
    "gatling": (
        [[(226, 145), (229, 163), (231, 187)], [(191, 248), (182, 280), (181, 310)],
         [(243, 249), (250, 270), (263, 318)], [(204, 310), (209, 337), (206, 359)],
         [(196, 398), (249, 398)]],
        [(237, 194, 11, 3, 7), (216, 335, 9, 3, 7)],
        [(207, 245), (231, 271), (190, 299), (246, 320), (231, 370)],
    ),
    "laser": (
        [[(225, 99), (232, 128), (232, 160)], [(225, 242), (234, 273), (253, 341)],
         [(201, 257), (202, 311), (189, 356)], [(193, 369), (228, 369)], [(193, 403), (229, 403)]],
        [(215, 208, 8, 4, 6), (230, 340, 10, 3, 7)],
        [(224, 249), (242, 303), (193, 323), (248, 372)],
    ),
    "dreadnought": (
        [[(226, 92), (237, 116), (238, 143)], [(214, 200), (238, 229), (244, 257), (267, 315)],
         [(184, 296), (177, 331), (160, 367)], [(229, 399), (249, 399)]],
        [(212, 273, 13, 3, 7), (247, 318, 11, 3, 8)],
        [(205, 177), (248, 214), (190, 286), (271, 332), (194, 373)],
    ),
    "spaceEt": (
        [[(220, 110), (221, 139), (219, 159)], [(228, 250), (239, 288), (249, 309), (263, 357)],
         [(196, 286), (185, 315), (172, 358)], [(198, 410), (257, 410)]],
        [(220, 292, 9, 3, 7), (238, 343, 10, 3, 7)],
        [(222, 243), (184, 331), (250, 338), (242, 390)],
    ),
    "mesiah": (
        [[(221, 94), (232, 123), (235, 150)], [(228, 189), (238, 236), (256, 273), (263, 328)],
         [(194, 282), (190, 316), (170, 362)], [(202, 400), (250, 400)]],
        [(245, 172, 11, 3, 7), (215, 267, 10, 3, 7), (243, 351, 12, 3, 7)],
        [(236, 220), (183, 318), (254, 323), (158, 375), (239, 390)],
    ),
    "mesiahRaptor": (
        [[(219, 86), (233, 128), (238, 160)], [(238, 206), (245, 251), (259, 308), (263, 363)],
         [(202, 284), (194, 323), (177, 372)], [(218, 389), (238, 389)]],
        [(246, 255, 9, 3, 7), (226, 331, 11, 3, 7)],
        [(212, 118), (228, 210), (258, 289), (187, 345), (221, 370)],
    ),
    "coreLander": (
        [[(220, 54), (231, 86), (234, 112)], [(200, 243), (189, 290), (171, 359)],
         [(242, 242), (250, 284), (266, 353)]],
        [(224, 249, 11, 3, 7)],
        [(228, 130), (198, 234), (249, 267), (181, 304), (230, 290)],
    ),
    "coreLanderElite": (
        [[(220, 61), (232, 104), (239, 130)], [(212, 246), (203, 287), (191, 354)],
         [(245, 248), (252, 300), (255, 352)], [(212, 401), (245, 401)]],
        [(228, 256, 11, 3, 7)],
        [(237, 193), (201, 292), (251, 320), (217, 363)],
    ),
    "coreLanderBurning": (
        [[(224, 90), (228, 114), (233, 151)], [(188, 146), (181, 124), (167, 98)],
         [(253, 277), (268, 316), (282, 350)], [(154, 218), (193, 218)]],
        [(222, 254, 10, 3, 7)],
        [(193, 154), (205, 209), (241, 225), (268, 311), (210, 284)],
    ),
    "coreLanderBurningElite": (
        [[(222, 94), (232, 127), (239, 164)], [(185, 160), (168, 127), (154, 93)],
         [(251, 257), (271, 304), (291, 353)], [(213, 312), (241, 312)]],
        [(225, 255, 12, 3, 7)],
        [(194, 174), (249, 164), (237, 232), (271, 300), (224, 306)],
    ),
}

FAMILIES = {
    **{key: key for key in PANELS if key not in ("mesiah", "mesiahRaptor")},
    **{key + "Elite": key for key in ("rocket", "fast", "gatling", "laser", "dreadnought", "xwing", "spaceEt")},
    **{f"mesiah{paint}{edition}": "mesiah" for paint in ("Black", "White") for edition in ("", "Elite")},
    "mesiahRaptorBlack": "mesiahRaptor",
    "mesiahRaptorWhite": "mesiahRaptor",
}


def detail_map(panels, mirrored):
    """Paint shallow relief as a shadow and catchlight on the existing colors."""
    seams, vents, fasteners = panels
    scale = 3
    shadow = Image.new("L", (CELL * scale, CELL * scale))
    shine = shadow.copy()
    for side in ((-1, 1) if mirrored else (1,)):
        def point(x, y):
            return (round((223.5 + side * (x - 223.5)) * scale), round(y * scale))

        shade, light = ImageDraw.Draw(shadow), ImageDraw.Draw(shine)
        for path in seams:
            shade.line([point(x, y) for x, y in path], 177, width=7, joint="curve")
            light.line([point(x + 1.6, y - 1.6) for x, y in path], 164, width=4, joint="curve")
        for x, y, width, count, spacing in vents:
            for slat in range(count):
                top = y + slat * spacing
                ends = (x - width / 2, x + width / 2)
                shade.line([point(edge, top) for edge in ends], 230, width=9)
                light.line([point(edge, top + 2.3) for edge in ends], 202, width=4)
        for x, y in fasteners:
            cx, cy = point(x, y)
            shade.ellipse((cx - 7, cy - 7, cx + 7, cy + 7), 220)
            light.ellipse((cx - 4, cy - 5, cx + 2, cy + 1), 245)
    masks = [np.asarray(mask.resize((CELL, CELL), Image.Resampling.LANCZOS), dtype=np.float32) / 255
             for mask in (shadow, shine)]
    return np.stack(masks, axis=-1)


def scanline_edges(alpha):
    solid = alpha >= 128
    rows = np.flatnonzero(solid.any(axis=1))
    left = np.argmax(solid[rows], axis=1)
    right = CELL - 1 - np.argmax(solid[rows, ::-1], axis=1)
    return [np.interp(Y[:, 0], rows, edge).astype(np.float32)[:, None] for edge in (left, right)]


def remap(image, x, y):
    return cv2.remap(image, x.astype(np.float32), y.astype(np.float32), cv2.INTER_LINEAR)


def grayscale(frame):
    gray = cv2.cvtColor(frame, cv2.COLOR_RGBA2GRAY)
    return np.where(frame[..., 3] >= 96, gray, 0).astype(np.uint8)


def register_detail(source, target, details, flow):
    """Use the hull outline for foreshortening, then register local panels."""
    left, right = scanline_edges(source[..., 3])
    target_left, target_right = scanline_edges(target[..., 3])
    width = np.maximum(target_right - target_left, 1)
    first_x = left + (X - target_left) * (right - left) / width
    rough = remap(grayscale(source), first_x, Y)
    offsets = flow.calc(grayscale(target), rough, None)
    # Exclude occluded features rather than copying highlights onto empty space.
    offset_x, offset_y = np.moveaxis(np.clip(offsets, -27, 27), -1, 0)
    local_x, local_y = X + offset_x, Y + offset_y
    aligned = remap(details, remap(first_x, local_x, local_y), local_y)
    fit = np.abs(grayscale(target).astype(np.float32) - remap(rough, local_x, local_y))
    visible = np.clip((width / np.maximum(right - left, 1) - .21) / .54, 0, 1)
    trust = np.clip(1.15 - fit / 105, .18, 1)
    return aligned * (visible * trust)[..., None]


def finish_hull(frame, detail):
    # Suppress isolated glints before smoothing within material boundaries.
    # Keep exhaust apertures, paint edges and the antialiased hull outline.
    alpha = frame[..., 3]
    inner = np.asarray(Image.fromarray(alpha).filter(ImageFilter.MinFilter(5)), dtype=np.float32) / 255
    paint = frame[..., :3].copy()
    deglinted = cv2.medianBlur(paint, 7)
    smoothed = cv2.bilateralFilter(deglinted, 15, 76, 3.8)
    rgb = paint.astype(np.float32)
    rgb += (.76 * inner)[..., None] * (smoothed - rgb)

    # Shade along the existing RGB proportions so the larger paint regions
    # keep their hue. Let highlights roll off on bright painted panels.
    value = rgb.max(axis=2)
    saturation = (value - rgb.min(axis=2)) / np.maximum(value, 1)
    shadow, highlight = np.moveaxis(detail, -1, 0)
    shadow_strength = .39 - .13 * saturation
    highlight_strength = (.19 * value + 7) * (1 - (value / 270) ** 3)
    value_change = inner * (-shadow_strength * shadow * value + highlight * highlight_strength)
    target_value = np.clip(value + value_change, 0, 255)
    rgb *= (target_value / np.maximum(value, 1))[..., None]
    frame = frame.copy()
    frame[..., :3] = np.clip(rgb, 0, 255).round().astype(np.uint8)
    return frame


def turret_layer(frame, family, row, col):
    """Project the three parallel tubes in the 2D reference into this bake."""
    # The second row sweeps across edge-on, which brings one of the narrow
    # guide tubes in front of the main barrel. Keep the receiver on the
    # existing fuselage centerline and terminate the tubes before the cockpit.
    tilt = ((-31, -22, -11, 0, 11, 22, 31), (71, 87, -87, -70, -55, -43, -32))[row][col]
    angle = np.deg2rad(tilt)
    cos, sin = float(np.cos(angle)), float(np.sin(angle))
    left, right = scanline_edges(frame[..., 3])
    center = float(np.median((left[92:112] + right[92:112]) / 2))
    radius = 11.5 if family == "fast" else 10.5
    mount_y = 111 if family == "fast" else 117
    scale = 4
    layer = Image.new("RGBA", (CELL * scale, CELL * scale))
    draw = ImageDraw.Draw(layer)

    def oval(x, y, rx, ry, fill):
        draw.ellipse(tuple(round(v * scale) for v in (x - rx, y - ry, x + rx, y + ry)), fill=fill)

    metal = (88, 81, 72) if family == "fast" else (73, 83, 94)
    mount_metal = (162, 115, 43) if family == "fast" else (94, 103, 110)

    def tube(x, top, bottom, r, light, *, muzzle=False, collar=False, painted=False):
        # A curved catchlight and dark edges describe the cylindrical jacket.
        # Only the front of each tube has a bore. The collars are solid steel.
        tint = mount_metal if painted else metal
        for step in range(round(-r * scale), round(r * scale) + 1):
            u = step / (r * scale)
            lit = max(0, 1 - ((u - light) / 1.13) ** 2)
            surface = .34 + .83 * lit
            glint = int(52 * lit ** 5) + (7 if collar else 0)
            x_px = round(x * scale) + step
            arc = max(0, 1 - u * u) ** .5 * r * .18
            draw.line((x_px, round((top - arc) * scale), x_px, round((bottom + arc) * scale)),
                      fill=tuple(min(255, int(channel * surface) + glint) for channel in tint))
        if muzzle:
            oval(x, top, r, r * .24, (112, 121, 128))
            oval(x, top - .25, r * .66, r * .135, (19, 25, 32))
            oval(x - r * .08, top + r * .12, r * .66, r * .042, (154, 162, 168))
        elif collar:
            # A highlight at the lip and a recessed seam under the collar.
            ry = max(1, r * .12)
            for y, fill in ((top + .85, tuple(c + 35 for c in tint)), (bottom - .5, tuple(c // 2 for c in tint))):
                points = [(round((x + r * u) * scale), round((y - ry * max(0, 1 - u*u)**.5) * scale))
                          for u in np.linspace(-.89, .89, 17)]
                draw.line(points, fill=fill, width=scale)

    # The receiver fills the old forebody where the tubes seat into the ship.
    # Keep the narrow side tubes separate where they're visible and stagger the
    # depth order so they pass naturally in front of the main one in a bank.
    casing = center - 2.5 * sin
    tube(casing, mount_y - 20, mount_y + 16, radius + 8, -.37, collar=True, painted=True)
    for offset in sorted((-15, 0, 15), key=lambda x: -x * sin):
        is_bore = offset == 0
        px = center + offset * cos + (1.8 if is_bore else -1.5) * sin
        muzzle_y = (31 if is_bore else 49) + offset * sin * .12
        r = radius if is_bore else 5.2
        light = -.36 + .16 * sin
        tube(px, muzzle_y + 3, mount_y + 16, r * .87, light)
        tube(px, muzzle_y, muzzle_y + (10 if is_bore else 7), r, light, muzzle=True)
        collar_y = muzzle_y + (39 if is_bore else 25)
        tube(px, collar_y, collar_y + 6, r * .99, light, collar=True)
        tube(px, mount_y - 11, mount_y + 16, r * 1.13, light, collar=True, painted=True)

    # The new muzzle replaces just the tapered material ahead of the mount.
    # Feather the receiver into the existing painted collar and forebody.
    layer = layer.resize((CELL, CELL), Image.Resampling.LANCZOS)
    receiver = Image.fromarray(np.uint8(np.clip((mount_y + 14 - Y) / 23, 0, 1) * 255))
    result = Image.fromarray(frame.copy())
    original_alpha = frame[..., 3] * np.clip((Y - mount_y + 18) / 16, 0, 1)
    result.putalpha(Image.fromarray(original_alpha.astype(np.uint8)))
    layer.putalpha(Image.composite(layer.getchannel("A"), Image.new("L", layer.size), receiver))
    result.alpha_composite(layer)
    return result


def build(key):
    family = FAMILIES[key]
    version = 8 if key in previews.MESIAH else 7
    with Image.open(previews.BANKING / f"{key}-v{version}.webp") as image:
        atlas = image.convert("RGBA")
    if atlas.size != (COLS * CELL, ROWS * CELL):
        raise ValueError(f"Unexpected banking grid for {key}: {atlas.size}")

    result = Image.new("RGBA", atlas.size)
    details = detail_map(PANELS[family], mirrored=True)
    neutral = np.asarray(atlas.crop((3 * CELL, 0, 4 * CELL, CELL)))
    side_neutral = np.asarray(atlas.crop((3 * CELL, CELL, 4 * CELL, 2 * CELL)))
    side_details = detail_map(SIDE_PANELS[family], mirrored=False) if family in SIDE_PANELS else None
    flow = cv2.DISOpticalFlow_create(cv2.DISOPTICAL_FLOW_PRESET_MEDIUM)
    for row in range(ROWS):
        for col in range(COLS):
            left, top = col * CELL, row * CELL
            frame = np.asarray(atlas.crop((left, top, left + CELL, top + CELL)))
            detail = details if (row, col) == (0, 3) else register_detail(neutral, frame, details, flow)
            if row == 1 and side_details is not None:
                side_weight = (.85, .9, .9, 1, .77, .43, .14)[col]
                side = side_details if col == 3 else register_detail(side_neutral, frame, side_details, flow)
                detail = (1 - side_weight) * detail + side_weight * side
            refined = finish_hull(frame, detail)
            tile = turret_layer(refined, family, row, col) if family in ("fast", "gatling") else Image.fromarray(refined)
            result.paste(tile, (left, top))

    result.save(previews.BANKING / f"{key}-v9.webp", "WEBP", quality=97, method=5)
    for landscape, suffix in ((False, "portrait"), (True, "landscape")):
        view = previews.get_trimmed_view(result, landscape)
        view.save(previews.PREVIEWS / f"{key}-{suffix}-v2.webp", "WEBP", quality=98, method=5)
    print(f"Refined {key}: 14 flight poses and both picker views", flush=True)


if __name__ == "__main__":
    parser = ArgumentParser(description=__doc__)
    parser.add_argument("ships", nargs="*", metavar="SHIP", help="Banking keys (default: all spacecraft)")
    args = parser.parse_args()
    if unknown := set(args.ships) - FAMILIES.keys():
        parser.error("unknown ships: " + ", ".join(sorted(unknown)))
    cv2.setNumThreads(2)
    for ship in args.ships or FAMILIES:
        build(ship)
