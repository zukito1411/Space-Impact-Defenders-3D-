"""Export the authored flight meshes and original paint for the live Three.js scene.

blender -b -t 4 --python-exit-code 1 -P scripts/export-live-hulls.py [-- rocket]
"""
import bpy
import json
import sys
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "art/3d/flight-hulls"
OUT = ROOT / "public/assets/ships/models/v1"
OUT.mkdir(parents=True, exist_ok=True)


def export(key):
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE / (key + ".blend")))
    scene = bpy.context.scene
    registration = list(scene["atlas_transform"])
    attachments = {"nozzles": [], "wing": []}
    meshes = []
    for obj in list(scene.objects):
        if obj.type == "MESH":
            meshes.append(obj)
        elif obj.type == "EMPTY":
            group = "nozzles" if obj.name.startswith("Nozzle ") else "wing" if obj.name.startswith("Wing tip ") else None
            if group:
                attachments[group].append([*obj.location, obj.get("aperture", 0)])
    bpy.ops.object.select_all(action="DESELECT")
    for obj in meshes:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    # Apply the authored bevels before generating a separate export UV set.
    for obj in meshes:
        bpy.context.view_layer.objects.active = obj
        for modifier in list(obj.modifiers):
            bpy.ops.object.modifier_apply(modifier=modifier.name)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.join()
    hull = bpy.context.object
    hull.name = key
    atlas = bpy.data.images.new(key + " original paint", width=2048, height=2048, alpha=False)
    materials = [mat for mat in hull.data.materials if mat]
    for material in materials:
        nodes = material.node_tree.nodes
        shader = nodes.get("Principled BSDF")
        original = shader.inputs["Base Color"]
        emission = nodes.new("ShaderNodeEmission")
        if original.is_linked:
            material.node_tree.links.new(original.links[0].from_socket, emission.inputs["Color"])
        else:
            emission.inputs["Color"].default_value = original.default_value
        material.node_tree.links.new(emission.outputs[0], nodes.get("Material Output").inputs["Surface"])
        target = nodes.new("ShaderNodeTexImage")
        target.image = atlas
        nodes.active = target
    uv = hull.data.uv_layers.new(name="Live paint atlas")
    hull.data.uv_layers.active = uv
    uv.active_render = True
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=.008)
    bpy.ops.object.mode_set(mode="OBJECT")
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 1
    scene.cycles.use_denoising = False
    scene.render.bake.margin = 8
    bpy.ops.object.bake(type="EMIT", use_clear=True)
    # One opaque mesh/material and one preserved-paint atlas per ship.
    material = bpy.data.materials.new("Original livery")
    material.use_nodes = True
    nodes = material.node_tree.nodes
    image = nodes.new("ShaderNodeTexImage")
    image.image = atlas
    material.node_tree.links.new(image.outputs["Color"], nodes["Principled BSDF"].inputs["Base Color"])
    nodes["Principled BSDF"].inputs["Metallic"].default_value = .22
    nodes["Principled BSDF"].inputs["Roughness"].default_value = .39
    hull.data.materials.clear()
    hull.data.materials.append(material)
    for poly in hull.data.polygons:
        poly.material_index = 0
    # Remove export-inactive UV layers only after painting, retaining source .blend files.
    for name in [layer.name for layer in hull.data.uv_layers if layer.name != "Live paint atlas"]:
        hull.data.uv_layers.remove(hull.data.uv_layers[name])
    atlas.pack()
    bpy.ops.export_scene.gltf(filepath=str(OUT / (key + ".glb")), export_format="GLB",
                             use_selection=True, export_yup=True, export_animations=False,
                             export_image_format="JPEG", export_jpeg_quality=95)
    return {"registration": registration, **attachments}


if __name__ == "__main__":
    manifest_path = OUT / "manifest.json"
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
    keys = sys.argv[sys.argv.index("--")+1:] if "--" in sys.argv else sorted(p.stem for p in SOURCE.glob("*.blend"))
    for key in keys:
        manifest[key] = export(key)
        manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
