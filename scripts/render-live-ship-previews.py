"""Render UI views from the shipped live GLBs, including their current geometry.

blender -b -t 4 --python-exit-code 1 -P scripts/render-live-ship-previews.py
"""
import math
import argparse
import sys
import tempfile
from pathlib import Path

import bpy
from mathutils import Vector
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public/assets/ships/previews'

parser = argparse.ArgumentParser()
parser.add_argument('keys',nargs='*')
parser.add_argument('--review-dir',type=Path)
args = parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
for key in args.keys or ('xwing','xwingElite'):
    version = 10 if key in ('fast','fastElite','gatling','gatlingElite') else 9
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(ROOT / 'public/assets/ships/models/v1' / (key+'.glb')))
    scene = bpy.context.scene
    meshes = [obj for obj in scene.objects if obj.type == 'MESH']
    pivot = bpy.data.objects.new('Preview orientation', None)
    scene.collection.objects.link(pivot)
    for obj in list(scene.objects):
        if obj != pivot and obj.parent is None:
            obj.parent = pivot
    world = bpy.data.worlds.new('Neutral ship preview')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs[0].default_value = (.65,.72,.8,1)
    world.node_tree.nodes['Background'].inputs[1].default_value = .65
    scene.world = world
    for name,energy,rotation,color in (
        ('Key',2.0,(.52,-.46,-.25),(1,.94,.86)),
        ('Fill',.65,(-.65,.8,1.8),(.56,.75,1)),
    ):
        data = bpy.data.lights.new(name,'SUN')
        data.energy = energy; data.angle = math.radians(18); data.color = color
        light = bpy.data.objects.new(name,data)
        scene.collection.objects.link(light); light.rotation_euler = rotation
    for obj in meshes:
        for material in obj.data.materials:
            if not material or not material.use_nodes: continue
            shader = next((n for n in material.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'),None)
            if not shader: continue
            color = shader.inputs['Base Color']
            emission = shader.inputs.get('Emission Color') or shader.inputs.get('Emission')
            if emission and color.is_linked:
                material.node_tree.links.new(color.links[0].from_socket,emission)
            if shader.inputs.get('Emission Strength'):
                shader.inputs['Emission Strength'].default_value = .18
    data = bpy.data.cameras.new('Preview camera')
    data.type = 'ORTHO'; data.clip_end = 6000
    camera = bpy.data.objects.new('Preview camera',data)
    scene.collection.objects.link(camera); scene.camera = camera
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 48; scene.cycles.max_bounces = 3
    scene.cycles.use_denoising = False
    scene.render.film_transparent = True
    scene.render.resolution_x = scene.render.resolution_y = 640
    scene.render.resolution_percentage = 100
    scene.view_settings.view_transform = 'Standard'
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'
    views = [('portrait',0,0,OUT),('landscape',-56,-90,OUT)]
    if args.review_dir:
        args.review_dir.mkdir(parents=True,exist_ok=True)
        views += [('side',-90,-90,args.review_dir),('underside',-145,-90,args.review_dir)]
    for view,yaw,heading,directory in views:
        pivot.rotation_euler = (0,math.radians(yaw),math.radians(heading))
        bpy.context.view_layer.update()
        points = [obj.matrix_world @ Vector(corner) for obj in meshes for corner in obj.bound_box]
        low = Vector((min(p.x for p in points),min(p.y for p in points),0))
        high = Vector((max(p.x for p in points),max(p.y for p in points),0))
        center = (low+high)*.5
        camera.location = (center.x,center.y,3000)
        data.ortho_scale = max(high.x-low.x,high.y-low.y)*1.16
        with tempfile.TemporaryDirectory() as temp:
            scene.render.filepath = str(Path(temp)/'preview.png')
            bpy.ops.render.render(write_still=True)
            with Image.open(scene.render.filepath) as image:
                image.save(directory/f'{key}-{view}-v{version}.webp','WEBP',quality=97,method=5,exact=True)
        print('PREVIEW_READY',key,view,flush=True)
