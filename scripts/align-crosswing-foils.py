"""Align paired X-wing assemblies while retaining the current authored paint.
blender -b -t 4 --python-exit-code 1 -P scripts/align-crosswing-foils.py
"""
import hashlib
import json
from pathlib import Path
import bpy

ROOT=Path(__file__).resolve().parents[1]
REPORT=ROOT/'presentation-review/clouds-crosswing-v1'

def digest_mesh(obj):
    return hashlib.sha256(json.dumps({
        'vertices':[list(v.co) for v in obj.data.vertices],
        'faces':[list(p.vertices) for p in obj.data.polygons],
        'uv':[[list(v.uv) for v in layer.data] for layer in obj.data.uv_layers],
    },sort_keys=True).encode()).hexdigest()

def align(key):
    path=ROOT/'art/3d/flight-hulls'/f'{key}.blend'
    bpy.ops.wm.open_mainfile(filepath=str(path))
    objects=bpy.context.scene.objects
    before={o.name:digest_mesh(o) for o in objects if o.type=='MESH'}
    edited=set()
    pairs=[]
    for side in (-1,1):
        upper=objects[f'S-foil {side:+}/+1'];lower=objects[f'S-foil {side:+}/-1']
        assert len(upper.data.vertices)==len(lower.data.vertices)==20
        # Keep lower camber/thickness and UVs; move its four span stations onto
        # the corresponding upper station and make the dihedral symmetric.
        aligned=abs(lower.data.vertices[15].co.z+52)<.0001
        for i,(a,b) in enumerate(zip(upper.data.vertices,lower.data.vertices)):
            t=(0,.32,.72,1)[i//5]
            old_center=-6+(-46+6)*t
            new_center=-6+(-52+6)*t
            # Idempotent: an already aligned asset needs no second Z shift.
            b.co.x=a.co.x;b.co.y=a.co.y
            if not aligned:b.co.z+=new_center-old_center
        edited.add(lower.name)
        ordinal=0 if side<0 else 2
        for prefix,height in [('Foil-tip laser',52),('Split drive nacelle',15)]:
            a=objects[prefix if ordinal==0 else f'{prefix}.{ordinal:03}']
            b=objects[f'{prefix}.{ordinal+1:03}']
            assert len(a.data.vertices)==len(b.data.vertices)
            for av,bv in zip(a.data.vertices,b.data.vertices):
                bv.co=(av.co.x,av.co.y,av.co.z-2*height)
            edited.add(b.name)
        for prefix in ('Wing tip','Nozzle'):
            a=objects[f'{prefix} {ordinal+1}'];b=objects[f'{prefix} {ordinal+2}']
            b.location=(a.location.x,a.location.y,-a.location.z)
        pairs.append({'side':side,'upperTip':list(objects[f'Wing tip {ordinal+1}'].location),
                      'lowerTip':list(objects[f'Wing tip {ordinal+2}'].location)})
    for name in edited:objects[name].data.update()
    for name,old in before.items():
        if name not in edited:assert digest_mesh(objects[name])==old,f'Changed unrelated mesh {name}'
    bpy.context.preferences.filepaths.save_version=0
    bpy.ops.wm.save_as_mainfile(filepath=str(path),compress=True)
    return {'key':key,'editedMeshes':sorted(edited),'unalteredMeshes':len(before)-len(edited),'pairs':pairs}

if __name__=='__main__':
    REPORT.mkdir(parents=True,exist_ok=True)
    results=[align(key) for key in ('xwing','xwingElite')]
    (REPORT/'source-alignment.json').write_text(json.dumps(results,indent=2)+'\n')
