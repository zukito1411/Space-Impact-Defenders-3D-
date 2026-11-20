"""Sculpt Red Wraith/Crimson Saw while retaining authored paint and hardpoints.
blender -b -t 4 --python-exit-code 1 -P scripts/deepen-assault-hulls.py
"""
import math
from pathlib import Path
import bpy
import bmesh
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
KEYS = ('fast','fastElite','gatling','gatlingElite')

def smooth(a,b,x):
    t = max(0,min(1,(x-a)/(b-a)))
    return t*t*(3-2*t)

def longitudinal(y):
    return smooth(-118,-72,y)*(1-smooth(28,66,y))

def deepen(key):
    path = ROOT/'art/3d/flight-hulls'/f'{key}.blend'
    bpy.ops.wm.open_mainfile(filepath=str(path))
    scene = bpy.context.scene
    if scene.get('assault_hull_depth_revision',0) >= 1:
        return
    heavy = key.startswith('gatling')
    hull = scene.objects['Hull']
    paint = hull.data.materials[0]
    underside = hull.data.materials[1]
    armor_paint = paint.copy()
    armor_paint.name = 'Raised shoulder armor • original paint'
    # Recover the original side-art projection. Existing UVs remain untouched;
    # new armor panels use the very same dorsal and flank paintings.
    uv = hull.data.uv_layers['Side elevation']
    samples = np.array([[hull.data.vertices[l.vertex_index].co.y,
        hull.data.vertices[l.vertex_index].co.z,1] for l in hull.data.loops])
    side_uv = np.array([v.uv[:] for v in uv.data])
    projection = np.linalg.lstsq(samples,side_uv,rcond=None)[0]

    def skin(obj, shoulder=False):
        top = obj.data.uv_layers.new(name='Reference paint')
        side = obj.data.uv_layers.new(name='Side elevation')
        for loop in obj.data.loops:
            p = obj.data.vertices[loop.vertex_index].co
            top.data[loop.index].uv = ((p.x+144.5)/288,(p.y+143.5)/288)
            # Stretch shoulder paint across the new depth rather than letting
            # cockpit glass or empty margins creep onto the side armor.
            if shoulder:
                # The lower flank carries detailed armor, not cockpit glass.
                # Keep its longitudinal decals and give it a true Y/Z unwrap.
                z = -10+14*max(0,min(1,(p.z+24)/56))
                side.data[loop.index].uv = tuple(np.array([p.y,z,1])@projection)
            else:
                z = max(-19,min(23,p.z*.65))
                side.data[loop.index].uv = tuple(np.array([p.y,z,1])@projection)
        obj.data.uv_layers.active = top

    def mesh(name,vertices,faces,material,bevel=0):
        data = bpy.data.meshes.new(name)
        data.from_pydata(vertices,[],faces); data.update()
        obj = bpy.data.objects.new(name,data); scene.collection.objects.link(obj)
        data.materials.append(material)
        bm = bmesh.new(); bm.from_mesh(data)
        bmesh.ops.recalc_face_normals(bm,faces=bm.faces)
        bm.to_mesh(data); bm.free()
        skin(obj,material == armor_paint)
        if bevel:
            modifier = obj.modifiers.new('Small machined armor edges','BEVEL')
            modifier.width = bevel; modifier.segments = 2
        return obj

    # Give the painted fuselage an actual pressure-vessel cross section. Only
    # elevation changes: the original top silhouette and UV registration stay.
    for name in ('Hull','Canopy','Port wing','Starboard wing'):
        obj = scene.objects[name]
        count = len(obj.data.vertices)//2
        for vertex in obj.data.vertices:
            x,y,z = vertex.co
            core = 1-smooth(15,41 if heavy else 37,abs(x))
            run = longitudinal(y)
            if vertex.index < count:
                vertex.co.z += (15 if heavy else 12)*core*run
            else:
                vertex.co.z -= (12 if heavy else 10)*core*run
        obj.data.update()
    # Keep secondary gun pods seated on the raised inner wing, without changing
    # the lengths/diameters of the front turret barrels or the exhaust anchors.
    for obj in list(scene.objects):
        if obj.type == 'MESH' and obj.name.startswith('Wing launcher'):
            for vertex in obj.data.vertices:
                vertex.co.z += 3.2*longitudinal(vertex.co.y)
            obj.data.update()
        elif obj.type == 'MESH' and obj.name.startswith('Swept stabilizer'):
            for vertex in obj.data.vertices:
                x,y,_ = vertex.co
                vertex.co.z += (15 if heavy else 12)*(1-smooth(15,41 if heavy else 37,abs(x)))*longitudinal(y)
            obj.data.update()

    for sign in (-1,1):
        stations = [(-99,16,23,8,-8),(-72,16,30 if not heavy else 33,23,-20),
            (-24,14,32 if not heavy else 35,29 if not heavy else 33,-24 if heavy else -20),
            (24,13,28 if not heavy else 31,25 if not heavy else 29,-17),
            (55,12,18,9,-5)]
        vertices = []
        for y,inner,outer,top,bottom in stations:
            for x,z in ((inner,top-4),(inner+3,top),(outer-4,top),(outer,top-5),
                        (outer,bottom+4),(outer-3,bottom),(inner+2,bottom),(inner,bottom+4)):
                vertices.append((sign*x,y,z))
        faces = [tuple(reversed(range(8))),tuple(range(32,40))]
        for ring in range(4):
            for i in range(8):
                j = (i+1)%8
                faces.append((ring*8+i,ring*8+j,(ring+1)*8+j,(ring+1)*8+i))
        mesh(f'Armored shoulder chine {sign:+}',vertices,faces,armor_paint,1.15)
        dark = bpy.data.materials.get('Machined gunmetal')
        # Short recessed radiator cassettes break up the flank's large surfaces.
        for index in range(6 if heavy else 5):
            y = -64+index*10
            outer = float(np.interp(y,[-72,-24,24],[33,35,31] if heavy else [30,32,28]))
            x = sign*(outer+.06)
            verts = [(x,y-2.0,1),(x,y+2.0,3),(x,y+2.0,13),(x,y-2.0,11),
                     (x-sign*.8,y-2.0,1),(x-sign*.8,y+2.0,3),
                     (x-sign*.8,y+2.0,13),(x-sign*.8,y-2.0,11)]
            faces = [(0,1,2,3),(4,7,6,5),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0)]
            mesh(f'Recessed side radiator {sign:+}/{index}',verts,faces,dark,.16)

    # A closed chamfered belly, with separate armor steps instead of a flat slab.
    stations = [(-97,6,-9,-16),(-67,12,-13,-31 if heavy else -28),
                (-20,13,-17,-34 if heavy else -29),(23,10,-12,-27),(48,5,-6,-13)]
    vertices=[]
    for y,w,top,bottom in stations:
        vertices += [(-w,y,top),(w,y,top),(w,y,bottom+4),(w-4,y,bottom),
                     (-w+4,y,bottom),(-w,y,bottom+4)]
    faces=[tuple(reversed(range(6))),tuple(range(24,30))]
    for ring in range(4):
        for i in range(6):
            j=(i+1)%6;faces.append((ring*6+i,ring*6+j,(ring+1)*6+j,(ring+1)*6+i))
    mesh('Segmented armored ventral keel',vertices,faces,underside,.9)
    scene['assault_hull_depth_revision']=1
    bpy.context.preferences.filepaths.save_version=0
    bpy.ops.wm.save_as_mainfile(filepath=str(path),compress=True)
    print('DEEPENED_HULL',key,flush=True)

if __name__ == '__main__':
    for key in KEYS:
        deepen(key)
