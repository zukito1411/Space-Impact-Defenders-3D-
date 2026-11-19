"""Reconstruct editable Blender flight hulls from SID3D's registered shapes and paint.

Run from the repository root with Blender 4.3, Pillow, NumPy and SciPy.
blender -b -t 4 --python-exit-code 1 -P scripts/build-flight-hulls.py -- fast gatling
The separate bake script reads the saved .blend, including subsequent hand edits.
"""

import math
import re
import sys
import tempfile
from pathlib import Path

import bpy
import numpy as np
from PIL import Image
from scipy.ndimage import distance_transform_edt, gaussian_filter, map_coordinates

ROOT = Path(__file__).resolve().parents[1]
ART = ROOT / "public/assets/ships"
MODELS = ROOT / "art/3d/flight-hulls"
# Centerline cockpit (center y, half-width, half-length), wing root half-width.
PROFILES = {
    "rocket": (98, 12, 32, 30),
    "fast": (121, 10, 21, 22),
    "gatling": (122, 10, 30, 23),
    "laser": (102, 16, 40, 23),
    "dreadnought": (108, 10, 40, 39),
    "spaceEt": (133, 10, 37, 28),
    "xwing": (144, 10, 32, 20),
    "mesiahBlack": (91, 8, 31, 34),
    "mesiahWhite": (91, 8, 31, 34),
    "mesiahRaptorBlack": (112, 11, 36, 38),
    "mesiahRaptorWhite": (112, 11, 36, 38),
    "coreLander": (73, 9, 20, 29),
    "coreLanderBurning": (81, 9, 21, 30),
}


# Recessed exhaust interiors use the actual hardpoints on each top painting.
def outlets(key):
    if key.startswith("coreLander") and key.endswith("Elite"):
        return [(144, 233 if key == "coreLanderElite" else 227, 19)]
    if key.startswith("xwing"):
        return [(120, 272, 17), (144, 271, 11), (168, 272, 17)]
    source = (ROOT / "src/components/games/raid/shipArtwork.ts").read_text()
    if key == "mesiahBlack":
        line = re.search(r"const mesiahBlackNozzles = (.+)", source)[1]
    else:
        line = re.search(r"^  " + key + r": (\[.+\])", source, re.MULTILINE)[1]
    return [tuple(map(int, m)) for m in re.findall(r"nozzle\((\d+), (\d+), (\d+)\)", line)]


def solid(name, rgb, metal=0.3):
    material = bpy.data.materials.new(name)
    material.diffuse_color = (*rgb, 1)
    material.use_nodes = True
    shader = material.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*rgb, 1)
    shader.inputs["Metallic"].default_value = metal
    shader.inputs["Roughness"].default_value = 0.34
    return material


def mesh_object(name, verts, faces, materials):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    for mat in materials:
        mesh.materials.append(mat)
    return obj


def turned_part(name, x, z, rings, materials, sides=24):
    """Turn a profile along the flight axis. Ring pairs may double back to form an open lip."""
    verts, faces, slots = [], [], []
    for index, (y, radius, slot) in enumerate(rings):
        for i in range(sides):
            angle = math.tau * i / sides
            verts.append((x - 144 + radius * math.cos(angle), 144 - y, z + radius * math.sin(angle)))
        if index:
            for i in range(sides):
                j = (i + 1) % sides
                faces.append(
                    (
                        (index - 1) * sides + i,
                        (index - 1) * sides + j,
                        index * sides + j,
                        index * sides + i,
                    )
                )
                slots.append(slot)
    # The first and last caps sit inside the socket/recess.
    faces.extend([tuple(reversed(range(sides))), tuple(range(len(verts) - sides, len(verts)))])
    obj = mesh_object(name, verts, faces, materials)
    # Inward-facing lathe profiles are reversed when the axial direction changes.
    if rings[1][0] < rings[0][0]:
        obj.data.flip_normals()
    for face, slot in zip(obj.data.polygons, slots):
        face.material_index = slot
        face.use_smooth = True
    obj.data.polygons[-1].material_index = len(materials) - 1
    return obj


