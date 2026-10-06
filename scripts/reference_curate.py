"""Apply categories checked visually in the contact sheets; rebuild provenance."""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "reference"


def move(source, category):
    path = ROOT / source
    if not path.exists():
        return
    destination = ROOT / category / path.name
    destination.parent.mkdir(parents=True, exist_ok=True)
    sidecar = path.with_suffix(path.suffix + ".source.json")
    if sidecar.exists():
        entry = json.loads(sidecar.read_text())
        entry["file"] = str(destination.relative_to(ROOT))
        destination.with_suffix(destination.suffix + ".source.json").write_text(json.dumps(entry))
        sidecar.unlink()
    path.rename(destination)


for timestamp in (350, 660, 700, 780):
    move(f"pokemon-frlg/overworld/frlg-{timestamp:08.2f}.png", "pokemon-frlg/battle")
for timestamp in (370, 600, 620):
    move(f"pokemon-frlg/overworld/frlg-{timestamp:08.2f}.png", "pokemon-frlg/dialogue")
move("pokemon-frlg/overworld/frlg-00450.00.png", "pokemon-frlg/transitions")
for timestamp in (960, 1050, 1200, 1400, 1700, 2100, 2400, 2600, 2900, 3200):
    move(f"pokemon-frlg/overworld-more/frlg-{timestamp:08.2f}.png", "pokemon-frlg/battle")
for timestamp in (1000, 1900):
    move(f"pokemon-frlg/overworld-more/frlg-{timestamp:08.2f}.png", "pokemon-frlg/overworld")
for timestamp in (255, 258, 260):
    move(f"pokemon-frlg/transitions/frlg-{timestamp:08.2f}.png", "pokemon-frlg/dialogue" if timestamp == 258 else "pokemon-frlg/overworld")
move("pokemon-frlg/ui/frlg-00510.00.png", "pokemon-frlg/overworld")
move("pokemon-frlg/ui/frlg-00740.00.png", "pokemon-frlg/battle")
for timestamp in (293, 1027, 1173, 2054, 2640, 3814, 4107, 7628):
    move(f"pokemon-frlg/overworld/frlg-{timestamp:08.2f}.png", "pokemon-frlg/battle")
move("pokemon-frlg/overworld/frlg-00587.00.png", "pokemon-frlg/dialogue")
move("pokemon-frlg/transitions/frlg-00733.00.png", "pokemon-frlg/battle")
move("pokemon-frlg/transitions/frlg-08508.00.png", "pokemon-frlg/ui")

# Archive preview indices do not correspond to the derived MP4's timestamps.
# These low-resolution shots were viewed directly, then categorized by content.
timeline_prefix = "pokemon-frlg/timeline/Gameboy_Advance_Longplay_-_Pokemon_Leafgreen_Part_1_of_5_"
for index in (293, 440, 587, 1027, 1173, 2054, 2640, 3080, 3814, 4107, 7041, 7628, 8214):
    move(f"{timeline_prefix}{index:06}.jpg", "pokemon-frlg/overworld")
for index in (733, 880, 8508):
    move(f"{timeline_prefix}{index:06}.jpg", "pokemon-frlg/transitions")

for category, timestamps in {
    "city": (240, 360, 420, 480, 540, 580, 600, 620, 640, 660),
    "hud": (690, 720, 780, 840, 870),
    "peds": (810, 900),
    "menus": (120, 180, 300),
    "unused-intro": (1, 8, 20, 60, 90),
}.items():
    for timestamp in timestamps:
        move(f"gta2/candidates/gta2-{timestamp:08.2f}.png", f"gta2/{category}")
for timestamp in (430, 450, 460, 520, 560):
    move(f"gta2/city-more/gta2-{timestamp:08.2f}.png", "gta2/vehicles")
move("gta2/candidates/gta2-00750.00.png", "gta2/vehicles")
move("gta2/city-more/gta2-00500.00.png", "gta2/peds")
for timestamp in (400, 405, 410):
    move(f"gta2/city-more/gta2-{timestamp:08.2f}.png", "gta2/menus")
move("gta2/city-more/gta2-00570.00.png", "gta2/city")

for path in ROOT.rglob("frlg-*.png"):
    sidecar = path.with_suffix(".png.source.json")
    if not sidecar.exists():
        sidecar.write_text(json.dumps({
            "file": str(path.relative_to(ROOT)),
            "source": "https://archive.org/download/Gameboy_Advance_Longplay_-_Pokemon_Leafgreen/Gameboy_Advance_Longplay_-_Pokemon_Leafgreen_Part_1_of_5_512kb.mp4",
            "timestamp": float(path.stem.removeprefix("frlg-")),
        }))
entries_by_file = {}
for path in ROOT.rglob("*.source.json"):
    entry = json.loads(path.read_text())
    if entry["file"].endswith(".jpg"):
        entry["timestamp"] = "archive preview index " + Path(entry["file"]).stem.rsplit("_", 1)[1] + "; not a verified MP4 timestamp"
        path.write_text(json.dumps(entry))
    if (ROOT / entry["file"]).is_file():
        entries_by_file[entry["file"]] = entry
    else:
        path.unlink()
entries = list(entries_by_file.values())
entries.sort(key=lambda entry: entry["file"])
(ROOT / "captures.json").write_text(json.dumps(entries, indent=2) + "\n")
sources = ["# Reference sources", "", "Local study only. No reference images are shipped.", "",
           "Archive thumbnails are 160×110 scene locators. Their preview indices do not match MP4 timestamps. Use full captures for measurements.", "",
           "| File | Source URL | Recording time or embedded image |", "| --- | --- | --- |"]
sources.extend(f"| `{entry['file']}` | {entry['source']} | {entry['timestamp']} |" for entry in entries)
(ROOT / "SOURCES.md").write_text("\n".join(sources) + "\n")
print(f"Catalogued {len(entries)} images with provenance.")
