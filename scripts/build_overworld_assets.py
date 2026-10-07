"""Rebuild local route-A assets from downloaded native source files. Run python -I."""
from PIL import Image, ImageDraw
from pathlib import Path
import struct,re,json,xml.etree.ElementTree as ET
ROOT=Path(__file__).resolve().parents[1];R=ROOT/'reference/native-sources';OUT=ROOT/'public/assets/frlg';OUT.mkdir(parents=True,exist_ok=True)
g=R/'data/tilesets/primary/general';s=R/'data/tilesets/secondary/pallet_town'
# GBA channels are five bits. Match the reference capture's 5-bit left-shift display.
def pal(p):return [tuple((int(v) >> 3) << 3 for v in l.split()) for l in p.read_text().splitlines()[3:]]
pals=[pal((g if n<7 else s)/'palettes'/f'{n:02d}.pal') for n in range(16)]
alltiles=[]
for p in [g/'tiles.png',s/'tiles.png']:
 im=Image.open(p);alltiles.append([im.crop((x,y,x+8,y+8)) for y in range(0,im.height,8) for x in range(0,im.width,8)])
def rgba(im,colors,transparent=True,transparent_indices=(0,)):
 out=Image.new('RGBA',im.size);out.putdata([colors[i]+(0 if transparent and i in transparent_indices else 255,) for i in im.get_flattened_data()]);return out

def groundless(im):
 # Remove flat grass and its dots. Convert grass-shadow shades to translucent
 # black so the same object casts a shadow on either grass or a pale path.
 clear={pals[0][i] for i in [8,12,13]};shadows={pals[0][14]:60,pals[0][15]:104}
 out=im.copy();out.putdata([(0,0,0,0) if p[:3] in clear else
                          (0,0,0,shadows[p[:3]]) if p[:3] in shadows else p
                          for p in im.get_flattened_data()]);return out

def tile(v,overrides=None):
 idx=v&1023;ts=alltiles[0] if idx<640 else alltiles[1];idx=idx if idx<640 else idx-640
 im=rgba((overrides or {}).get(v&1023,ts[idx]),pals[v>>12])
 if v&1024:im=im.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
 if v&2048:im=im.transpose(Image.Transpose.FLIP_TOP_BOTTOM)
 return im
