"""Bake the Raid hazard sprites (Pillow and NumPy). No assets are generated during play."""
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

OUTPUT = Path(__file__).resolve().parents[1] / 'public/assets/raid-fx'
TAU = 2 * np.pi
RNG = np.random.default_rng(22808)


def clip(value):
    return np.clip(value, 0, 1)


def grid(width, height):
    return np.meshgrid((np.arange(width) + .5) / width, (np.arange(height) + .5) / height)


def cloud(width, height, columns, rows):
    lattice = RNG.integers(0, 256, (rows, columns), dtype=np.uint8)
    image = Image.fromarray(lattice).resize((width, height), Image.Resampling.BICUBIC)
    return np.asarray(image, dtype=np.float32) / 255


def sample(field, u, v):
    height, width = field.shape
    x, y = u * width % width, v * height % height
    ix, iy = x.astype(int), y.astype(int)
    jx, jy = (ix + 1) % width, (iy + 1) % height
    fx, fy = x - ix, y - iy
    return (field[iy, ix] * (1 - fx) + field[iy, jx] * fx) * (1 - fy) + (field[jy, ix] * (1 - fx) + field[jy, jx] * fx) * fy


def image_from_light(alpha, light, palette):
    stops = np.linspace(0, 1, len(palette))
    rgb = [np.interp(light, stops, channel) for channel in np.asarray(palette).T]
    return Image.fromarray(np.uint8(np.stack([*rgb, clip(alpha) * 255], axis=-1)))


