"""Regression guard for the optional source-model 3D rendering pipeline."""
from pathlib import Path
import ast
import hashlib
import json
import re

ROOT=Path(__file__).resolve().parent.parent
MANIFEST=ROOT/'art/3d/render-manifest.json'
manifest=json.loads(MANIFEST.read_text())
expected={'xwing': 'crosswing-nova-open-x.blend', 'spaceEt': 'space-jet-3d-tail-fin.blend'}
assert set(manifest)==set(expected)
for key,filename in expected.items():
    item=manifest[key]
    assert item['model']==filename
    assert re.fullmatch(r'[0-9a-f]{64}',item['sha256'])
    assert (ROOT/item['reference']).is_file()
    model=ROOT/'art/3d/models'/filename
    if model.exists():
        assert hashlib.sha256(model.read_bytes()).hexdigest()==item['sha256']
    assert len(item['orient_xyz_degrees'])==3

renderer=(ROOT/'scripts/render_source_model_banking.py').read_text()
packer=(ROOT/'scripts/pack_source_model_banking.py').read_text()
ast.parse(renderer)
ast.parse(packer)
assert 'bpy.ops.wm.open_mainfile' in renderer, 'must render authored Blender geometry'
assert 'image.pixels' in renderer, 'must sample 2D reference colors'
assert 'ROLL_DEGREES = (-21, -14, -7, 0, 7, 14, 21)' in renderer
assert 'ImageFilter.UnsharpMask' not in packer
assert 'ROWS, COLUMNS = 2, 7' in packer
assert 'Image.Resampling.LANCZOS' in packer

print('Real-mesh 3D pipeline syntax, model identity, reference art and 7x2 packing verified')
