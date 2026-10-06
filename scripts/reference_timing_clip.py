"""Capture a bounded source clip using the existing HTTPS-safe recording proxy."""
from pathlib import Path
import sys,threading,subprocess,json
from http.server import ThreadingHTTPServer
# Isolated mode excludes cwd; explicitly load our repository helper by path.
import importlib.util
spec=importlib.util.spec_from_file_location('capture',Path(__file__).with_name('reference_capture.py'));capture=importlib.util.module_from_spec(spec);spec.loader.exec_module(capture)
server=ThreadingHTTPServer(('127.0.0.1',0),capture.RecordingProxy);server.daemon_threads=True
server.source=capture.VIDEOS['frlg'].replace('https://archive.org/download/',capture.DIRECT_HOSTS['frlg']);threading.Thread(target=server.serve_forever,daemon=True).start()
out=capture.ROOT/'reference/_proof/m2-source-walking.mp4'
try:
 subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-ss','998','-i',f'http://127.0.0.1:{server.server_port}/video','-t','4','-an','-c:v','libx264',str(out)],check=True,timeout=85)
 out.with_suffix('.source.json').write_text(json.dumps({'source':capture.VIDEOS['frlg'],'startSeconds':998,'durationSeconds':4,'limits':'360x240 compressed source; not native 60 Hz proof'},indent=2))
 print(out)
finally:server.shutdown()
