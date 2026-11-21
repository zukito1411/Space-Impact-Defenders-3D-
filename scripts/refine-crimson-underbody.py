"""Tuck Crimson Saw's lower armor into a shallow, chamfered hull.

blender -b -t 4 --python-exit-code 1 -P scripts/refine-crimson-underbody.py
Run after deepen-assault-hulls.py and before exporting the live GLBs.
"""
from pathlib import Path
import bpy

ROOT = Path(__file__).resolve().parents[1]


def refine(key):
    path = ROOT / 'art/3d/flight-hulls' / (key + '.blend')
    bpy.ops.wm.open_mainfile(filepath=str(path))
    scene = bpy.context.scene
    if scene.get('crimson_underbody_revision', 0) >= 1:
        return
    assert scene.get('crimson_gunship_revision', 0) >= 1, 'Refine the assault hull first'
    untouched = {}
    anchors = {o.name: tuple(o.location) for o in scene.objects if o.type == 'EMPTY'}
    for obj in scene.objects:
        if obj.type != 'MESH':
            continue
        untouched[obj.name] = [(v.index, tuple(v.co)) for v in obj.data.vertices if (obj.matrix_world @ v.co).z >= -6]
        shell = obj.name in ('Hull', 'Canopy', 'Port wing', 'Starboard wing')
        inverse = obj.matrix_world.inverted()
        for vertex in obj.data.vertices:
            point = obj.matrix_world @ vertex.co
            x, y, z = point
            if z >= -6:
                continue
            if shell:
                # A broad armor plane with a short bevel, instead of a deep dome.
                # The original upper mesh, paint, silhouette and hardpoints stay registered.
                run = max(0, min(1, (y + 105) / 28, (62 - y) / 30))
                depth = min(1, (-z - 6) / 7)
                point.z = -6 - depth * (3.5 + 2 * run)
            else:
                # Recess the keel, shoulder bottoms and cooling hardware together,
                # retaining the open cooling wells and their louver spacing.
                point.z = -6 + (z + 6) * .28
            vertex.co = inverse @ point
        obj.data.update()
    for name, vertices in untouched.items():
        assert all(tuple(scene.objects[name].data.vertices[i].co) == co for i, co in vertices)
    assert anchors == {o.name: tuple(o.location) for o in scene.objects if o.type == 'EMPTY'}
    assert min((o.matrix_world @ v.co).z for o in scene.objects if o.type == 'MESH' for v in o.data.vertices) > -15
    scene['crimson_underbody_revision'] = 1
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(path), compress=True)
    print('REFINED_UNDERBODY', key, flush=True)


if __name__ == '__main__':
    for key in ('gatling', 'gatlingElite'):
        refine(key)
