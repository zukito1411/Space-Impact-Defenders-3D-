"""Package exact gameplay frames into lossless motion previews."""
from pathlib import Path
import shutil
from PIL import Image
root=Path('presentation-review/clouds-crosswing-v1')
for stage in (5,10):
    folder=root/f'frames-{stage}'
    frames=[Image.open(path).convert('RGBA') for path in sorted(folder.glob('*.png'))]
    assert len(frames)==12
    frames[0].save(root/f'stage-{stage}-cloud-motion.webp',save_all=True,append_images=frames[1:],duration=250,loop=0,lossless=True)
    for frame in frames:frame.close()
    shutil.rmtree(folder)
