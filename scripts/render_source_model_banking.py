#!/usr/bin/env python3
"""Offline Blender 4.3+ source-mesh renderer. Never upsamples old 3D sprites."""
import argparse
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

ROLL_DEGREES = (-21, -14, -7, 0, 7, 14, 21)


def options():
    p = argparse.ArgumentParser()
    p.add_argument("--model", type=Path, required=True)
    p.add_argument("--reference", type=Path, required=True)
    p.add_argument("--ship", required=True)
    p.add_argument("--out", type=Path, required=True)
    p.add_argument("--manifest", type=Path, default=Path("art/3d/render-manifest.json"))
    p.add_argument("--pixels", type=int, default=1024)
    p.add_argument("--samples", type=int, default=64)
    return p.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])


def reference_paint(path):
    """Take representative steel, canopy and warm accent colors from actual 2D art."""
    image = bpy.data.images.load(str(path.resolve()), check_existing=False)
    try:
        pixels = image.pixels[:]
        picked = {"hull": [], "glass": [], "trim": []}
        stride = max(1, len(pixels) // (4 * 20000))
        for i in range(0, len(pixels), 4 * stride):
            r, g, b, a = pixels[i:i+4]
            if a < .75 or max(r, g, b) < .13:
                continue
            if b > r * 1.16 and b > g * .92 and b > .22:
                picked["glass"].append((r,g,b))
            elif r > g * 1.15 and g > b * 1.11 and r > .32:
                picked["trim"].append((r,g,b))
            elif max(r,g,b)-min(r,g,b) < .3 and .24 < max(r,g,b) < .94:
                picked["hull"].append((r,g,b))
        defaults = {"hull": (.67,.72,.78), "glass": (.13,.54,.88), "trim": (.94,.57,.24)}
        return {key: tuple(sorted(row[c] for row in values)[len(values)//2] for c in range(3))
                if values else defaults[key] for key,values in picked.items()}
    finally:
        bpy.data.images.remove(image)


def material_color_match(palette):
    for material in bpy.data.materials:
        if not material.use_nodes:
            continue
        name = material.name.lower()
        category = ("glass" if any(x in name for x in ("glass","canopy","cockpit","window"))
                    else "trim" if any(x in name for x in ("trim","orange","gold","accent","stripe"))
                    else "hull" if any(x in name for x in ("paint","body","hull","metal"))
                    else None)
        if category is None:
            continue
        for node in material.node_tree.nodes:
            if node.type != "BSDF_PRINCIPLED":
                continue
            base = node.inputs.get("Base Color")
            # Never overwrite an existing textured material connection.
            if base is not None and not base.is_linked:
                base.default_value = (*palette[category], 1)
            rough = node.inputs.get("Roughness")
            if rough is not None and not rough.is_linked:
                rough.default_value = .29 if category == "glass" else .38


def area_light(scene, name, pos, color, power, size):
    data = bpy.data.lights.new(name, "AREA")
    data.energy = power
    data.color = color
    data.shape = "DISK"
    data.size = size
    light = bpy.data.objects.new(name, data)
    scene.collection.objects.link(light)
    light.location = pos
    light.rotation_euler = (-light.location).to_track_quat("-Z", "Y").to_euler()


def main():
    a = options()
    if not a.model.is_file() or not a.reference.is_file():
        raise SystemExit("Original .blend and matching 2D sprite are both required")
    if not 448 <= a.pixels <= 2048:
        raise SystemExit("--pixels must be 448..2048")
    manifest = json.loads(a.manifest.read_text()) if a.manifest.exists() else {}
    config = manifest.get(a.ship, {})
    a.out.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.open_mainfile(filepath=str(a.model.resolve()))
    scene = bpy.context.scene
    meshes = [o for o in scene.objects if o.type == "MESH" and not o.hide_render and not o.hide_get()]
    if not meshes:
        raise SystemExit("No visible source meshes in authored .blend")
    points = [o.matrix_world @ Vector(v) for o in meshes for v in o.bound_box]
    low = Vector(tuple(min(p[i] for p in points) for i in range(3)))
    high = Vector(tuple(max(p[i] for p in points) for i in range(3)))
    center, extent = (low + high) * .5, max(high - low)
    if extent < 1e-4:
        raise SystemExit("Source model has zero volume")
    pose = bpy.data.objects.new("BankingPoseRoot", None)
    normalize = bpy.data.objects.new("ShipNormalize", None)
    scene.collection.objects.link(pose)
    scene.collection.objects.link(normalize)
    for obj in meshes:
        world = obj.matrix_world.copy()
        obj.parent = normalize
        obj.matrix_world = world
    normalize.parent = pose
    scale = 2.3 / extent
    normalize.scale = (scale, scale, scale)
    normalize.location = -center * scale
    pose.rotation_mode = "XYZ"
    orientation = config.get("orient_xyz_degrees", [0, 0, 0])
    original = [math.radians(v) for v in orientation]
    palette = reference_paint(a.reference)
    material_color_match(palette)
    for obj in list(scene.objects):
        if obj.type == "LIGHT":
            bpy.data.objects.remove(obj, do_unlink=True)
    area_light(scene,"nebula-blue",(2.8,-1,4.5),(.67,.82,1),650,5)
    area_light(scene,"metal-fill",(-3.4,1.2,3),(.79,.89,1),420,4.2)
    area_light(scene,"warm-rim",(1.1,3.4,1.6),(1,.72,.38),380,2.4)
    if scene.world is None:
        scene.world = bpy.data.worlds.new("Space ambience")
    scene.world.use_nodes = True
    bg = next((node for node in scene.world.node_tree.nodes if node.type == "BACKGROUND"), None)
    if bg:
        bg.inputs["Color"].default_value = (.13,.19,.29,1)
        bg.inputs["Strength"].default_value = .5
    scene.render.engine = "CYCLES"
    scene.cycles.samples = a.samples
    scene.cycles.use_denoising = True
    scene.render.film_transparent = True
    scene.render.resolution_x = a.pixels
    scene.render.resolution_y = a.pixels
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.view_settings.view_transform = "AgX"
    camera_data = bpy.data.cameras.new("BankingOrtho")
    camera = bpy.data.objects.new("BankingOrtho", camera_data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    camera_data.type = "ORTHO"
    camera_data.ortho_scale = 3.3
    for row in range(2):
        # Both atlas rows are nose-up in logical flight space.
        camera.location = (0, -.1 if row == 0 else -.72, 5.5)
        camera.rotation_euler = (-camera.location).to_track_quat("-Z", "Y").to_euler()
        for col, roll in enumerate(ROLL_DEGREES):
            pose.rotation_euler = original
            pose.rotation_euler[1] += math.radians(roll)
            target = a.out / f"{row}_{col}.png"
            scene.render.filepath = str(target.resolve())
            bpy.ops.render.render(write_still=True)
            if not target.is_file() or target.stat().st_size < 1000:
                raise SystemExit(f"Failed to render {target}")
            print(f"MODEL_POSE {a.ship} {row}/{col} {roll}deg")
    (a.out / "metadata.json").write_text(json.dumps({
        "ship":a.ship,"source_model":a.model.name,"reference":a.reference.name,
        "samples":a.samples,"source_pixels":a.pixels,"bank_degrees":ROLL_DEGREES,
        "palette":palette,"method":"authored mesh Blender Cycles PBR"
    },indent=2))


if __name__ == "__main__":
    main()
