"""Download the archive's small timeline images for finding specific scenes."""

import json
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ITEM = "Gameboy_Advance_Longplay_-_Pokemon_Leafgreen"
with urllib.request.urlopen(f"https://archive.org/metadata/{ITEM}", timeout=45) as response:
    metadata = json.load(response)
files = [entry["name"] for entry in metadata["files"]
         if "Part_1_of_5_" in entry["name"] and entry["name"].endswith(".jpg")]
folder = ROOT / "reference/pokemon-frlg/timeline"
folder.mkdir(parents=True, exist_ok=True)


def download(name):
    path = folder / Path(name).name
    url = f"https://archive.org/download/{ITEM}/" + urllib.parse.quote(name)
    if not path.exists():
        with urllib.request.urlopen(url, timeout=45) as response:
            path.write_bytes(response.read())
    entry = {"file": str(path.relative_to(ROOT / "reference")), "source": url,
             "timestamp": "archive preview index " + path.stem.rsplit("_", 1)[1] + "; not a verified MP4 timestamp"}
    path.with_suffix(".jpg.source.json").write_text(json.dumps(entry))
    return path.name


with ThreadPoolExecutor(max_workers=6) as pool:
    for name in pool.map(download, files):
        print(name, flush=True)
