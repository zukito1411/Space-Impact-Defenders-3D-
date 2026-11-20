"""Reconstruct editable Blender flight hulls from SID3D's registered shapes and paint.

Run from the repository root with Blender 4.3, Pillow, NumPy and SciPy.
blender -b -t 4 --python-exit-code 1 -P scripts/build-flight-hulls.py -- fast gatling
The separate bake script reads the saved .blend, including subsequent hand edits.
"""

import math
import json
import re
import sys
import tempfile
from pathlib import Path

import bpy
import numpy as np
from PIL import Image
from scipy.ndimage import distance_transform_edt, gaussian_filter, map_coordinates

ROOT = Path(__file__).resolve().parents[1]
ART = ROOT / "art/source-ships"
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


# Mount offset, root leading/trailing stations, exposed height, aft sweep,
# outward cant, tip chord. Zero offset specifies a single centerline fin.
TAIL_PROFILES = {
    "rocket": (23, 161, 245, 51, 49, 14, 18),
    "fast": (26, 183, 249, 47, 40, 18, 14),
    "gatling": (0, 165, 247, 57, 57, 0, 18),
    "laser": (43, 159, 250, 50, 55, 12, 9),
    "dreadnought": (30, 139, 249, 64, 63, 14, 27),
    "spaceEt": (0, 144, 250, 68, 63, 0, 21),
    "mesiahBlack": (32, 146, 248, 62, 68, 18, 14),
    "mesiahWhite": (32, 146, 248, 62, 68, 18, 14),
    "mesiahRaptorBlack": (19, 150, 230, 51, 58, 23, 9),
    "mesiahRaptorWhite": (19, 150, 230, 51, 58, 23, 9),
    "coreLander": (0, 105, 174, 44, 41, 0, 13),
    "coreLanderBurning": (13, 114, 180, 43, 43, 10, 11),
}


