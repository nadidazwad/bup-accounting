"""Rebuild M1/M3 route-A runtime assets from the private native source library.

Run with `python -I scripts/build_m3_assets.py` after `build_overworld_assets.py`.
Sources live in reference/native-sources (see sources.json there). Every output
is written to public/assets and listed in src/game/assets.manifest.ts.
"""
from PIL import Image
from pathlib import Path
import struct, shutil, re

ROOT = Path(__file__).resolve().parents[1]
R = ROOT / 'reference/native-sources'
G = R / 'graphics'
OUT = ROOT / 'public/assets/frlg'
AUDIO = ROOT / 'public/assets/audio'
OUT.mkdir(parents=True, exist_ok=True); AUDIO.mkdir(parents=True, exist_ok=True)


def five(c):
    # GBA channels are five bits; match the overworld pipeline's display expansion.
    return tuple((int(v) >> 3) << 3 for v in c)


def jasc(path):
    lines = Path(path).read_text().split('\n')
    return [five(l.split()) for l in lines[3:3 + int(lines[2])]]


def png_pal(im):
    p = im.getpalette() or []
    return [five(p[i:i + 3]) for i in range(0, len(p), 3)]


def indexed(im, pal, transparent0=True):
    out = Image.new('RGBA', im.size); src = im.load(); dst = out.load()
    for y in range(im.height):
        for x in range(im.width):
            i = src[x, y]
            if i == 0 and transparent0: continue
            dst[x, y] = pal[i % len(pal)] + (255,)
    return out


def own(path):
    im = Image.open(path); return indexed(im, png_pal(im))


def tiles(im):
    return [im.crop((x, y, x + 8, y + 8)) for y in range(0, im.height, 8) for x in range(0, im.width, 8)]