def save_atlas(name, frames, columns=4):
    width, height = frames[0].size
    atlas = Image.new('RGBA', (width * columns, height * ((len(frames) + columns - 1) // columns)))
    for index, frame in enumerate(frames):
        atlas.paste(frame, ((index % columns) * width, (index // columns) * height))
    atlas.save(OUTPUT / f'hazard-{name}-v2.webp', quality=90, method=5, exact=False)


def bake_solar():
    width, height = 640, 224
    x, y = grid(width, height)
    broad = cloud(width, height, 24, 10)
    turbulent = cloud(width, height, 66, 18)
    fine = cloud(width, height, 170, 75)
    frames = []
    for frame in range(12):
        t = TAU * frame / 12
        swell = sample(broad, x + .044 * np.cos(t), y + .075 * np.sin(t))
        curl = sample(turbulent, x + (swell - .5) * .065 + .013 * np.sin(t), y + .037 * np.cos(t))
        grit = sample(fine, x - .008 * np.sin(t), y + (curl - .5) * .08 - .022 * np.cos(t))
        # The right end forms the inner lip of one wing. Keep gas behind the crest.
        bevel = clip((x - .953) / .047)
        front = .77 + (sample(broad, x + .02 * np.sin(t), x * .16 + .26) - .48) * .103 - bevel ** 2 * .083
        depth = front - y
        bank = clip(depth / .047 + .57) * clip(1 - depth / (.44 + .26 * swell))
        tip = clip((.999 - x) / (.014 + .016 * swell)) ** .65
        roll = np.sin(31 * depth + 10 * curl + 4 * swell)
        turbulence = clip(.2 + .47 * curl + .52 * swell + .15 * roll)
        shoulder = np.exp(-((depth - .075 - (curl - .5) * .115) / .095) ** 2)
        knots = clip((grit + curl * .45 + swell * .4 - .52) * 1.12)
        bright = np.exp(-((depth - .022) / (.019 + .045 * curl)) ** 2)
        plasma = bright * (.31 + knots * .64) + shoulder * turbulence * .43 + bank * turbulence * .43
        light = clip((plasma * 1.49 + grit * .14) * (1 - bevel * .17))
        alpha = tip * clip(bank ** 1.15 * (.45 + turbulence * .76) + bright * .53)
        frames.append(image_from_light(alpha, light, [
            (48, 9, 22), (104, 13, 40), (190, 32, 24), (241, 88, 20), (255, 146, 51), (255, 207, 132), (255, 249, 219),
        ]))
    save_atlas('solar-front', frames)


def bake_accretion():
    size = 480
    u, v = grid(size, size)
    x, y = (u - .5) * 6.8, (v - .5) * 6.8
    core = np.hypot(x, y)
    angle = np.arctan2(y, x)
    polar = angle / TAU + .5
    disk_y = y - .29 - .08 * np.tanh(x)
    disk_radius = np.hypot(x, disk_y / .255)
    disk_angle = np.arctan2(disk_y / .255, x)
    lens = np.hypot(x * .86, (y + .11) * .78)
    fog = cloud(size, size, 31, 19)
    texture = cloud(size, size, 103, 64)
    frames = []
    for frame in range(8):
        t = TAU * frame / 8
        turn = disk_angle / TAU + .5 - t / TAU + .24 * disk_radius
        gas = sample(fog, turn, disk_radius * .23)
        flecks = sample(texture, turn, disk_radius * .52)
        radius = disk_radius + (gas - .5) * .12
        streams = (.5 + .5 * np.sin(radius * 34 + disk_angle * 3 + gas * 5)) ** 1.8
        disk = clip((3.37 - radius) / 1.35) * clip((radius - .84) * 9) * clip((disk_y + .08) * 9)
        disk *= (.38 + gas * .45 + flecks * .17) * (.38 + streams * .82)
        disk *= .68 + .31 * np.cos(disk_angle - .51)
        arcs = sample(fog, polar - .008 * np.sin(t), lens * .41)
        folded = np.exp(-((lens - 1.02 - (arcs - .5) * .18) / (.11 + .12 * arcs)) ** 2)
        folded *= clip((.61 - y) * .72) * (.42 + .58 * arcs)
        rim = np.exp(-((core - 1.015) / .029) ** 2) * (.51 + .38 * np.sin(angle - .85) ** 2)
        halo = clip((2.52 - lens) / 1.48) ** 1.7 * (.13 + .13 * arcs)
        inner = clip((core - .98) * 26)
        crescent = np.exp(-((lens - .87) / .042) ** 2) * clip(-y * .75) * (arcs + .19)
        alpha = inner * clip(disk * 1.85 + folded * .77 + rim * .91 + halo + crescent * .45)
        light = clip(disk * (1.12 + .62 * np.exp(-((radius - 1.1) / .62) ** 2)) + folded * .31 + rim * .8 + crescent * .47)
        frames.append(image_from_light(alpha, light, [
            (34, 13, 56), (76, 31, 111), (139, 65, 154), (209, 96, 150), (255, 148, 113), (255, 209, 155), (255, 245, 217),
        ]))
    save_atlas('black-hole', frames)


def bake_storm():
    width, height = 672, 320
    x, y = grid(width, height)
    mass = cloud(width, height, 16, 7)
    eddies = cloud(width, height, 38, 18)
    specks = cloud(width, height, 118, 58)
    shell = np.sin(x * 23) * .055 + np.sin(x * 49) * .043
    shape = clip((.71 + shell - y) * 1.9)
    warped_y = y + (mass - .5) * .19
    flow = sample(eddies, x + (mass - .5) * .048, warped_y)
    grain = sample(specks, x - (flow - .5) * .015, warped_y + flow * .035)
    body = clip((shape - .23 + .57 * mass + .4 * flow) * 1.14)
    body *= clip((1 - y) * 3.2) * clip(x * 9) * clip((1 - x) * 9)
    lit = clip(.1 + (np.roll(flow, 4, axis=0) - flow) * 1.5 + mass * .31 + flow * .43 + grain * .22)
    lit *= clip((1 - y) * .84 + .19)
    frame = image_from_light(body * .94, lit, [
        (5, 7, 20), (15, 17, 41), (31, 28, 68), (56, 43, 111), (82, 69, 155), (112, 113, 180), (154, 165, 213),
    ])
    save_atlas('storm-shelf', [frame], 1)


def fork_points(start, end, displacement, levels):
    points = [start, end]
    for _ in range(levels):
        subdivided = [points[0]]
        for (x, y), (nx, ny) in zip(points[:-1], points[1:]):
            subdivided.extend([((x + nx) * .5 + RNG.uniform(-displacement, displacement), (y + ny) * .5), (nx, ny)])
        points = subdivided
        displacement *= .50
    return points


def bake_lightning():
    width, height = 288, 768
    x, y = grid(width, height)
    plasma = cloud(width, height, 28, 90)
    palettes = [
        (31, 15, 95), (75, 47, 181), (101, 94, 239), (132, 167, 255), (195, 225, 255), (248, 254, 255),
    ]
    frames = []
    for index in range(6):
        mask = Image.new('L', (width, height))
        draw = ImageDraw.Draw(mask)
        trace = fork_points((RNG.uniform(91, 194), 0), (RNG.uniform(91, 194), height), 63, 7)
        for position in (8, 49, 90):
            side = -1 if position == 49 else 1
            first, last = trace[position], trace[position + 28]
            middle = ((first[0] + last[0]) * .5 + 50 * side, (first[1] + last[1]) * .5)
            secondary = fork_points(first, middle, 22, 5) + fork_points(middle, last, 15, 5)[1:]
            draw.line(secondary, fill=157, width=2)
            for step in (14, 23, 36):
                origin = secondary[step]
                end = (origin[0] + side * RNG.uniform(14, 35), origin[1] + RNG.uniform(14, 52))
                draw.line(fork_points(origin, end, 8, 3), fill=98, width=1)
        for point, next_point in zip(trace[:-1], trace[1:]):
            weight = 2 + int((1 + np.sin(point[1] * .025 + index)) * 1.25)
            draw.line([point, next_point], fill=244, width=weight)
        for branch, origin in enumerate(trace[4:-10:7]):
            side = 1 if branch % 2 else -1
            reach = min(width - 16, max(16, origin[0] + side * RNG.uniform(44, 111)))
            branch_trace = fork_points(origin, (reach, origin[1] + RNG.uniform(20, 81)), 11, 4)
            for step, (a, b) in enumerate(zip(branch_trace[:-1], branch_trace[1:])):
                draw.line([a, b], fill=max(50, 178 - step * 6), width=2 if step < 7 else 1)
            for anchor in branch_trace[5:12:5]:
                end = (min(width - 8, max(8, anchor[0] + side * RNG.uniform(13, 39))), anchor[1] + RNG.uniform(-22, 24))
                draw.line(fork_points(anchor, end, 6, 3), fill=96, width=1)
        core = np.asarray(mask, dtype=np.float32) / 255
        tight = np.asarray(mask.filter(ImageFilter.GaussianBlur(3.0)), dtype=np.float32) / 255
        haze = np.asarray(mask.filter(ImageFilter.GaussianBlur(12.0)), dtype=np.float32) / 255
        mote = np.zeros_like(core)
        for j in range(110):
            cx, cy = trace[int(RNG.integers(1, len(trace) - 1))]
            px = int(np.clip(cx + RNG.normal(0, 35), 9, width - 9))
            py = int(np.clip(cy + RNG.normal(0, 14), 1, height - 2))
            mote[py, px:px + int(RNG.integers(1, 4))] = RNG.uniform(.13, .64)
        shade = clip(core + tight * 1.81 + haze * (.74 + plasma * 2.4))
        alpha = clip(core + mote + tight * 2.4 + haze * (3.1 + plasma * 5.3))
        alpha *= clip((.995 - x) * 18) * clip(x * 18)
        frames.append(image_from_light(alpha, clip(shade + mote * .6), palettes))
    save_atlas('ion-discharge', frames, 3)


if __name__ == '__main__':
    bake_solar()
    bake_accretion()
    bake_storm()
    bake_lightning()