def build_tail(base, paint, mask, roof, body_height):
    mount, lead, trail, height, _, cant, chord = TAIL_PROFILES[base]
    # Match the actual aft elevation. The previous fins rose 43–68 units
    # regardless of ship length, on top of the existing engine deck.
    aft = int(np.flatnonzero(np.any(mask, axis=1))[-1])
    length = aft - int(np.flatnonzero(np.any(mask, axis=1))[0])
    trail = min(aft - 8, trail + 9)
    lead = trail - min(trail - lead, length * .21)
    lead = int(lead)
    deck = max(3., float(body_height[(lead + trail) // 2, 144 + mount]) - 3)
    crown = float(np.percentile(roof[lead:trail + 1], 96))
    height = min(height * .48, length * .093, max(5., crown - deck))
    chord = min(chord * .73, length * .068)
    sweep = trail - lead - chord * .96
    cant *= .52
    dark = base in ("rocket", "dreadnought", "mesiahBlack", "mesiahRaptorBlack")
    skin = solid("Tail • enamel", (0.095, 0.13, 0.17) if dark else (0.60, 0.66, 0.71))
    if base in ("spaceEt", "laser"):
        color = (0.015, 0.36, 0.62)
    elif base in ("fast", "rocket", "dreadnought", "mesiahBlack", "mesiahWhite"):
        color = (0.88, 0.43, 0.055)
    else:
        color = (0.63, 0.035, 0.027)
    stripe = solid("Tail • squadron flash", color)
    spar = solid("Tail • trailing control surface", (0.055, 0.080, 0.11))
    edge = solid("Tail • leading edge", (0.35, 0.42, 0.47), 0.65)
    for side in ([-1, 1] if mount else [0]):
        verts, faces, slots, uvs = [], [], [], []
        # The thick base forms a fillet. Above it a tapered airfoil carries a
        # leading-edge strip, a high-contrast flash and a separate dark rudder.
        section = [(0, 0), (.13, 1), (.63, .72), (.70, .62), (1, .10),
                   (1, -.10), (.70, -.62), (.63, -.72), (.13, -1)]
        for ring, (t, half_width) in enumerate([(0, 6.0), (.24, 4.8), (.33, 2.9),
                                                 (.72, 2.1), (.82, 1.9), (1, 1.0)]):
            front = lead + sweep * t
            rear = trail + (lead + sweep + chord - trail) * t
            # A cropped crown on the heavy hull and hooked tips on the raptors
            # give the aft profiles different outlines at combat scale.
            if base in ("dreadnought", "gatling"):
                front -= 18 * max(0, (t - .72) / .28)
                rear += 7 * math.sin(math.pi*t)
            elif "Raptor" in base or base == "laser":
                rear -= 14 * math.sin(math.pi*t)
                front += min(3, chord * .30) * t*t
            rear = max(rear, front + chord * .5)
            for along, across in section:
                # Carry a portion of the shoulder armor onto the inset fin panel.
                # The source width comes from each variant's own painted silhouette.
                row = round(lead + (trail-lead)*(.10 + along*.58))
                xs = np.flatnonzero(mask[row])
                outer = (xs[-1]-144) if len(xs) else 24
                u = 144 + (side or 1)*outer*(.22 + .53*t)
                uvs.append(((u+.5)/288, 1-(row+.5)/288))
                x = side * (mount + cant*t) + across*half_width
                y = front + along*(rear-front)
                root_z = body_height[round(y), round(144 + x)] - 2.5
                z = (1-t)*root_z + t*(deck + height)
                verts.append((x, 144-y, z))
            n = len(section)
            if ring:
                for i in range(n):
                    j = (i + 1) % n
                    faces.append(((ring-1)*n+i, (ring-1)*n+j, ring*n+j, ring*n+i))
                    if i in (3, 4, 5):
                        slot = 2  # Rudder
                    elif i in (0, 8):
                        slot = 3  # Leading-edge cap
                    elif ring == 4:
                        slot = 1  # Squadron flash
                    elif i in (1, 2, 6, 7):
                        slot = 4  # Inset painted armor
                    else:
                        slot = 0
                    slots.append(slot)
        faces.extend([tuple(reversed(range(n))), tuple(range(len(verts)-n, len(verts)))])
        obj = mesh_object("Swept stabilizer", verts, faces, [skin, stripe, spar, edge, paint])
        # Section runs clockwise when viewed from above.
        obj.data.flip_normals()
        uv = obj.data.uv_layers.new(name="Reference paint")
        for loop in obj.data.loops:
            uv.data[loop.index].uv = uvs[loop.vertex_index]
        for poly, slot in zip(obj.data.polygons, slots):
            poly.material_index = slot


def build_crosswing(paint, steel, silver, bore, marker, elite):
    ceramic = solid("Engine • ceramic armor", (.66, .69, .70))
    red = solid("Engine • vermilion band", (.60, .028, .016))
    for side in (-1, 1):
        for index, level in enumerate((1, -1)):
            upper = level == 1
            span = 108 if upper else 97
            tip_y = 172 if upper else 220
            tip_z = 52 if upper else -46
            root_y = 148 if upper else 182
            # Each closed airfoil has its own chord, sweep and dihedral.
            # Map its skin onto a matching painted panel in the original livery.
            vertices, uvs = [], []
            for t in (0, .32, .72, 1):
                x = 144 + side * (15 + (span - 15)*t)
                y = root_y + (tip_y - root_y)*t
                z = level*6 + (tip_z - level*6)*t
                chord = 55 - 32*t
                thickness = 4 - 2*t
                for v, h in [(0, 0), (.20, 1), (.82, .62), (1, 0), (.30, -.72)]:
                    vertices.append((x-144, 144-y-v*chord, z+h*thickness))
                    u = 144 + side*(35 + (54 if upper else 45)*t)
                    front = (153 - 32*t) if upper else (193 + 44*t)
                    back = (194 - 41*t) if upper else (224 + 33*t)
                    uvs.append(((u+.5)/288, 1-(front + (back-front)*v+.5)/288))
            faces = [(5*r+i, 5*(r+1)+i, 5*(r+1)+(i+1)%5, 5*r+(i+1)%5)
                     for r in range(3) for i in range(5)]
            faces += [tuple(range(5)), tuple(reversed(range(15, 20)))]
            foil = mesh_object(f"S-foil {side:+}/{level:+}", vertices, faces, [paint, steel])
            if side > 0:
                foil.data.flip_normals()
            uv = foil.data.uv_layers.new(name="Reference paint")
            for loop in foil.data.loops:
                uv.data[loop.index].uv = uvs[loop.vertex_index]
            for poly in foil.data.polygons:
                if poly.index % 5 in (3, 4) or poly.index >= 15:
                    poly.material_index = 1

            x = 144 + side*span
            muzzle = tip_y - (101 if upper else 113)
            turned_part("Foil-tip laser", x, tip_z, [
                (tip_y+24, 2.7, 0), (tip_y+18, 4.1, 1), (tip_y+1, 4.1, 0),
                (tip_y-3, 4.3, 2), (tip_y-7, 3.0, 1), (tip_y-30, 2.7, 0),
                (tip_y-32, 1.9, 1), (muzzle+9, 1.65, 1), (muzzle+8, 2.6, 0),
                (muzzle, 2.5, 1), (muzzle, 1.3, 1), (muzzle+3, 1.1, 3)],
                [steel, silver, red, bore], 20)
            marker(f"Wing tip {int(side > 0)*2 + index+1}", x, muzzle, tip_z)

            engine_x, engine_z = 144 + side*24, level*15
            outlet = 262 if upper else 255
            # Intake recess, enamel nacelle, exposed drive rings and exhaust bell.
            rings = [(160, 6.5, 3), (150, 8, 3), (150, 10.5, 1), (154, 11.4, 0),
                     (162, 11.4, 0), (163, 11.5, 2), (169 if elite else 166, 11.5, 2),
                     (172, 11.3, 0), (203, 10.6, 0), (208, 9.1, 1), (212, 8.5, 3)]
            for y in range(215, 240, 6):
                rings.extend([(y, 9.2, 1), (y+2, 9.2, 1), (y+3, 8.0, 3)])
            rings.extend([(245, 8.3, 3), (outlet-3, 9.4, 1), (outlet, 9.4, 1),
                          (outlet, 7.2, 2), (outlet-4, 5.6, 3)])
            # The first segment turns back into the intake. The main barrel runs aft.
            engine = turned_part("Split drive nacelle", engine_x, engine_z, rings,
                                 [ceramic, steel, red, bore])
            engine.data.flip_normals()
            marker(f"Nozzle {int(side > 0)*2 + index+1}", engine_x, outlet, engine_z, 15)


def blueprint(key, file):
    version = 8 if key in ("mesiahBlack", "mesiahWhite") else 7
    atlas = Image.open(ART / "banking" / f"{key}-v{version}.webp")
    cell = atlas.crop((1344, 0, 1792, 448)).convert("RGBA")
    bounds = cell.getchannel("A").point(lambda a: 255 if a >= 96 else 0).getbbox()
    # Keep the painted markings; match their tonal range to the 1.0.43 level-flight frame.
    image = Image.open(file).convert("RGBA")
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
    reference = np.asarray(cell)
    reference = reference[reference[:, :, 3] >= 180, :3]
    weights = np.array([.2126, .7152, .0722])
    lightness = paint @ weights
    stops = [7, 30, 60, 88, 98]
    original = np.percentile(lightness[mask], stops)
    target = np.percentile(reference @ weights, stops)
    correction = np.interp(lightness, original, np.clip(target-original, -20, 20))
    chroma = paint - lightness[:, :, None]
    paint = np.uint8(np.clip((lightness + .65 * correction)[:, :, None] + 1.065 * chroma, 0, 255))
    paint[~mask] = paint[tuple(nearest[:, ~mask])]
    return paint, mask, list(map(float, transform))


def load_elevation(key, mask, registration):
    """Register the authored side elevation to the flight model's nose and exhaust datum."""
    stems = {"rocket": "black-comet", "fast": "red-wraith", "gatling": "crimson-saw",
             "laser": "night-lance", "dreadnought": "obsidian-ark", "spaceEt": "space-jet",
             "xwing": "crosswing-nova", "mesiahBlack": "mesiah", "mesiahWhite": "mesiah-white",
             "mesiahRaptorBlack": "mesiah-raptor-black", "mesiahRaptorWhite": "mesiah-raptor-white",
             "coreLander": "core-lander", "coreLanderBurning": "core-lander-burning"}
    base = key.removesuffix("Elite")
    name = stems[base] + ("-elite" if key.endswith("Elite") else "")
    source = ART / "sideview" / (name + "-v1.png")
    with Image.open(source) as raw:
        rgba = raw.convert("RGBA")
        bounds = rgba.getchannel("A").point(lambda a: 255 if a >= 100 else 0).getbbox()
        image = rgba.crop(bounds)
        image.thumbnail((768, 768), Image.Resampling.LANCZOS)
    alpha = np.asarray(image.getchannel("A")) > 100
    h, w = alpha.shape
    front, rear = np.where(mask)[0][[0, -1]]
    # Use the nose center as the waterline. A tall fin must not move the engine axis.
    row, _ = np.where(alpha[:, int(w * .83):int(w * .94)])
    datum = float(np.median(row))
    unit = (rear - front) / (w - 1) * registration[1] / registration[0]
    station = np.clip(np.rint((rear - np.arange(288)) / (rear - front) * (w - 1)), 0, w - 1).astype(int)
    roof, keel = [], []
    for col in station:
        occupied = np.flatnonzero(alpha[:, col])
        if occupied.size:
            runs = np.split(occupied, np.where(np.diff(occupied) > 1)[0] + 1)
            center = min(runs, key=lambda run: np.min(abs(run - datum)))
            roof.append(4 + (datum - center[0]) * unit)
            keel.append(4 + (datum - center[-1]) * unit)
        else:
            roof.append(5.)
            keel.append(3.)
    nearest = distance_transform_edt(~alpha, return_distances=False, return_indices=True)
    colors = np.array(image.convert("RGB"))
    colors[~alpha] = colors[tuple(nearest[:, ~alpha])]
    return colors, (front, rear, datum, unit), gaussian_filter(roof, 1), gaussian_filter(keel, 1)


def pack_paint(nodes, name, pixels):
    node = nodes.new("ShaderNodeTexImage")
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / (name + ".png")
        Image.fromarray(pixels).save(path)
        node.image = bpy.data.images.load(str(path))
        node.image.pack()
        node.image.filepath = "//" + path.name
    node.extension = "EXTEND"
    return node


def fit_side_uv(obj, registration, pixels):
    front, rear, datum, unit = registration
    uv = obj.data.uv_layers.new(name="Side elevation")
    h = pixels.shape[0]
    for loop in obj.data.loops:
        point = obj.data.vertices[loop.vertex_index].co
        u = (rear - (144 - point.y)) / (rear - front)
        v = 1 - (datum - (point.z - 4) / unit + .5) / h
        uv.data[loop.index].uv = (u, v)


def finish_livery(key, material, top, side):
    tree = material.node_tree
    nodes = tree.nodes
    dorsal = pack_paint(nodes, key + "-dorsal", top)
    flank = pack_paint(nodes, key + "-flank", side)
    for node, uv_name in [(dorsal, "Reference paint"), (flank, "Side elevation")]:
        coords = nodes.new("ShaderNodeUVMap")
        coords.uv_map = uv_name
        tree.links.new(coords.outputs["UV"], node.inputs["Vector"])
    # Projection is fixed to the part, so the livery stays put as the ship banks.
    geom = nodes.new("ShaderNodeNewGeometry")
    local = nodes.new("ShaderNodeVectorTransform")
    local.vector_type = "NORMAL"
    local.convert_from, local.convert_to = "WORLD", "OBJECT"
    tree.links.new(geom.outputs["Normal"], local.inputs[0])
    axis = nodes.new("ShaderNodeSeparateXYZ")
    tree.links.new(local.outputs[0], axis.inputs[0])
    magnitude = nodes.new("ShaderNodeMath")
    magnitude.operation = "ABSOLUTE"
    tree.links.new(axis.outputs["X"], magnitude.inputs[0])
    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.interpolation = "EASE"
    ramp.color_ramp.elements[0].position = .24
    ramp.color_ramp.elements[1].position = .68
    tree.links.new(magnitude.outputs[0], ramp.inputs[0])
    mix = nodes.new("ShaderNodeMixRGB")
    tree.links.new(ramp.outputs[0], mix.inputs[0])
    tree.links.new(dorsal.outputs["Color"], mix.inputs[1])
    tree.links.new(flank.outputs["Color"], mix.inputs[2])
    shader = nodes.get("Principled BSDF")
    tree.links.new(mix.outputs[0], shader.inputs["Base Color"])
    tree.links.new(mix.outputs[0], shader.inputs["Emission Color"])
    shader.inputs["Emission Strength"].default_value = .39
    shader.inputs["Roughness"].default_value = .44
    nodes.active = dorsal
    return dorsal


def belly_livery(key, rgb, mask, root):
    # Sample the painted structural shoulders for underside panels. Keep cockpit
    # glass, dorsal markings and insignia off the ventral centerline.
    y, x = np.indices(mask.shape)
    shoulder = (144 + np.where(x < 144, -1, 1) * (root * .78 + abs(x - 144) * .42)).astype(int)
    shoulder = np.clip(shoulder, 0, 287)
    base = rgb[y, shoulder].astype(float)
    mid = abs(x - 144) < root * .77
    armor = np.where(mid[:, :, None], base, rgb.astype(float))
    # Swept service panels flank the keel. The center strip carries recessed vents.
    span = abs(x - 144)
    seam = ((y + (span * .52).astype(int)) % 34 < 1) & (span > root * .25)
    vents = (span < root * .30) & (y > 133) & (y < 222) & (y % 8 < 3)
    gain = np.where(vents, .43, np.where(seam, .68, .88))
    return np.uint8(np.clip(armor * gain[:, :, None], 0, 255))


def build(key, file):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    base = key.removesuffix("Elite")
    turret = base in ("fast", "gatling")
    cy, rx, ry, root = PROFILES[base]
    if base.startswith("coreLander") and key.endswith("Elite"):
        cy, rx, ry, root = (107, 10, 21, 23)
    rgb, mask, registration = blueprint(key, file)
    paint = solid("Original flight livery", (0.5, 0.5, 0.5), 0.08)
    side_paint, side_registration, roof, keel = load_elevation(key, mask, registration)
    dorsal = finish_livery(key, paint, rgb, side_paint)
    underside = paint.copy()
    underside.name = "Ventral service panels"
    belly = pack_paint(underside.node_tree.nodes, key + "-belly", belly_livery(key, rgb, mask, root))
    old_dorsal = underside.node_tree.nodes[dorsal.name]
    for link in list(old_dorsal.outputs["Color"].links):
        underside.node_tree.links.new(belly.outputs["Color"], link.to_socket)
    underside.node_tree.links.new(old_dorsal.inputs["Vector"].links[0].from_socket, belly.inputs["Vector"])
    underside.node_tree.nodes.remove(old_dorsal)
    underside.node_tree.nodes.active = belly
    steel = solid("Machined gunmetal", (0.12, 0.15, 0.19), 0.6)
    silver = solid("Turned steel lip", (0.48, 0.53, 0.58), 0.55)
    accent = solid(
        "Collar finish", (0.76, 0.39, 0.055) if base == "fast" else (0.30, 0.055, 0.065), 0.45
    )
    bore = solid("Recessed bore", (0.009, 0.012, 0.018), 0.18)
    bells = [] if base == "xwing" else outlets(key)
    if base == "xwing":
        # Retain the painted nose and cockpit. Four independent foil/engine assemblies
        # replace the wings and nacelles in the flat reference.
        yy, xx = np.indices(mask.shape)
        mask &= abs(xx - 144) <= np.interp(yy, [12, 118, 155, 220, 249, 266], [12, 21, 22, 20, 13, 6])
        mask[263:] = False
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
    # Deepen the pressure hull amidships, tapering the belly towards both ends.
    midship = np.exp(-((iy - 153) / 83) ** 4) * edge * body
    bottom -= 10 * midship
    height += 4 * midship
    # The fin is a separate airfoil. Use the forebody and engine deck for the
    # pressure vessel so that the tail is not duplicated as a ridge down the spine.
    main_roof = np.minimum(roof, np.interp(np.arange(288), [0, cy, 170, 287],
                                           [10, max(24, rx * 2.7), root * .79, 11]))
    crown = np.sqrt(np.clip(1 - (offset / (root * 1.05)) ** 2, 0, 1))
    height = np.maximum(height * .79, 2 + np.maximum(main_roof[:, None] - 2, 0) * crown * edge)
    bottom = np.minimum(bottom * .72, -2 + np.minimum(keel[:, None] + 2, 0) * crown * edge)
    # An inset channel between two keel rails gives the belly its own cross-section.
    rails = np.exp(-((offset - root*.33) / 2.8)**2)
    underside_run = np.exp(-((iy-172)/58)**4) * edge
    bottom -= 2.6 * rails * underside_run
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
        vertices = np.vstack(
            [
                np.column_stack((x - 144, 144 - y, top)),
                np.column_stack((x - 144, 144 - y, bot)),
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
        obj = mesh_object(name, vertices.tolist(), meshfaces, [paint, underside])
        uv = obj.data.uv_layers.new(name="Reference paint")
        uv_table = np.column_stack(((x + 0.5) / 288, 1 - (y + 0.5) / 288))
        loop_index = np.empty(len(obj.data.loops), dtype=np.int32)
        obj.data.loops.foreach_get("vertex_index", loop_index)
        uv.data.foreach_set("uv", uv_table[loop_index % count].astype("f").ravel())
        for face in obj.data.polygons:
            face.use_smooth = face.index < len(faces) * 2
            if len(faces) <= face.index < len(faces) * 2:
                face.material_index = 1

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
        build_crosswing(paint, steel, silver, bore, marker, key.endswith("Elite"))
    elif not base.startswith("coreLander"):
        build_tail(base, paint, mask, roof, height)
    for obj in bpy.context.scene.objects:
        if obj.type == "MESH" and paint.name in obj.data.materials:
            fit_side_uv(obj, side_registration, side_paint)
            obj.data.uv_layers.active = obj.data.uv_layers.get("Reference paint")
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
    files = {key: ART / filename for key, filename in json.loads((ART / "manifest.json").read_text()).items()}
    for ship in sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sorted(files):
        build(ship, files[ship])
