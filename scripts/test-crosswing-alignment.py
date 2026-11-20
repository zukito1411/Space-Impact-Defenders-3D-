"""Check the shipped hardpoints and unchanged layout of both X-wing variants."""
import json
import math
import struct
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
manifest=json.loads((ROOT/'public/assets/ships/models/v1/manifest.json').read_text())
report=json.loads((ROOT/'presentation-review/clouds-crosswing-v1/source-alignment.json').read_text())
for item in report:
    assert item['unalteredMeshes']>0
    assert len(item['editedMeshes'])==6
    for pair in item['pairs']:
        assert pair['upperTip'][:2]==pair['lowerTip'][:2]
        assert pair['upperTip'][2]==-pair['lowerTip'][2]
for key in ('xwing','xwingElite'):
    for family in ('wing','nozzles'):
        points=manifest[key][family]
        assert len(points)==4
        for a,b in ((points[0],points[1]),(points[2],points[3])):
            assert a[:2]==b[:2],f'{key} {family} are staggered'
            assert math.isclose(a[2],-b[2],abs_tol=1e-6)
    raw=(ROOT/f'public/assets/ships/models/v1/{key}.glb').read_bytes()
    assert raw[:4]==b'glTF'
    length,kind=struct.unpack_from('<II',raw,12)
    data=json.loads(raw[20:20+length])
    assert len(data['meshes'])==1,'keep the merged live hull'
    assert len(data['meshes'][0]['primitives'])==1,'do not split the ship into more draws'
print('Both X-wing variants: paired foil/laser/nozzle columns, symmetric elevation and merged live geometry verified')
