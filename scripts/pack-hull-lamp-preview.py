"""Package native gameplay frames; no generated or simulated replacement art."""
from pathlib import Path
from PIL import Image
root=Path('presentation-review/hull-lamps-v2')
paths=sorted(root.glob('blink-*.png'))
assert len(paths)==12
frames=[Image.open(path).convert('RGB') for path in paths]
frames[0].save(root/'visible-lights-gameplay.webp',save_all=True,append_images=frames[1:],duration=220,loop=0,lossless=True)
for frame in frames:frame.close()
for path in paths:path.unlink()
