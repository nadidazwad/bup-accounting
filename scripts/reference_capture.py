"""Capture reference frames, preserving source URLs and timestamps.

Run from scripts with python -I reference_capture.py. References are never assets.
"""

import argparse
import json
import subprocess
import threading
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VIDEOS = {
    "frlg": "https://archive.org/download/Gameboy_Advance_Longplay_-_Pokemon_Leafgreen/Gameboy_Advance_Longplay_-_Pokemon_Leafgreen_Part_1_of_5_512kb.mp4",
    "hgss": "https://archive.org/download/Nintendo_DS_Longplay_114_Pokemon_HeartGold_Version/Nintendo_DS_Longplay_114_Pokemon_HeartGold_Version.mp4",
    "gta2": "https://archive.org/download/grand-theft-auto-2-playthrough/Grand%20Theft%20Auto%202%20Playthrough%20%E2%80%90%20Made%20with%20Clipchamp.mp4",
}
DIRECT_HOSTS = {
    "frlg": "https://dn800300.us.archive.org/0/items/",
    "hgss": "https://dn601208.us.archive.org/0/items/",
    "gta2": "https://dn600305.us.archive.org/0/items/",
}


class RecordingProxy(BaseHTTPRequestHandler):
    """Keep HTTPS in Python; the host's static ffmpeg TLS build crashes."""

    def do_GET(self):
        request = urllib.request.Request(self.server.source)
        if self.headers.get("Range"):
            request.add_header("Range", self.headers["Range"])
        with urllib.request.urlopen(request, timeout=45) as response:
            self.send_response(response.status)
            for name in ("Content-Length", "Content-Type", "Content-Range", "Accept-Ranges"):
                if response.headers.get(name):
                    self.send_header(name, response.headers[name])
            self.end_headers()
            try:
                while data := response.read(65536):
                    self.wfile.write(data)
            except (BrokenPipeError, ConnectionResetError):
                pass

    def log_message(self, *args):
        pass


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("game", choices=VIDEOS)
    parser.add_argument("folder")
    parser.add_argument("times", nargs="+", type=float)
    args = parser.parse_args()
    directory = ROOT / "reference" / args.folder
    directory.mkdir(parents=True, exist_ok=True)
    manifest_path = ROOT / "reference" / "captures.json"
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else []
    for entry in manifest:
        sidecar = ROOT / "reference" / (entry["file"] + ".source.json")
        sidecar.write_text(json.dumps(entry))
    server = ThreadingHTTPServer(("127.0.0.1", 0), RecordingProxy)
    server.daemon_threads = True
    server.source = VIDEOS[args.game].replace("https://archive.org/download/", DIRECT_HOSTS[args.game])
    threading.Thread(target=server.serve_forever, daemon=True).start()

    def capture(timestamp):
        path = directory / f"{args.game}-{timestamp:08.2f}.png"
        if not path.exists():
            subprocess.run([
                "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
                "-ss", str(timestamp), "-i", f"http://127.0.0.1:{server.server_port}/video",
                "-frames:v", "1", str(path),
            ], check=True, timeout=90)
        entry = {"file": str(path.relative_to(ROOT / "reference")),
                 "source": VIDEOS[args.game], "timestamp": timestamp}
        path.with_suffix(".png.source.json").write_text(json.dumps(entry))
        print(entry["file"], flush=True)
        return entry

    with ThreadPoolExecutor(max_workers=4) as pool:
        for entry in pool.map(capture, args.times):
            manifest = [item for item in manifest if item["file"] != entry["file"]]
            manifest.append(entry)
            manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
    server.shutdown()
    manifest = [json.loads(path.read_text()) for path in (ROOT / "reference").rglob("*.source.json")]
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
    sources = ["# Reference sources", "", "Local study only. These frames are not shipped.", "",
               "| File | Recording URL | Time, seconds |", "| --- | --- | --- |"]
    sources.extend(f"| `{item['file']}` | {item['source']} | {item['timestamp']} |"
                   for item in sorted(manifest, key=lambda item: item["file"]))
    (ROOT / "reference" / "SOURCES.md").write_text("\n".join(sources) + "\n")


if __name__ == "__main__":
    main()
