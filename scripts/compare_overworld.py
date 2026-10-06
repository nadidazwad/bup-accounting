"""Save a native-normalized reference left and ours right at 4× nearest neighbour."""
from PIL import Image
from pathlib import Path
import sys
R=Path(__file__).resolve().parents[1]
ref=Image.open(R/sys.argv[1]).convert('RGB').resize((240,160),Image.Resampling.NEAREST)
ours=Image.open(R/sys.argv[2]).convert('RGB')
assert ours.size==(240,160)
out=Image.new('RGB',(1920,640));out.paste(ref.resize((960,640),Image.Resampling.NEAREST),(0,0));out.paste(ours.resize((960,640),Image.Resampling.NEAREST),(960,0));out.save(R/sys.argv[3])