def tilemap(tile_png, entries, pal, w, transparent0=True, u8_bank=None):
    ts = tiles(Image.open(tile_png)); h = (len(entries) + w - 1) // w
    out = Image.new('RGBA', (w * 8, h * 8))
    for k, e in enumerate(entries):
        t, bank = (e, u8_bank) if u8_bank is not None else (e & 1023, e >> 12)
        if t >= len(ts): continue
        src = ts[t].load(); cell = Image.new('RGBA', (8, 8)); cp = cell.load()
        for y in range(8):
            for x in range(8):
                i = src[x, y] & 15
                if i == 0 and transparent0: continue
                cp[x, y] = pal[(bank * 16 + i) % len(pal)] + (255,)
        if u8_bank is None and e & 1024: cell = cell.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
        if u8_bank is None and e & 2048: cell = cell.transpose(Image.Transpose.FLIP_TOP_BOTTOM)
        out.alpha_composite(cell, ((k % w) * 8, (k // w) * 8))
    return out


def u16(path):
    data = Path(path).read_bytes(); return list(struct.unpack(f'<{len(data) // 2}H', data))


def save(im, name):
    im.save(OUT / name, optimize=True)


SPECIES = {'charizard': 6, 'pikachu': 25, 'venusaur': 3, 'blastoise': 9, 'bayleef': 153, 'caterpie': 10}
FOLLOW = {'charizard': R / 'charizard.png', 'pikachu': R / 'follow/025-m-n.png', 'venusaur': R / 'follow/003-m-n.png',
          'blastoise': R / 'follow/009-b-n.png', 'bayleef': R / 'follow/153-b-n.png', 'caterpie': R / 'follow/010-b-n.png'}
icon_src = (R / 'src/pokemon_icon.c').read_text()
icon_pals = [jasc(G / f'pokemon/icon_palettes/icon_palette_{i}.pal') for i in range(3)]

# Pokémon: FRLG battle front/back pictures, party icons and HGSS-style 32×32 followers.
for name, dex in SPECIES.items():
    pal = jasc(G / f'pokemon/{name}/normal.pal')
    save(indexed(Image.open(G / f'pokemon/{name}/front.png'), pal).crop((0, 0, 64, 64)), f'front-{name}.png')
    save(indexed(Image.open(G / f'pokemon/{name}/back.png'), pal).crop((0, 0, 64, 64)), f'back-{name}.png')
    index = int(re.search(rf'\[SPECIES_{name.upper()}\]\s*=\s*(\d)', icon_src).group(1))
    save(indexed(Image.open(G / f'pokemon/{name}/icon.png'), icon_pals[index]), f'icon-{name}.png')
    save(own(FOLLOW[name]), f'follow-{name}.png')
    cry = R / f'cries/{dex}.ogg'
    if cry.exists(): shutil.copy(cry, AUDIO / f'cry-{name}.ogg')

# Overworld NPCs keep their embedded object-event palettes.
for out, src in {'npc-lass': 'lass', 'npc-youngster': 'youngster', 'npc-guard': 'policeman', 'npc-auditor': 'giovanni'}.items():
    save(own(G / f'object_events/pics/people/{src}.png').crop((0, 0, 9 * 16, 32)), f'{out}.png')

# Field effects and battle sprites.
emotes = own(G / 'misc/emoticons.png')
strip = Image.new('RGBA', (16 * 5, 16))
for row in range(5): strip.paste(emotes.crop((32, row * 16, 48, row * 16 + 16)), (row * 16, 0))
save(strip, 'emotes.png')
save(own(G / 'interface/ball/poke.png'), 'ball.png')
save(own(G / 'battle_anims/sprites/gold_stars.png'), 'stars.png')
# Title flames keep their native yellow core; the last four shades faded into the
# original's backdrop, so they become embers that fade into our dark-red sky.
fl = Image.open(G / 'title_screen/firered/flames.png'); flame_pal = png_pal(fl)
for i, c in zip(range(6, 10), [(224, 88, 24), (176, 48, 16), (136, 32, 16), (104, 24, 16)]): flame_pal[i] = five(c)
save(indexed(fl, flame_pal), 'flames.png')
save(own(G / 'party_menu/pokeball.png'), 'party-ball.png')
arrow = own(G / 'fonts/down_arrow_3.png')
save(arrow, 'arrow-down.png')
save(own(G / 'text_window/type1.png'), 'window.png')

# Trainer pictures for the professor's speech and the catch vignette.
save(indexed(Image.open(G / 'trainers/front_pics/professor_oak_front_pic.png'), jasc(G / 'trainers/palettes/professor_oak.pal')), 'prof.png')
save(own(G / 'oak_speech/red/pic.png'), 'red-full.png')
save(indexed(Image.open(G / 'trainers/back_pics/red_back_pic.png'), jasc(G / 'trainers/palettes/red_back_pic.pal')), 'red-back.png')
save(indexed(Image.open(G / 'trainers/front_pics/gentleman_front_pic.png'), jasc(G / 'trainers/palettes/gentleman.pal')), 'auditor-front.png')
plat = indexed(Image.open(G / 'oak_speech/platform.png'), jasc(G / 'oak_speech/platform.pal'))
parts = [plat.crop((0, y, 32, y + 32)) for y in (0, 32, 64)]
platform = Image.new('RGBA', (96, 32)); platform.paste(parts[0], (0, 0)); platform.paste(parts[1], (32, 0))
platform.paste(parts[0].transpose(Image.Transpose.FLIP_LEFT_RIGHT), (64, 0)); save(platform, 'oak-platform.png')
oak_png = G / 'oak_speech/oak_speech_bg.png'
save(tilemap(oak_png, u16(G / 'oak_speech/oak_speech_bg.bin'), png_pal(Image.open(oak_png)), 32, False).crop((0, 0, 240, 160)), 'oak-bg.png')

# FireRed title box art. Colour 0 is the title backdrop, so it stays transparent.
box = G / 'title_screen/firered/box_art_mon.png'
art = tilemap(box, u16(G / 'title_screen/firered/box_art_mon.bin'), jasc(G / 'title_screen/firered/box_art_mon.pal'), 32)
save(art.crop(art.getbbox()), 'title-mon.png')

# Battle terrain: the grass background, with the backdrop colour filled in.
terrain = tilemap(G / 'battle_terrain/grass/terrain.png', u16(G / 'battle_terrain/grass/terrain.bin'), jasc(G / 'battle_terrain/grass/terrain.pal'), 32, False)
bg = terrain.crop((0, 0, 240, 112)); px = bg.load()
backdrop = five((232, 248, 232))
for y in range(bg.height):
    for x in range(bg.width):
        if px[x, y][:3] == (0, 0, 0): px[x, y] = backdrop + (255,)
save(bg, 'battle-bg.png')
anim = tilemap(G / 'battle_terrain/grass/anim.png', u16(G / 'battle_terrain/grass/anim.bin'), jasc(G / 'battle_terrain/grass/terrain.pal'), 32)
save(anim.crop(anim.getbbox()) if anim.getbbox() else anim, 'battle-grass-anim.png')

# Battle text frames: message box, action menu and move menu variants.
box = tilemap(G / 'battle_interface/textbox.png', u16(G / 'battle_interface/textbox.bin'), jasc(G / 'battle_interface/textbox1.pal'), 32, False)
frames = Image.new('RGBA', (240, 48 * 3))
for i, top in enumerate((112, 272, 432)):
    frames.paste(box.crop((0, top, 240, top + 48)), (0, i * 48))
save(frames, 'battle-box.png')

# Party menu: native background and slot boxes in normal, selected and swap palettes.
party_png = G / 'party_menu/bg.png'; party_pal = png_pal(Image.open(party_png))
save(tilemap(party_png, u16(G / 'party_menu/bg.bin'), party_pal, 32, False).crop((0, 0, 240, 160)), 'party-bg.png')
main = list((G / 'party_menu/slot_main.bin').read_bytes()); wide = list((G / 'party_menu/slot_wide.bin').read_bytes())
empty = list((G / 'party_menu/slot_wide_empty.bin').read_bytes())
slots = Image.new('RGBA', (80 + 144, 56 * 3))
for i, bank in enumerate((3, 7, 9)):
    slots.paste(tilemap(party_png, main, party_pal, 10, u8_bank=bank), (0, i * 56))
    slots.paste(tilemap(party_png, wide, party_pal, 18, u8_bank=bank), (80, i * 56))
    slots.paste(tilemap(party_png, empty, party_pal, 18, u8_bank=0 if i == 0 else bank), (80, i * 56 + 28))
save(slots, 'party-slots.png')

# Bag screen: native background, the male bag sprite and the type badges.
bag_png = G / 'item_menu/bg.png'
save(tilemap(bag_png, u16(G / 'item_menu/bg.bin'), png_pal(Image.open(bag_png)), 32, False).crop((0, 0, 240, 160)), 'bag-bg.png')
save(indexed(Image.open(G / 'interface/bag_male.png'), jasc(G / 'interface/bag.pal')), 'bag.png')
info = Image.open(G / 'interface/menu_info.png')
save(indexed(info, png_pal(info)).crop((0, 16, 128, 16 + 12 * 5)), 'types.png')

# Opponent healthbox: the two native 64×32 halves side by side.
hb = indexed(Image.open(G / 'battle_interface/healthbox_singles_opponent.png'), jasc(G / 'battle_interface/healthbox.pal'))
save(hb.crop(hb.getbbox()), 'healthbox-enemy.png')

# Naming screen background and keyboard frame.
menu_png = G / 'naming_screen/menu.png'
naming = tilemap(menu_png, u16(G / 'naming_screen/background.bin'), jasc(G / 'naming_screen/menu.pal'), 32, False)
naming.alpha_composite(tilemap(menu_png, u16(G / 'naming_screen/keyboard_upper.bin'), jasc(G / 'naming_screen/keyboard.pal'), 32))
save(naming.crop((0, 0, 240, 160)), 'naming-bg.png')

# Bag icons: two native item icons plus original accounting items drawn in the same 24×24 style.
for item, src in {'potion': 'potion', 'pokeball': 'poke_ball'}.items():
    save(indexed(Image.open(G / f'items/icons/{src}.png'), jasc(G / f'items/icon_palettes/{src}.pal')), f'item-{item}.png')
INK = {'#': (40, 40, 48), 'w': (248, 248, 248), 'g': (200, 200, 208), 'd': (128, 128, 144), 'r': (232, 72, 56),
       'y': (248, 216, 88), 'o': (208, 136, 48), 'b': (72, 120, 216), 'l': (168, 200, 248), 'G': (88, 176, 88), 'p': (232, 224, 200),
       'k': (168, 152, 120)}
ICONS = {
    'receipt': """
.......############.....
.......#wwwwwwwwww#.....
.......#w##w##w#ww#.....
.......#wwwwwwwwww#.....
.......#w###ww##ww#.....
.......#wwwwwwwwww#.....
.......#w##wwww##w#.....
.......#wwwwwwwwww#.....
.......#w####w###w#.....
.......#wwwwwwwwww#.....
.......#wddddddddw#.....
.......#wwwwwwwwww#.....
.......#w###ww#r#w#.....
.......#wwwwwwwrww#.....
.......#wwwwwwwwww#.....
.......#w#w#w#w#w##.....
.......##.#.#.#.#.......
""",
    'calculator': """
......############......
.....#dddddddddddd#.....
.....#d##########d#.....
.....#d#GGGGGGGG#d#.....
.....#d#GGGG#G#G#d#.....
.....#d##########d#.....
.....#dddddddddddd#.....
.....#dwwdwwdwwdyyd#....
.....#dwwdwwdwwdyyd#....
.....#dddddddddddd#.....
.....#dwwdwwdwwdyyd#....
.....#dwwdwwdwwdyyd#....
.....#dddddddddddd#.....
.....#dwwdwwdwwdrrd#....
.....#dwwdwwdwwdrrd#....
.....#dddddddddddd#.....
......############......
""",
    'invoice': """
.....##############.....
.....#pppppppppppp#.....
.....#p##pppp#####p#....
.....#pppppppppppp#.....
.....#p#########pp#.....
.....#pppppppppppp#.....
.....#pk#kk#k#kk#p#.....
.....#pppppppppppp#.....
.....#pk#kk#k#kk#p#.....
.....#pppppppppppp#.....
.....#prrrrrrrrrrp#.....
.....#prwwrwwrwwrp#.....
.....#prrrrrrrrrrp#.....
.....#pppppppppppp#.....
.....#ppppppp###pp#.....
.....##############.....
""",
}
for name, art in ICONS.items():
    rows = [r for r in art.strip('\n').split('\n')]
    im = Image.new('RGBA', (24, 24)); top = (24 - len(rows)) // 2
    for y, row in enumerate(rows):
        for x, ch in enumerate(row[:24]):
            if ch in INK: im.putpixel((x, top + y), INK[ch] + (255,))
    save(im, f'item-{name}.png')

# Text colours. Field text keeps the native gray; NPC speakers use the native
# blue/red pairs from stdpal_0, and battle text is white on the dark message box.
font = Image.open(G / 'fonts/latin_normal.png')
for name, colours in {'text-blue': [(49, 82, 205), (164, 197, 246), None],
                      'text-red': [(230, 8, 8), (255, 189, 115), None],
                      'text-white': [(248, 248, 248), (104, 104, 104), None],
                      # Title wordmark layers: a gold face over a solid navy edge.
                      'text-gold': [(255, 216, 40), (224, 152, 0), None],
                      'text-edge': [(32, 56, 144), (32, 56, 144), None]}.items():
    im = Image.new('RGBA', font.size); src = font.load(); dst = im.load()
    for y in range(font.height):
        for x in range(font.width):
            i = src[x, y]
            if i == 0 or colours[i - 1] is None: continue
            dst[x, y] = five(colours[i - 1]) + (255,)
    save(im, f'{name}.png')
print('Built M3 assets into', OUT.relative_to(ROOT))

# The native small font (copyright lines, party levels). Same charmap, 8×16 cells.
import xml.etree.ElementTree as ET
small = Image.open(G / 'fonts/latin_small.png')
im = Image.new('RGBA', small.size); src = small.load(); dst = im.load()
for y in range(small.height):
    for x in range(small.width):
        i = src[x, y]
        if i in (1, 2): dst[x, y] = five([(96, 96, 96), (208, 208, 200)][i - 1]) + (255,)
save(im, 'text-small.png')
white = Image.new('RGBA', small.size); dst = white.load()
for y in range(small.height):
    for x in range(small.width):
        i = src[x, y]
        if i in (1, 2): dst[x, y] = five([(248, 248, 248), (88, 88, 88)][i - 1]) + (255,)
save(white, 'text-small-white.png')
widths = list(map(int, re.findall(r'\d+', re.search(r'sFontSmallLatinGlyphWidths\[\]\s*=\s*\{(.*?)\}', (R / 'src/text.c').read_text(), re.S).group(1))))
chars = {m[0]: int(m[1], 16) for m in re.findall(r"^'(.)'\s*=\s*([A-F0-9]{2})$", (R / 'charmap.txt').read_text(), re.M)}
xml = ET.Element('font'); ET.SubElement(xml, 'info', face='frlg-small', size='12')
ET.SubElement(xml, 'common', lineHeight='13', base='11', scaleW='256', scaleH='256', pages='1')
ET.SubElement(ET.SubElement(xml, 'pages'), 'page', id='0', file='text-small.png')
ch = ET.SubElement(xml, 'chars', count=str(len(chars)))
for c, i in chars.items():
    ET.SubElement(ch, 'char', id=str(ord(c)), x=str(i % 32 * 8), y=str(i // 32 * 16), width=str(widths[i]), height='13',
                  xoffset='0', yoffset='0', xadvance=str(widths[i] + 1 if c != ' ' else widths[i]), page='0', chnl='15')
ET.ElementTree(xml).write(OUT / 'text-small.xml', encoding='utf-8')
print('Built small font')
