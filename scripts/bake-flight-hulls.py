"""Render saved flight .blend models, both selector views and their projected attachments.

blender -b -t 8 --python-exit-code 1 -P scripts/bake-flight-hulls.py [-- fast gatling]
"""

import importlib.util
import json
import math
import sys
import tempfile
from pathlib import Path

import bpy
import numpy as np
from mathutils import Matrix, Vector
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
ART = ROOT / "public/assets/ships"
MODELS = ROOT / "art/3d/flight-hulls"
ANCHORS = ROOT / "src/components/games/raid/bankingAnchors.json"
spec = importlib.util.spec_from_file_location(
    "ship_previews", ROOT / "scripts/build-hd-raid-ship-previews.py"
)
previews = importlib.util.module_from_spec(spec)
spec.loader.exec_module(previews)
CELL = 448


def match_release_paint(sheet, key):
    """Recover the paint contrast of 1.0.43 independently for each camera."""
    version = 8 if key in ("mesiahWhite", "mesiahBlack") else 7
    with Image.open(ART / "banking" / f"{key}-v{version}.webp") as source:
        reference = np.asarray(source.convert("RGBA"))
    pixels = np.array(sheet.convert("RGBA"))
    weights = np.array([.2126, .7152, .0722], dtype=np.float32)
    stops = [3, 20, 50, 80, 96]
    for row in range(2):
        band = pixels[row*CELL:(row+1)*CELL]
        master = reference[row*CELL:(row+1)*CELL]
        target = master[master[:, :, 3] > 224, :3].astype(np.float32)
        rgb = band[:, :, :3].astype(np.float32)
        opaque = band[:, :, 3] > 224
        light = rgb @ weights
        old = np.percentile(light[opaque], stops)
        goal = np.percentile(target @ weights, stops)
        lift = np.interp(light, old, np.clip(goal-old, -24., 40.))
        spread = np.percentile(np.ptp(rgb[opaque], axis=1), 84)
        target_spread = np.percentile(np.ptp(target, axis=1), 84)
        saturation = np.clip(target_spread / max(spread, 1.), 1., 1.52)
        linear = (light + lift*.91)[:, :, None] + (rgb-light[:, :, None])*saturation
        band[:, :, :3] = np.uint8(np.clip(linear, 0, 255))
    return Image.fromarray(pixels)