def metatile(vals,overrides=None):
 im=Image.new('RGBA',(16,16),pals[vals[0]>>12][0]+(255,))
 for k,v in enumerate(vals):im.alpha_composite(tile(v,overrides),((k%4%2)*8,(k%4//2)*8))
 return im
metas=[];definitions=[]
for d in [g,s]:
 data=(d/'metatiles.bin').read_bytes()
 for off in range(0,len(data),16):
  vals=struct.unpack_from('<8H',data,off);definitions.append(vals);metas.append(metatile(vals))
# Preserve native ground tiles and append transparent scenery variants.
sign_tile=len(metas);metas.append(groundless(metas[3]))
bush_tile=len(metas);metas.append(groundless(metas[5]))
cut_tree_tile=len(metas)
metas.append(rgba(Image.open(R/'graphics/object_events/pics/misc/cut_tree.png'),
                  pal(R/'graphics/object_events/palettes/npc_green.pal')).crop((0,0,16,16)))
atlas=Image.new('RGBA',(256,((len(metas)+15)//16)*16))
contact=Image.new('RGB',(800,((len(metas)+15)//16)*58),'#ddd');draw=ImageDraw.Draw(contact)
for i,im in enumerate(metas):
 atlas.paste(im,((i%16)*16,(i//16)*16));x=i%16*50;y=i//16*58;contact.paste(im.resize((48,48),Image.Resampling.NEAREST),(x,y));draw.text((x,y+47),str(i),fill='black')
atlas.save(OUT/'town-tiles.png');contact.save(ROOT/'reference/_proof/m2-metatiles.png')
playerpal=pal(R/'graphics/object_events/palettes/player.pal')
walk=rgba(Image.open(R/'graphics/object_events/pics/people/red_normal.png'),playerpal)
run=rgba(Image.open(R/'graphics/object_events/pics/people/red_surf_run.png'),playerpal)
# The original RedNormal frame table appends running frames 3..11 from SurfRun.
player=Image.new('RGBA',(18*16,32));player.paste(walk,(0,0));player.paste(run.crop((3*16,0,12*16,32)),(9*16,0));player.save(OUT/'player.png')
im=Image.open(R/'charizard.png');rgba(im,[tuple(im.getpalette()[i:i+3]) for i in range(0,768,3)]).resize((64,64),Image.Resampling.NEAREST).save(OUT/'charizard.png')
font=Image.open(R/'graphics/fonts/latin_normal.png');colors=[(0,0,0),(96,96,96),(208,208,200),(248,248,248)]
# Index 3 is the glyph cell background; keep it clear so text works on any window.
fontout=rgba(font,colors,transparent_indices=(0,3));fontout.save(OUT/'text.png')
widths=list(map(int,re.findall(r'\d+',re.search(r'sFontNormalLatinGlyphWidths\[\]\s*=\s*\{(.*?)\}',(R/'src/text.c').read_text(),re.S).group(1))))
chars={m[0]:int(m[1],16) for m in re.findall(r"^'(.)'\s*=\s*([A-F0-9]{2})$",(R/'charmap.txt').read_text(),re.M)}
chars['▼']=0x7a
xml=ET.Element('font');ET.SubElement(xml,'info',face='frlg',size='14');ET.SubElement(xml,'common',lineHeight='15',base='12',scaleW='256',scaleH='512',pages='1');pages=ET.SubElement(xml,'pages');ET.SubElement(pages,'page',id='0',file='text.png');ch=ET.SubElement(xml,'chars',count=str(len(chars)))
for c,i in chars.items():ET.SubElement(ch,'char',id=str(ord(c)),x=str(i%16*16),y=str(i//16*16),width=str(widths[i]),height='14',xoffset='0',yoffset='0',xadvance=str(widths[i]+1),page='0',chnl='15')
ET.ElementTree(xml).write(OUT/'text.xml',encoding='utf-8')
frame=rgba(Image.open(R/'graphics/text_window/menu_message.png'),pal(R/'graphics/text_window/stdpal_0.pal'));frame.save(OUT/'textbox.png')
print('Rebuilt',len(metas),'metatiles; native font and sprite sheets')
# One complete crown: 22/23 are the tip of the next tree in a forest row.
native_tree=Image.new('RGBA',(32,48))
for k,i in enumerate([14,15,30,31,38,39]):native_tree.paste(metas[i],(k%2*16,k//2*16))
native_tree=groundless(native_tree)
# Extend the crown with nearest-neighbour pixels, preserving the native trunk.
# Rendering anchors the 64px image at the original collision footprint's feet.
tree=Image.new('RGBA',(32,64))
tree.paste(native_tree.crop((0,0,32,32)).resize((32,48),Image.Resampling.NEAREST),(0,0))
tree.paste(native_tree.crop((0,32,32,48)),(0,48))
tree.save(OUT/'tree.png')
# Flower files are complete 16x16 frames. Water files are packed banks of 48
# 8x8 tiles, uploaded to native tile slots 416..463, not 16x16 sprite frames.
frames=[rgba(Image.open(p),pals[0],transparent_indices=(0,13)) for p in sorted((g/'anim/flower').glob('*.png'))]
sheet=Image.new('RGBA',(16*len(frames),16))
for i,im in enumerate(frames):sheet.paste(im,(i*16,0))
sheet.save(OUT/'flower.png')
# Native grass field-effect frames have transparent blades, including an idle
# fringe. Remove the full-tile grass backdrop from the first rustling pose.
rgba(Image.open(R/'graphics/field_effects/pics/tall_grass.png'),
     pal(R/'graphics/field_effects/palettes/general_1.pal'),
     transparent_indices=(0,12,13,14,15)).save(OUT/'grass-effect.png')
# Close the pool with the original pond's corners, sides and bottom banks.
pond=[[421]+[422]*5+[423],[429]+[430]*5+[431],
      [429]+[430]*5+[431],[548]+[549]*5+[550]]
pond_base=Image.new('RGBA',(112,64))
for y,row in enumerate(pond):
 for x,i in enumerate(row):pond_base.paste(metas[i],(x*16,y*16))
# The native pond is still water. Adapt the native ocean's surface animation to
# its water mask, leaving every grass/rock/shadow pixel fixed at the shoreline.
water_files=sorted((g/'anim/water_current_landwatersedge').glob('*.png'))
sheet=Image.new('RGBA',(112*len(water_files),64))
for frame,p in enumerate(water_files):
 im=Image.open(p)
 bank={416+k:im.crop((x,y,x+8,y+8)) for k,(x,y) in enumerate(( (x,y) for y in range(0,im.height,8) for x in range(0,im.width,8) ))}
 surface=metatile(definitions[299],bank)
 out=pond_base.copy()
 for y in range(out.height):
  for x in range(out.width):
   if pond_base.getpixel((x,y))[:3]==pals[3][12]:out.putpixel((x,y),surface.getpixel((x%16,y%16)))
 sheet.paste(out,(frame*112,0))
sheet.save(OUT/'water.png')
# Custom Tiled map. Gameplay collision, ledges, spawn and talk targets live here.
W,H=40,30;ground=[18]*(W*H);decor=[0]*(W*H);collision=[0]*(W*H);grass=[0]*(W*H);objects=[]
def put(layer,x,y,i):
 if 0<=x<W and 0<=y<H:layer[y*W+x]=i+1

def rect(layer,x,y,w,h,i):
 for yy in range(y,y+h):
  for xx in range(x,x+w):put(layer,xx,yy,i)
def obj(name,kind,x,y,w=1,h=1,**props):
 objects.append(dict(id=len(objects)+1,name=name,type=kind,x=x*16,y=y*16,width=w*16,height=h*16,properties=[dict(name=k,type='string' if isinstance(v,str) else 'int',value=v) for k,v in props.items()]))
# Dotted Pallet paths connect a long loop to the northern ledge clearing.
rect(ground,8,16,3,13,662);rect(ground,8,23,26,3,662);rect(ground,16,7,3,18,662);rect(ground,4,7,15,3,662);rect(ground,21,6,3,8,662);put(ground,22,5,662)
# M3: the Auditor's clearing north of the fence.
rect(ground,17,2,11,3,662)
for x,y,w,h in [(4,12,6,4),(24,12,6,6),(5,5,7,3)]:rect(ground,x,y,w,h,10);rect(grass,x,y,w,h,10)
# Edge forests and interior groves, all with solid trunk footprints.
for y in range(1,H-2,2):
 for x in [0,2,36,38]:obj('forest','tree',x,y,2,3);rect(collision,x,y+1,2,2,0)
for x in range(4,36,2):
 for y in [1,27]:
  # Above the arena the northern forest sits one row higher to open a clearing.
  if y==1 and 14<=x<=34:y=-1
  obj('forest','tree',x,y,2,3);rect(collision,x,y+1,2,2,0)
for x,y in [(12,17),(12,19),(20,17),(20,19),(30,13),(32,13),(10,3),(12,3)]:obj('grove','tree',x,y,2,3);rect(collision,x,y+1,2,2,0)
# The Pallet house occupies five rows, including both roof rows and the door.
for yy,row in enumerate([[641,642,642,642,643],[649,650,650,650,651],
                         [657,659,658,658,660],[664,665,666,667,668],
                         [672,675,674,673,676]]):
 for xx,i in enumerate(row):put(decor,4+xx,19+yy,i);put(collision,4+xx,19+yy,0)
obj('office','talk',5,23,message='The office is closed. Even accountants need an adventure.')
put(decor,11,24,sign_tile);put(collision,11,24,0);obj('hq-sign','talk',11,24,message='LEDGER HOUSE: Where every number has a home.')
obj('spawn','spawn',9,24);obj('follower','spawn',9,25)
# A one-way ledge separates the north-west clearing from the southern grass.
for x in range(4,15):put(decor,x,10,151);put(collision,x,10,0);obj('ledge','ledge',x,10,direction='down')
# The fence seals the clearing from forest to forest. The guard stands in its only gap.
for x in range(14,36):
 if x!=22:put(decor,x,5,214);put(collision,x,5,0)
obj('guard','npc',22,5,sprite='npc-guard',facing='down')
obj('broker','npc',22,2,sprite='npc-broker',facing='down')
obj('lass','npc',25,24,sprite='npc-lass',facing='left',wander=2,message='Have you heard? BUPAF is the event of the year! I already filed my outfit as a business expense.')
obj('youngster','npc',23,17,sprite='npc-youngster',facing='left',wander=1,message='My RATTATA is in the top 1% of RATTATA… for expense reports.')
put(decor,20,6,sign_tile);put(collision,20,6,0);obj('counter','talk',20,6,message='@counter')
# More townsfolk. Their lines and little scripts live in src/game/overworld/dialogue.ts.
for name,sprite,x,y,facing in [('aide','npc-scientist',29,11,'up'),('investor','npc-gentleman',26,6,'down'),('blackbelt','npc-blackbelt',12,14,'right'),
    ('rocker','npc-rocker',35,23,'left'),('oldman','npc-oldman',15,21,'down'),('worker','npc-worker',30,3,'left'),
    ('cooltrainer','npc-cooltrainer',19,14,'left'),('bugcatcher','npc-bugcatcher',12,6,'down'),('beauty','npc-beauty',26,8,'left'),
    ('grandma','npc-oldwoman',11,18,'left'),('fisher','npc-fisher',30,24,'up'),('kid','npc-kid',7,24,'down'),('maniac','npc-maniac',5,8,'right')]:
 obj(name,'npc',x,y,sprite=sprite,facing=facing)
# Revision 2: PIKACHU and VENUSAUR hide in the tall grass. Walking within two
# tiles makes them pop out and start a wild battle. Venusaur is in the north-west
# patch above the ledge, so it needs the long way round.
obj('venusaur','hidden',7,6,species='Venusaur')
obj('pikachu','hidden',27,15,species='Pikachu')
# Small pond with shore collision and native water animation.
rect(collision,26,20,7,4,0)
for y,row in enumerate(pond):
 for x,i in enumerate(row):put(ground,26+x,20+y,i)
# Flowers are walkable decoration: beds by the house, along path verges and by the lab.
for x,y in [(5,25),(6,25),(7,25),(12,22),(13,22),(14,22),(19,22),(20,22),(19,10),(20,10),(24,7),(25,7),(24,8),
            (34,21),(34,22),(13,16),(14,16),(26,4),(18,4)]:obj('flowers','flower',x,y)
obj('pond','water',26,20,7,4)

# ——— Revision 2 props, lifted from the native Pallet Town layout ———
# PROF. LEDGER's lab: the native 7×5 Oak's lab block, door in the bottom row.
lab=[[680,681,681,681,681,701,693],[688,689,689,689,689,691,692],[696,697,697,697,697,699,700],
     [704,705,720,706,707,708,709],[712,713,728,684,715,716,717]]
for yy,row in enumerate(lab):
 for xx,i in enumerate(row):put(decor,28+xx,6+yy,i);put(collision,28+xx,6+yy,0)
obj('lab','talk',31,10,message="PROF. LEDGER’s LAB. It’s locked. A note on the door says: Out catching rounding errors.")
rect(ground,24,11,9,1,662)
put(decor,27,10,sign_tile);put(collision,27,10,0);obj('lab-sign','talk',27,10,message='PROF. LEDGER’s POKéMON LAB. Research into POKéMON and quarterly returns.')
# The house yard: a mailbox by the front step.
put(decor,4,24,685);put(collision,4,24,0);obj('mailbox','talk',4,24,message='It’s stuffed with bills. Every single one says FINAL NOTICE.')
# THE BROKER's trading floor: a stone plaza flanked by posts, with a sign at the gate.
for xx in range(18,27):
 put(ground,xx,2,357 if xx==18 else 359 if xx==26 else 358)
 put(ground,xx,3,373 if xx==18 else 375 if xx==26 else 374)
for x in (17,27):put(decor,x,2,361);put(collision,x,2,0)
put(decor,24,4,360);put(collision,24,4,0);obj('floor-sign','talk',24,4,message='THE BROKER’S TRADING FLOOR. Minimum deposit: 3 POKéMON. No refunds.')
# Boulders in otherwise empty grass.
for x,y in [(13,12),(14,14),(34,24),(25,9),(35,7)]:put(decor,x,y,159);put(collision,x,y,0)
# A route note at the north-west grass.
put(decor,15,6,sign_tile);put(collision,15,6,0);obj('grass-sign','talk',15,6,message='ROUTE NOTE: Shy POKéMON hide in tall grass. Walk close and they’ll jump out!')

# Soft path verges, as in native Pallet Town: every light-path cell that meets
# grass becomes the matching edge or corner metatile. Plaza counts as path.
PATH=663;LIGHT={663}|{i+1 for i in (357,358,359,373,374,375)}
def light(x,y):return not(0<=x<W and 0<=y<H) or ground[y*W+x] in LIGHT
edges=[0]*(W*H)
for y in range(H):
 for x in range(W):
  if ground[y*W+x]!=PATH:continue
  n,s,w,e=light(x,y-1),light(x,y+1),light(x-1,y),light(x+1,y)
  if (not n and not s) or (not w and not e):continue
  t=(678 if not w else 655 if not e else 654) if not n else (694 if not w else 671 if not e else 670) if not s else 686 if not w else 663 if not e else \
    702 if not light(x-1,y-1) else 703 if not light(x+1,y-1) else 710 if not light(x-1,y+1) else 711 if not light(x+1,y+1) else None
  if t:edges[y*W+x]=t+1
for k,v in enumerate(edges):
 if v:ground[k]=v
layers=[dict(id=i+1,name=n,type='tilelayer',width=W,height=H,x=0,y=0,opacity=1,visible=n not in ['Collision','Grass'],data=d) for i,(n,d) in enumerate([('Ground',ground),('Structures',decor),('Collision',collision),('Grass',grass)])]
layers.append(dict(id=5,name='Objects',type='objectgroup',opacity=1,visible=True,objects=objects))
mapdata=dict(type='map',version='1.10',tiledversion='1.11.2',orientation='orthogonal',renderorder='right-down',width=W,height=H,tilewidth=16,tileheight=16,infinite=False,layers=layers,tilesets=[dict(firstgid=1,name='town',tilewidth=16,tileheight=16,tilecount=len(metas),columns=16,image='../frlg/town-tiles.png',imagewidth=atlas.width,imageheight=atlas.height)])
mp=ROOT/'public/assets/maps';mp.mkdir(parents=True,exist_ok=True);(mp/'town.tmj').write_text(json.dumps(mapdata,separators=(',',':')))
