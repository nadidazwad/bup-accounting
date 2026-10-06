"""Encode native evidence with captured frame durations, and save 4× comparisons."""
from PIL import Image,ImageDraw
from pathlib import Path
import json,subprocess,statistics
from collections import Counter
R=Path(__file__).resolve().parents[1];P=R/'reference/_proof';metrics={}
for name in ['walk','run','hop','grass-walk']:
 frames=json.loads((P/f'm2-{name}-timing.json').read_text());folder=P/f'm2-{name}-frames';lines=['ffconcat version 1.0']
 durations=[(b['time']-a['time'])/1000 for a,b in zip(frames,frames[1:])]
 for i,f in enumerate(frames):
  lines.extend([f"file '{folder}/{i:04d}.png'", "option framerate 1000", f'duration {max(0.001,durations[i] if i<len(durations) else 1/60):.6f}'])
 lines.extend([f"file '{folder}/{len(frames)-1:04d}.png'", "option framerate 1000"])
 manifest=P/f'm2-{name}.ffconcat';manifest.write_text('\n'.join(lines)+'\n')
 for scale in [1,4]:
  out=P/f'm2-{name}-{ "native" if scale==1 else "4x"}.mp4'
  subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-safe','0','-f','concat','-i',str(manifest),'-fps_mode','vfr','-vf',f'scale={240*scale}:{160*scale}:flags=neighbor','-c:v','libx264','-crf','0','-pix_fmt','yuv444p',str(out)],check=True)
 metrics[name]={'frames':len(frames),'capturedDurationMs':frames[-1]['time']-frames[0]['time'],'medianFrameMs':statistics.median(durations)*1000,'longestFrameMs':max(durations)*1000,'limits':'Browser rAF capture, variable frame durations preserved; dev telemetry sampled every80ms. Not a native-game cadence certification.'}
 contact=Image.new('RGB',(960,3*190),'#ddd');d=ImageDraw.Draw(contact)
 for i in range(12):
  n=round(i*(len(frames)-1)/11);x=i%4*240;y=i//4*190;contact.paste(Image.open(folder/f'{n:04d}.png'),(x,y));d.text((x,y+160),f"{frames[n]['time']:.1f} ms",fill='black')
 contact.save(P/f'm2-{name}-contact.png')
(P/'m2-capture-metrics.json').write_text(json.dumps(metrics,indent=2))
# Inspect the source clip beside sampled browser frames; their phases remain unverified.
subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-ss','2','-i',str(P/'m2-source-walking.mp4'),'-t','2','-vf','fps=60,scale=240:160:flags=neighbor',str(P/'m2-source-grass-%03d.png')],check=True)
frames=json.loads((P/'m2-grass-walk-timing.json').read_text())
first=next((i for i,f in enumerate(frames) if float(f['x']) < float(frames[0]['x'])),0)
paired=Image.new('RGB',(960,1080),'#ddd');d=ImageDraw.Draw(paired)
for i in range(12):
 ms=i*100;n=min(range(len(frames)),key=lambda n:abs(frames[n]['time']-frames[first]['time']-ms));x=i%2*480;y=i//2*180
 paired.paste(Image.open(P/f'm2-source-grass-{49+round(ms*60/1000):03d}.png'),(x,y));paired.paste(Image.open(P/'m2-grass-walk-frames'/f'{n:04d}.png'),(x+240,y))
 d.text((x,y+160),f"ref {1000.8+ms/1000:.3f}s / browser {frames[n]['time']:.1f}ms",fill='black')
paired.save(P/'m2-grass-timing-compare.png')
# Source screenshots are compressed1.5×; normalize them explicitly for comparison.
for reference,ours,name in [('pokemon-frlg/overworld/frlg-00410.00.png','m2-idle-native.png','m2-final-town-compare.png'),('_proof/m2-source-grass-049.png','m2-grass-match-native.png','m2-final-grass-compare.png'),('pokemon-frlg/overworld/frlg-07041.00.png','m2-chromium-native.png','m2-final-dialogue-compare.png')]:
 left=Image.open(R/'reference'/reference).convert('RGB').resize((240,160),Image.Resampling.NEAREST);right=Image.open(P/ours).convert('RGB');out=Image.new('RGB',(1920,640));out.paste(left.resize((960,640),Image.Resampling.NEAREST),(0,0));out.paste(right.resize((960,640),Image.Resampling.NEAREST),(960,0));out.save(P/name)
Image.open(P/'m2-idle-native.png').resize((960,640),Image.Resampling.NEAREST).save(P/'m2-overworld-4x.png')
assets=R/'public/assets/frlg';atlas=Image.open(assets/'town-tiles.png').convert('RGBA')
measurements={'camera':{'x':120,'feetY':88},'tiles':{},'sprites':{},'runtimeBytes':sum(p.stat().st_size for p in (R/'public/assets').rglob('*') if p.is_file())}
for name,index in [('ground',17),('grass',10),('ledge',151),('palletPath',662)]:
 x=index%16*16;y=index//16*16;im=atlas.crop((x,y,x+16,y+16));colors=Counter(px[:3] for px in im.getdata() if px[3])
 measurements['tiles'][name]={'index':index,'size':[16,16],'colours':len(colors),'dominant':[[n,'#%02x%02x%02x'%rgb] for rgb,n in colors.most_common(5)]}
for name,file,w,h in [('player','player.png',16,32),('charizard','charizard.png',16,16)]:
 im=Image.open(assets/file).convert('RGBA').crop((0,0,w,h));colors=Counter(px[:3] for px in im.getdata() if px[3])
 measurements['sprites'][name]={'frame':[w,h],'firstVisibleBounds':im.getbbox(),'colours':len(colors)}
measurements['playerFrames']={'walk':9,'run':9,'walkSequence':'foot8, idle8, opposite foot8, idle8','runSequence':'base5, foot3, base5, opposite foot3'}
(P/'m2-native-measurements.json').write_text(json.dumps(measurements,indent=2)+'\n')
print(json.dumps(metrics,indent=2))