def bake(key):
    bpy.ops.wm.open_mainfile(filepath=str(MODELS / (key + ".blend")))
    scene = bpy.context.scene
    sx, sy, ox, oy = scene["atlas_transform"]
    model = bpy.data.collections.new("Ship")
    attachments = {"nozzles": [], "wing": []}
    for obj in list(scene.objects):
        if obj.type == "EMPTY":
            group = (
                "nozzles"
                if obj.name.startswith("Nozzle ")
                else "wing"
                if obj.name.startswith("Wing tip ")
                else None
            )
            if group:
                attachments[group].append(
                    (obj.name, obj.matrix_world.translation.copy(), obj["aperture"])
                )
        if obj.type == "MESH":
            model.objects.link(obj)
        for collection in list(obj.users_collection):
            if collection != model:
                collection.objects.unlink(obj)
    if not attachments["nozzles"] or not len(model.objects):
        raise ValueError(f"{key} needs a mesh and exhaust attachment points")
    anchors = {name: [] for name, points in attachments.items() if points}
    camera_data = bpy.data.cameras.new("Flight camera")
    camera_data.type = "ORTHO"
    camera_data.ortho_scale = CELL * 7
    camera_data.clip_end = 6000
    camera = bpy.data.objects.new("Flight camera", camera_data)
    camera.location.z = 3000
    scene.collection.objects.link(camera)
    scene.camera = camera
    # Landscape looks across the upper deck. Even the steepest turn keeps the near wing visible.
    for row, angle in enumerate([0, -56]):
        for col, bank in enumerate([-21, -14, -7, 0, 7, 14, 21]):
            rot = Matrix.Rotation(math.radians(angle + bank), 4, "Y")
            scale = Matrix.Diagonal(Vector((sx, sy, sx, 1)))
            offset_x, offset_y = 144 * sx + ox - CELL / 2, CELL / 2 - 144 * sy - oy
            center = Matrix.Translation(((col - 3) * CELL + offset_x, (0.5 - row) * CELL + offset_y, 0))
            instance = bpy.data.objects.new(f"Flight pose {row + 1}/{col + 1}", None)
            scene.collection.objects.link(instance)
            instance.instance_type = "COLLECTION"
            instance.instance_collection = model
            # Apply anisotropic framing outside the roll via a separate parent.
            frame = bpy.data.objects.new("Camera registration", None)
            scene.collection.objects.link(frame)
            frame.matrix_world = center @ scale
            instance.parent = frame
            instance.matrix_basis = rot
            for group, poses in anchors.items():
                pose = []
                for _, pt, w in sorted(attachments[group]):
                    p = scale @ rot @ pt
                    xy = [round((p.x + offset_x) / CELL, 4), round(-(p.y + offset_y) / CELL, 4)]
                    pose.append(xy + ([round(w * sx / CELL, 4)] if group == "nozzles" else []))
                poses.append(pose)
    # Painted highlights stay vivid under a neutral soft fill. Grazing light describes model depth.
    scene.world = bpy.data.worlds.new("Neutral hangar")
    scene.world.use_nodes = True
    scene.world.node_tree.nodes["Background"].inputs[0].default_value = (0.55, 0.55, 0.55, 1)
    scene.world.node_tree.nodes["Background"].inputs[1].default_value = 0.65
    sun = bpy.data.lights.new("Key", "SUN")
    sun.energy = 1.4
    sun.angle = math.radians(18)
    light = bpy.data.objects.new("Key", sun)
    scene.collection.objects.link(light)
    light.rotation_euler = (0.52, -0.46, -0.25)
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 12
    scene.cycles.max_bounces = 2
    scene.cycles.use_denoising = False
    scene.render.film_transparent = True
    scene.render.resolution_x = CELL * 7
    scene.render.resolution_y = CELL * 2
    scene.render.resolution_percentage = 100
    scene.view_settings.view_transform = "Standard"
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    with tempfile.TemporaryDirectory() as temp:
        scene.render.filepath = str(Path(temp) / "sheet.png")
        bpy.ops.render.render(write_still=True)
        with Image.open(scene.render.filepath) as raw:
            atlas = match_release_paint(raw, key)
            for i in range(14):
                x, y = i % 7 * CELL, i // 7 * CELL
                alpha = atlas.crop((x, y, x + CELL, y + CELL)).getchannel("A")
                bounds = alpha.point(lambda p: 255 if p > 96 else 0).getbbox()
                if not bounds or min(bounds[:2]) < 1 or max(bounds[2:]) >= CELL:
                    raise ValueError(f"{key} pose {i} empty or clipped: {bounds}")
            atlas.save(ART / "banking" / f"{key}-v14.webp", "WEBP", quality=96, method=4, exact=True)
            preview = previews.get_trimmed_view(atlas, True)
            preview.save(ART / "previews" / f"{key}-landscape-v7.webp",
                         "WEBP", quality=96, method=4, exact=True)
    return anchors


if __name__ == "__main__":
    keys = (
        sys.argv[sys.argv.index("--") + 1 :]
        if "--" in sys.argv
        else sorted(p.stem for p in MODELS.glob("*.blend"))
    )
    registrations = json.loads(ANCHORS.read_text())
    for ship in keys:
        registrations[ship] = bake(ship)
    lines = [
        f"  {json.dumps(key)}: " + json.dumps(value, separators=(",", ":"))
        for key, value in registrations.items()
    ]
    ANCHORS.write_text("{\n" + ",\n".join(lines) + "\n}\n")