def blueprint(key, file):
    atlas = Image.open(ART / "banking" / f"{key}-v7.webp")
    cell = atlas.crop((1344, 0, 1792, 448)).convert("RGBA")
    bounds = cell.getchannel("A").point(lambda a: 255 if a >= 96 else 0).getbbox()
    # Crosswing's flight mesh has open S-foils. Retain its actual planform and markings.
    image = (cell if key.startswith("xwing") else Image.open(file)).convert("RGBA")
    image = image.resize((288, 288), Image.Resampling.LANCZOS)
    mask = np.asarray(image.getchannel("A")) >= 96
    sy, sx = np.where(mask)
    scale_x = (bounds[2] - bounds[0]) / (sx.max() - sx.min() + 1)
    scale_y = (bounds[3] - bounds[1]) / (sy.max() - sy.min() + 1)
    transform = [
        scale_x,
        scale_y,
        bounds[0] - scale_x * (sx.min() - 0.5),
        bounds[1] - scale_y * (sy.min() - 0.5),
    ]
    # Extend edge paint under the UV seam so the side panels sample opaque colors.
    nearest = distance_transform_edt(~mask, return_distances=False, return_indices=True)
    paint = np.array(image.convert("RGB"))
    paint[~mask] = paint[tuple(nearest[:, ~mask])]
    return paint, mask, list(map(float, transform))


