"""Build two original, textured Raid scenery meshes with Blender.

Run from the repository root:
    blender -b --python scripts/build-raid-cruise-models.py
"""
import json
from math import cos, pi, sin
from pathlib import Path
from random import Random
from tempfile import TemporaryDirectory
from struct import unpack_from
import bpy
import numpy as np

PLAYER_HULLS = Path("public/assets/ships/models/v1")
OUTPUT = PLAYER_HULLS.parent.parent / "scenery"
TILE = 128
ATLAS = TILE * 4
UV_BOX = ((0, 0), (1, 0), (1, 1), (0, 1))

ROCKY = (
    ("3e2923", "plate"), ("84563e", "plate"), ("b5764c", "plate"), ("5a3b30", "ribs"),
    ("bf8c69", "plate"), ("261e1c", "ribs"), ("e5954d", "plain"), ("689ca1", "plain"),
)
GRACE = (
    ("c0c2bb", "plate"), ("54595e", "plate"), ("f0e5cb", "plate"), ("c69452", "plate"),
    ("252c34", "ribs"), ("225078", "cells"), ("7ac4c7", "plain"), ("4a7295", "plate"),
)


class Hull:
    def __init__(self):
        self.vertices = []
        self.faces = []
        self.paint = []

    def face(self, vertices, tile, uvs=UV_BOX, smooth=False):
        self.faces.append(vertices)
        self.paint.append((tile, uvs, smooth))

    def box(self, center, size, tile, angle=0):
        x, y, z = center
        w, length, depth = [n / 2 for n in size]
        c, s = cos(angle), sin(angle)
        start = len(self.vertices)
        for dz in (-depth, depth):
            for dx, dy in ((-w, -length), (w, -length), (w, length), (-w, length)):
                self.vertices.append((x + dx*c - dy*s, y + dx*s + dy*c, z + dz))
        for indices in ((3,2,1,0), (4,5,6,7), (0,1,5,4), (1,2,6,5), (2,3,7,6), (3,0,4,7)):
            self.face(tuple(start + i for i in indices), tile)

    def tube(self, x, z, rings, tile, sides=12):
        start = len(self.vertices)
        for y, rx, rz in rings:
            for n in range(sides):
                angle = n * 2*pi/sides
                self.vertices.append((x + rx*cos(angle), y, z + rz*sin(angle)))
        self.face(tuple(start + n for n in range(sides)), tile, ((.5,.5),) * sides)
        for k in range(len(rings) - 1):
            first, second = start + k*sides, start + (k+1)*sides
            for n in range(sides):
                p = (n + 1) % sides
                self.face((first+n, second+n, second+p, first+p), tile, smooth=sides>8)
        end = start + (len(rings)-1)*sides
        self.face(tuple(end+n for n in reversed(range(sides))), tile, ((.5,.5),) * sides)

    def build(self, name, atlas):
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata(self.vertices, [], self.faces)
        mesh.update()
        uv = mesh.uv_layers.new(name="Paint")
        for polygon, (tile, uvs, smooth) in zip(mesh.polygons, self.paint):
            polygon.use_smooth = smooth
            x = (tile % 4) * TILE
            y = (tile // 4) * TILE
            for index, (u, v) in zip(polygon.loop_indices, uvs):
                uv.data[index].uv = ((x + 3 + u*(TILE-6))/ATLAS, (y + 3 + v*(TILE-6))/ATLAS)

        material = bpy.data.materials.new(name + " paint")
        material.use_nodes = True
        nodes = material.node_tree.nodes
        paint = nodes.new("ShaderNodeTexImage")
        paint.image = atlas
        surface = nodes.get("Principled BSDF")
        surface.inputs["Metallic"].default_value = .27
        surface.inputs["Roughness"].default_value = .54
        material.node_tree.links.new(paint.outputs["Color"], surface.inputs["Base Color"])
        mesh.materials.append(material)
        model = bpy.data.objects.new(name, mesh)
        bpy.context.collection.objects.link(model)
        return model


def read_hull_paint(key, scratch):
    """Use the existing ship's embedded albedo rather than synthesizing its wear pattern."""
    raw = (PLAYER_HULLS / (key + ".glb")).read_bytes()
    size, = unpack_from("<I", raw, 12)
    document = json.loads(raw[20:20+size])
    view = document["bufferViews"][document["images"][0]["bufferView"]]
    offset = 28 + size + view.get("byteOffset", 0)
    path = scratch / (key + "-paint.png")
    path.write_bytes(raw[offset:offset+view["byteLength"]])
    image = bpy.data.images.load(str(path), check_existing=False)
    width, height = image.size
    pixels = np.empty(width * height * 4, dtype=np.float32)
    image.pixels.foreach_get(pixels)
    pixels = pixels.reshape((height, width, 4))
    # Patch coordinates refer to a 440px atlas proof. Read shared bolt, bevel and seam detail.
    samples = ((258,356),(170,140)) if key=="dreadnought" else ((90,332),(342,124))
    panels = []
    for x, y in samples:
        column = np.linspace(x, x+23, TILE) * width / 440
        row = (440 - np.linspace(y+23, y, TILE)) * height / 440
        panel = pixels[row.astype(int)[:, None], column.astype(int), :3]
        luma = panel @ np.array((.2126, .7152, .0722))
        variation = (luma - np.median(luma)) / max(.05, np.std(luma))
        panels.append(np.clip(1 + variation * .29, .40, 1.53).astype(np.float32))
    bpy.data.images.remove(image)
    return panels


def paint_atlas(name, tiles, scratches, scratch):
    rng = np.random.default_rng(11)
    y, x = np.mgrid[:TILE, :TILE]
    pixels = np.ones((ATLAS, ATLAS, 4), dtype=np.float32)
    for i, (color, pattern) in enumerate(tiles):
        rgb = np.array([int(color[n:n+2], 16)/255 for n in (0, 2, 4)])
        brush = 1 + rng.normal(0, .025, (TILE, TILE)) + .025*np.sin(y*.7)
        if pattern == "plate":
            seam = ((x % 29 == 7) | (y % 28 == 10))
            brush -= seam*.14
            brush += ((x % 29 == 8) | (y % 28 == 11))*.05
            brush += ((x//29+y//28) % 3)*.035
            brush *= np.rot90(scratches[i % len(scratches)], i // 2)
        elif pattern == "ribs":
            brush -= (y % 9 < 2)*.23
            brush += (y % 9 == 2)*.11
            brush *= .38 + scratches[i % len(scratches)] * .62
        elif pattern == "cells":
            brush = 1 + .18*np.sin(x*.33 + y*.04) - ((x % 23 < 2) | (y % 28 < 2))*.52
            brush += ((x % 23 == 2) | (y % 28 == 2))*.28
        sx, sy = (i % 4)*TILE, (i // 4)*TILE
        pixels[sy:sy+TILE, sx:sx+TILE, :3] = np.clip(brush[...,None] * rgb, 0, 1)
    generated = bpy.data.images.new(name, width=ATLAS, height=ATLAS, alpha=False)
    generated.pixels.foreach_set(pixels.flatten())
    generated.filepath_raw = str(scratch / (name + ".png"))
    generated.file_format = "PNG"
    generated.save()
    texture = bpy.data.images.load(generated.filepath_raw, check_existing=False)
    texture.pack()
    return texture


def rocky():
    hull = Hull()
    random = Random(604)
    for side in (-1, 1):
        x = side*40
        hull.tube(x, 0, [(-142,7,5),(-119,16,11),(-70,23,15),(62,23,15),(106,17,11),(136,8,6),(143,5,4)], 0, 8)
        hull.box((x, 3, -12), (36, 186, 10), 3)
        # Lengthwise spars and overlapping plates give the silhouette its open twin-prong look.
        for lane in range(-2, 3):
            dx = lane*7
            length = 276 - abs(lane)*13
            height = 13 - abs(lane)*2
            hull.box((x+dx, random.uniform(-3,3), height), (4.2, length, 4), 1 + (lane % 2))
            for j in range(8):
                y = -121 + j*33 + random.uniform(-4,4)
                hull.box((x+dx, y, height+3), (5.3, random.uniform(9,19), random.uniform(2.5,6)), random.choice((1,2,4)))
        for rail in (-1,1):
            for y in range(-100, 110, 21):
                hull.box((x+rail*21, y, 1), (4, 13, 14), 3)
                hull.box((x+rail*22, y-4, 4), (3, 8, 3), 2)
        for y in (-35,-13,9,31):
            hull.box((x, y, 2), (48, 8, 30), 0)
            hull.box((x, y+1, 18), (44, 6, 5), 4)
            hull.box((x+side*20, y+1, 8), (8, 10, 22), 1)
        hull.box((x, -122, 2), (18, 13, 14), 5)
        hull.box((x, -129, 3), (10, 1.9, 8), 6)
    for y in (-28,-8,12,32):
        hull.box((0,y,1), (65, 7, 13), 3)
        hull.box((0,y,9), (60, 3, 5), 1)
    hull.box((0,4,5), (22, 70, 12), 0)
    hull.box((0,24,13), (15, 27, 6), 4)
    hull.box((0,31,16), (9, 13, 2), 7)
    return hull


def grace():
    hull = Hull()
    hull.tube(0, 0, [(-75,12,12),(-54,18,18),(-9,23,23),(69,23,23),(101,16,16),(117,7,7),(131,4,4)], 0, 16)
    hull.tube(0, -11, [(-148,13,13),(-136,17,17),(-116,17,17),(-110,14,14),(-55,14,14),(-48,18,18),(-23,18,18)], 1, 14)
    hull.tube(0, -11, [(-150,7,7),(-147,10,10),(-143,10,10)], 6)
    hull.tube(0, 0, [(97,17,17),(103,17,17),(106,15,15)], 1)
    hull.tube(0, 0, [(119,7,7),(123,7,7),(126,5,5)], 3)
    hull.box((0,65,22), (14,30,5), 1)
    for i in (-1, 0, 1):
        hull.box((i*5,70,25), (3,8,1), 6)
    for y in (-10,3,19,38,55):
        hull.box((0,y,23), (24,4,2), 2 if y<30 else 3)
    for side in (-1,1):
        x = side*34
        hull.tube(x, 1, [(-147,12,12),(-137,16,16),(-100,16,16),(-93,14,14),
                         (-63,14,14),(-60,15.5,15.5),(22,15.5,15.5),(35,19,19),
                         (58,19,19),(78,14,14),(93,8,8)], 0, 14)
        for y, radius in ((-135,16.5),(-110,16.5),(-91,14.5),(-56,16),(-12,16),(36,19.5),(61,18.5)):
            hull.tube(x, 1, [(y-2,radius,radius),(y+2,radius,radius)], 3 if y in (-110,36) else 1)
        hull.tube(x, 1, [(-150,8,8),(-147,12,12),(-141,12,12)], 4)
        hull.tube(x, 1, [(-152,5,5),(-149,8,8),(-147,8,8)], 6)
        hull.box((side*20,30,0), (28,18,11), 1)
        hull.box((side*25,-69,0), (27,10,11), 1)
        hull.box((x,-37,17), (8,55,3), 2)
        for y in (-76,-61,-46,-31,-16):
            hull.box((x+side*7,y,15), (5,8,1.6), 4)
        for row, y in enumerate((36, 50)):
            span = 102 if row==0 else 96
            cx = side*(43 + span/2)
            hull.box((cx,y,-3), (span,14,1.6), 1)
            hull.box((cx,y,-1.9), (span-3,11.5,.8), 5)
            hull.box((cx,y,-4.1), (span-3,11.5,.8), 5)
            for step in (0,1,2,3,4,5,6):
                frame_x = side*(44 + step*(span-2)/6)
                hull.box((frame_x,y,-3), (1.3,14,2.8), 7)
        hull.box((side*79,43,-6), (79,2,2.5), 3)
        hull.box((side*128,43,-3), (2,29,3), 2)
    hull.box((0,-130,-3), (15,25,6), 4)
    hull.box((0,-150,0), (3,26,3), 3)
    hull.box((0,-164,0), (13,2,8), 2)
    return hull


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    with TemporaryDirectory() as tmp:
        for key, shape, palette, reference in (
            ("rockyFlyby", rocky, ROCKY, "dreadnought"),
            ("graceFlyby", grace, GRACE, "mesiahWhite"),
        ):
            bpy.ops.wm.read_factory_settings(use_empty=True)
            atlas = paint_atlas(key, palette, read_hull_paint(reference, Path(tmp)), Path(tmp))
            model = shape().build(key, atlas)
            model.select_set(True)
            bpy.context.view_layer.objects.active = model
            bpy.ops.export_scene.gltf(filepath=str(OUTPUT / (key + ".glb")), export_format="GLB",
                                      use_selection=True, export_animations=False)


if __name__ == "__main__":
    main()
