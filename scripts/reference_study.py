"""Make contact sheets and reproducible colour measurements with Pillow."""

import json
from collections import Counter
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
REFERENCE = ROOT / "reference"
PROOF = REFERENCE / "_proof"
PROOF.mkdir(exist_ok=True)
measurements = {}

for game in ("pokemon-frlg", "pokemon-hgss", "gta2"):
    paths = sorted(path for path in (REFERENCE / game).rglob("*") if path.suffix in (".png", ".jpg"))
    if not paths:
        continue
    for batch in range(0, len(paths), 20):
        page = paths[batch:batch + 20]
        sheet = Image.new("RGB", (1000, 190 * ((len(page) + 3) // 4)), "#dedede")
        draw = ImageDraw.Draw(sheet)
        for index, path in enumerate(page):
            picture = Image.open(path).convert("RGB")
            picture.thumbnail((240, 160), Image.Resampling.NEAREST)
            x, y = (index % 4) * 250, (index // 4) * 190
            sheet.paste(picture, (x, y))
            draw.text((x, y + 163), str(path.relative_to(REFERENCE / game)), fill="black")
        sheet.save(PROOF / f"{game}-contact-{batch // 20 + 1}.png")

    for path in paths:
        picture = Image.open(path).convert("RGB")
        colours = Counter(tuple(round(c / 8) * 8 for c in pixel) for pixel in picture.get_flattened_data())
        measurements[str(path.relative_to(REFERENCE))] = {
            "source_size": picture.size,
            "top_quantized_colours": [
                {"hex": "#" + "".join(f"{min(255, channel):02x}" for channel in colour), "pixels": count}
                for colour, count in colours.most_common(8)
            ],
        }
(REFERENCE / "measurements.json").write_text(json.dumps(measurements, indent=2) + "\n")
print(f"Measured {len(measurements)} reference images. Contact sheets: {PROOF}")