def build(key, file):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    base = key.removesuffix("Elite")
    turret = base in ("fast", "gatling")
    cy, rx, ry, root = PROFILES[base]
    if base.startswith("coreLander") and key.endswith("Elite"):
        cy, rx, ry, root = (107, 10, 21, 23)
    rgb, mask, registration = blueprint(key, file)
    paint = solid("Original flight livery", (0.5, 0.5, 0.5), 0.08)
    nodes = paint.node_tree.nodes
    tex = nodes.new("ShaderNodeTexImage")
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / f"{key}-livery.png"
        Image.fromarray(rgb).save(path)
        tex.image = bpy.data.images.load(str(path))
        tex.image.pack()
        tex.image.filepath = "//" + path.name
    nodes.active = tex
    shader = nodes.get("Principled BSDF")
    paint.node_tree.links.new(tex.outputs["Color"], shader.inputs["Base Color"])
    paint.node_tree.links.new(tex.outputs["Color"], shader.inputs["Emission Color"])
    shader.inputs["Emission Strength"].default_value = 0.56
    shader.inputs["Roughness"].default_value = 0.52
    steel = solid("Machined gunmetal", (0.12, 0.15, 0.19), 0.6)
    silver = solid("Turned steel lip", (0.48, 0.53, 0.58), 0.55)
    accent = solid(
        "Collar finish", (0.76, 0.39, 0.055) if base == "fast" else (0.30, 0.055, 0.065), 0.45
    )
    bore = solid("Recessed bore", (0.009, 0.012, 0.018), 0.18)
    bells = outlets(key)
    # Remove the painted forward tubes so no wedge remains behind the physical gun assembly.
    if turret:
        mask[:76, 116:173] = False
    dist = distance_transform_edt(mask) - distance_transform_edt(~mask)
    iy, ix = np.indices(mask.shape)
    offset = abs(ix - 144)
    body = np.exp(-((offset / (root * 0.87)) ** 2))
    edge = np.clip((dist + 1) / 9, 0, 1)
    cockpit = np.clip(1 - ((ix - 144) / rx) ** 2 - ((iy - cy) / ry) ** 2, 0, 1)
    height = 1.8 + edge * (2.8 + body * 13) + np.sqrt(cockpit) * 9
    # Thick dorsal nacelles and thin outboard trailing edges give an actual section to the wing.
    for x, y, width in bells:
        height += 8 * np.exp(-(((ix - x) / (width * 0.58)) ** 2) - ((iy - y + 25) / 39) ** 4) * edge
    luminance = rgb @ np.array([0.2126, 0.7152, 0.0722]) / 255
    height += (
        np.clip((gaussian_filter(luminance, 1) - gaussian_filter(luminance, 5)) * 4, -1.6, 1.6) * edge
    )
    # Raise the painted wing armor above a recessed seam at the root and leading edge.
    plate = np.clip((dist - 2.5) / 3.5, 0, 1) * np.clip((offset - root - 2) / 4, 0, 1)
    height += 2.2 * plate
    bottom = -1.8 - edge * (1.6 + body * 8)
    field = {
        "Hull": ([], [], {}),
        "Canopy": ([], [], {}),
        "Port wing": ([], [], {}),
        "Starboard wing": ([], [], {}),
    }
    # Clip every surface triangle to the iso-contour. Both skins use the same boundary.
    step = 3

    def add(part, points):
        faces, coords, cache = field[part]
        ids = []
        for x, y in points:
            tag = (round(x, 4), round(y, 4))
            if tag not in cache:
                cache[tag] = len(coords)
                coords.append(tag)
            ids.append(cache[tag])
        if len(set(ids)) >= 3:
            faces.append(tuple(reversed(list(dict.fromkeys(ids)))))

    for y in range(0, 288 - step, step):
        for x in range(0, 288 - step, step):
            corners = [(x, y), (x + step, y), (x + step, y + step), (x, y + step)]
            values = [dist[b, a] for a, b in corners]
            if max(values) < 0:
                continue
            part = (
                "Port wing"
                if x + step / 2 < 144 - root
                else "Starboard wing"
                if x + step / 2 > 144 + root
                else "Canopy"
                if cockpit[y + 1, x + 1] > 0.03
                else "Hull"
            )
            if min(values) > 0:
                add(part, corners)
                continue
            for tri in [(0, 1, 2), (0, 2, 3)]:
                poly = []
                for a, b in zip(tri, tri[1:] + tri[:1]):
                    if values[a] > 0:
                        poly.append(corners[a])
                    if (values[a] > 0) != (values[b] > 0):
                        t = values[a] / (values[a] - values[b])
                        poly.append(
                            tuple(corners[a][i] + t * (corners[b][i] - corners[a][i]) for i in (0, 1))
                        )
                if len(poly) >= 3:
                    add(part, poly)
    for name, (faces, coords, _) in field.items():
        if not coords:
            continue
        xy = np.array(coords)
        x, y = xy.T
        top = map_coordinates(height, [y, x], order=1)
        bot = map_coordinates(bottom, [y, x], order=1)
        wing = name.endswith("wing")
        # Crosswing's paired foils open above and below the longitudinal centerline.
        split = np.maximum(abs(x - 144) - root, 0) * 0.30 if base == "xwing" and wing else 0
        for lower in [False, True] if base == "xwing" and wing else [False]:
            shift = -split if lower else split
            vertices = np.vstack(
                [
                    np.column_stack((x - 144, 144 - y, top + shift)),
                    np.column_stack((x - 144, 144 - y, bot + shift)),
                ]
            )
            count = len(x)
            meshfaces = list(faces)
            meshfaces.extend(tuple(i + count for i in reversed(f)) for f in faces)
            border = set()
            for face in faces:
                for a, b in zip(face, face[1:] + face[:1]):
                    if (b, a) in border:
                        border.remove((b, a))
                    else:
                        border.add((a, b))
            meshfaces.extend((b, a, a + count, b + count) for a, b in sorted(border))
            obj = mesh_object(("Lower " if lower else "") + name, vertices.tolist(), meshfaces, [paint])
            uv = obj.data.uv_layers.new(name="Reference paint")
            uv_table = np.column_stack(((x + 0.5) / 288, 1 - (y + 0.5) / 288))
            loop_index = np.empty(len(obj.data.loops), dtype=np.int32)
            obj.data.loops.foreach_get("vertex_index", loop_index)
            uv.data.foreach_set("uv", uv_table[loop_index % count].astype("f").ravel())
            for face in obj.data.polygons:
                face.use_smooth = face.index < len(faces) * 2

    def marker(name, x, y, z, width=0):
        obj = bpy.data.objects.new(name, None)
        bpy.context.scene.collection.objects.link(obj)
        obj.location = (x - 144, 144 - y, z)
        obj.empty_display_size = 1.5
        obj["aperture"] = width

    for i, (x, y, w) in enumerate(bells):
        r = w * 0.49
        z = 4 if base.startswith("coreLander") else 5
        turned_part(
            f"Exhaust {i + 1} • shroud and recessed bell",
            x,
            z,
            [
                (y - 15, r * 0.93, 0),
                (y - 9, r, 0),
                (y - 7, r * 1.07, 1),
                (y - 5, r * 0.97, 0),
                (y - 2, r, 0),
                (y, r, 1),
                (y, r * 0.76, 1),
                (y - 4, r * 0.62, 3),
            ],
            [steel, silver, accent, bore],
        )
        marker(f"Nozzle {i + 1}", x, y, z, w)
    if turret:
        bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=13.5, depth=9, location=(0, 66, 9))
        pivot = bpy.context.object
        pivot.name = "Turret • recessed mounting ring"
        pivot.data.materials.append(steel)
        bevel = pivot.modifiers.new("Machined rim", "BEVEL")
        bevel.width = 1
        bevel.segments = 2
        for dx in [-10, 0, 10]:
            tip = 14 if dx == 0 else 25
            r = 6.1 if dx == 0 else 3.7
            z = 12 if dx == 0 else 8
            turned_part(
                "Turret • " + {0: "main cannon", -10: "port tube", 10: "starboard tube"}[dx],
                144 + dx,
                z,
                [
                    (80, r * 1.22, 0),
                    (74, r * 1.36, 2),
                    (69, r * 1.36, 2),
                    (67, r, 1),
                    (57, r, 0),
                    (56, r * 1.08, 1),
                    (53, r * 1.08, 0),
                    (52, r * 0.92, 1),
                    (tip + 13, r * 0.92, 0),
                    (tip + 12, r, 1),
                    (tip + 8, r, 0),
                    (tip + 7, r * 1.16, 1),
                    (tip + 3, r * 1.16, 0),
                    (tip, r, 1),
                    (tip, r * 0.67, 1),
                    (tip + 4, r * 0.62, 3),
                ],
                [steel, silver, accent, bore],
            )
        for side in [-1, 1]:
            for dx, tip in [(37, 79), (60, 97)] if base == "fast" else [(38, 101)]:
                r = 5.4 if base == "fast" else 6.3
                turned_part(
                    f"Wing launcher {side * dx:+}",
                    144 + side * dx,
                    7,
                    [
                        (tip + 31, r, 0),
                        (tip + 12, r, 0),
                        (tip + 10, r * 1.05, 1),
                        (tip + 4, r * 0.95, 0),
                        (tip + 1, r * 0.81, 2),
                        (tip, r * 0.60, 1),
                        (tip + 3, r * 0.44, 3),
                    ],
                    [steel, silver, accent, bore],
                )
    if base == "xwing":
        for side in [-1, 1]:
            for j, sign in enumerate([1, -1]):
                x = 144 + side * 82
                z = sign * 19 + 2
                turned_part(
                    f"S-foil cannon {side:+}/{sign:+}",
                    x,
                    z,
                    [
                        (181, 2.7, 0),
                        (160, 2.7, 0),
                        (158, 2.2, 1),
                        (144, 2.2, 0),
                        (142, 1.55, 1),
                        (105, 1.55, 0),
                        (103, 1.65, 1),
                        (103, 0.85, 1),
                        (105, 0.7, 3),
                    ],
                    [steel, silver, accent, bore],
                    16,
                )
                marker(f"Wing tip {int(side > 0) * 2 + j + 1}", 144 + side * 82, 103, sign * 19 + 2)
    bpy.context.scene["atlas_transform"] = registration
    bpy.context.scene["reference_art"] = str(file.relative_to(ROOT))
    MODELS.mkdir(parents=True, exist_ok=True)
    from mathutils import Euler

    for area in bpy.context.screen.areas:
        if area.type == "VIEW_3D":
            space = area.spaces.active
            space.clip_end = 3000
            space.region_3d.view_distance = 460
            space.region_3d.view_rotation = Euler((0.38, -0.35, -0.12)).to_quaternion()
            space.shading.color_type = "TEXTURE"
            space.overlay.show_overlays = False
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(MODELS / (key + ".blend")), compress=True)


if __name__ == "__main__":
    paths = (ROOT / "src/components/games/RaidShipSprite.tsx").read_text() + (
        ROOT / "src/components/games/raid/shipArtwork.ts"
    ).read_text()
    files = {
        k: ROOT / "public" / p
        for k, p in re.findall(r"^  (\w+): '(assets/ships/[^']+)'", paths, re.MULTILINE)
        if k.removesuffix("Elite") in PROFILES
    }
    for ship in sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sorted(files):
        build(ship, files[ship])
