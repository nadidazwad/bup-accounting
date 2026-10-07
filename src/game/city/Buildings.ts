// Draws the city's buildings, billboards, trees and lamp heads in GTA 2's
// pseudo-3D: every frame, roofs are projected away from the camera centre and
// the walls facing the camera are filled in between. Each building has its own
// wall layer, a tiled pixel-art roof and a detail layer, depth-sorted by height
// so taller walls overlap lower roofs. Triangles only, no per-frame allocation.
import Phaser from "phaser";
import type { Billboard, Building, CityLayout } from "./layout";
import { FLOOR } from "./layout";
import { EYE, leanScale, visibleWalls, N, E, S, W } from "./projection";
import { roofKeys } from "./textures";
import { renderPixelText, PixelText } from "../ui/pixelText";

type Style = { wall: number; rim: number; detail: number; lit: number; dark: number; ribbon?: boolean };
const styles: Style[] = [
  { wall: 0x8a8d93, rim: 0xa3a6ac, detail: 0x777a80, lit: 0xe8d890, dark: 0x2a3440 },
  { wall: 0x8c4a38, rim: 0x9c6a52, detail: 0x6e6058, lit: 0xf0d080, dark: 0x2a2420 },
  { wall: 0x3c6c7a, rim: 0x6a8a94, detail: 0x56666c, lit: 0xb8f0ff, dark: 0x1a3038, ribbon: true },
  { wall: 0xb0a07e, rim: 0xc4b694, detail: 0x6e665a, lit: 0xf8e0a0, dark: 0x3a3428 },
  { wall: 0x37435e, rim: 0x5a6680, detail: 0x2c3038, lit: 0xffe070, dark: 0x161c2a, ribbon: true },
  { wall: 0x5d6d5b, rim: 0x7a8a78, detail: 0x3c443c, lit: 0xe0f0a0, dark: 0x1e281e },
  { wall: 0x1b2130, rim: 0xc8a040, detail: 0x3a4058, lit: 0xffc848, dark: 0x0c0f18, ribbon: true },
];
// Light comes from the south-east: south and east walls are brighter.
const faceLight: Record<number, number> = { [N]: 0.62, [E]: 0.9, [S]: 1, [W]: 0.74 };
const shadeInt = (c: number, k: number) =>
  (Math.min(255, ((c >> 16) & 255) * k) << 16) | (Math.min(255, ((c >> 8) & 255) * k) << 8) | Math.min(255, (c & 255) * k);

type Shaded = { walls: Record<number, number>; ledges: Record<number, number>; frames: Record<number, number>; lit: Record<number, number>; dark: Record<number, number> };
type Block = { def: Building; walls: Phaser.GameObjects.Graphics; roof: Phaser.GameObjects.TileSprite; detail: Phaser.GameObjects.Graphics; seed: number };
const RIM = 4;

export class BuildingRenderer {
  private readonly low: Phaser.GameObjects.Graphics;
  private readonly blocks: Block[];
  private readonly shaded: Shaded[];
  private readonly trees: { image: Phaser.GameObjects.Image; x: number; y: number; r: number }[] = [];
  private readonly boards: { def: Billboard; image: Phaser.GameObjects.Image; posts: Phaser.GameObjects.Graphics }[] = [];
  private readonly towerSign: PixelText;
  /** For tests and telemetry: how many buildings were drawn last frame. */
  drawn = 0;

  constructor(private readonly scene: Phaser.Scene, private readonly layout: CityLayout) {
    this.low = scene.add.graphics().setDepth(48);
    this.shaded = styles.map((s) => {
      const out: Shaded = { walls: {}, ledges: {}, frames: {}, lit: {}, dark: {} };
      for (const f of [N, E, S, W]) {
        out.walls[f] = shadeInt(s.wall, faceLight[f]);
        out.ledges[f] = shadeInt(s.wall, faceLight[f] * 0.72);
        out.frames[f] = shadeInt(s.wall, faceLight[f] * 0.5);
        out.lit[f] = shadeInt(s.lit, 0.75 + faceLight[f] * 0.25);
        out.dark[f] = shadeInt(s.dark, faceLight[f] + 0.15);
      }
      return out;
    });
    const sorted = [...layout.buildings].sort((a, b) => a.height - b.height);
    this.blocks = sorted.map((def, i) => {
      const depth = 60 + i * 0.004;
      return {
        def, seed: i * 7919,
        walls: scene.add.graphics().setDepth(depth),
        roof: scene.add.tileSprite(0, 0, def.w - RIM * 2, def.h - RIM * 2, roofKeys[def.style] ?? "roof-tar").setOrigin(0).setDepth(depth + 0.001),
        detail: scene.add.graphics().setDepth(depth + 0.002),
      };
    });
    for (const t of layout.trees) this.trees.push({ image: scene.add.image(t.x, t.y, "city-tree").setDepth(50), x: t.x, y: t.y, r: t.r });
    layout.billboards.forEach((def, i) => {
      const key = `billboard-${i}`;
      if (!scene.textures.exists(key)) makeBillboard(scene, key, def);
      this.boards.push({ def, image: scene.add.image(0, 0, key).setOrigin(0).setDepth(61.1), posts: scene.add.graphics().setDepth(61) });
    });
    this.towerSign = new PixelText(scene, 0, 0, layout.tower.sign ?? "", { size: 40, fill: ["#fff6b0", "#f5c518", "#f5c518", "#c07810"], outline: "#000000", shadow: "#3a2400", shadowOffset: 2 });
    this.towerSign.setOrigin(0.5).setDepth(61.5);
  }

  /** cx, cy: camera centre in world px. zoom: world zoom relative to 1. halfW/H: half extents of the visible area. */
  draw(cx: number, cy: number, zoom: number, halfW: number, halfH: number, time: number) {
    const eye = EYE / Math.max(0.05, zoom);
    const low = this.low;
    low.clear();
    const left = cx - halfW - 40, right = cx + halfW + 40, top = cy - halfH - 40, bottom = cy + halfH + 40;
    const detailed = zoom > 0.62;

    // Lamp heads: a little housing with a warm bulb, 70 px up.
    const ls = leanScale(eye, 70);
    for (const l of this.layout.lamps) {
      if (l.x < left || l.x > right || l.y < top || l.y > bottom) continue;
      const px = Math.round(cx + (l.x - cx) * ls), py = Math.round(cy + (l.y - cy) * ls);
      low.fillStyle(0x16161a, 1).fillRect(px - 3, py - 3, 6, 6);
      low.fillStyle(0x4a4a52, 1).fillRect(px - 3, py - 3, 6, 1);
      low.fillStyle(0xffd890, 1).fillRect(px - 1, py - 1, 3, 3);
    }
    for (const { image, x, y, r } of this.trees) {
      const visible = x > left - r && x < right + r && y > top - r && y < bottom + r;
      image.setVisible(visible);
      if (!visible) continue;
      const s = leanScale(eye, 34 + r);
      image.setPosition(cx + (x - cx) * s, cy + (y - cy) * s).setScale((s * r * 2) / 48);
    }

    this.drawn = 0;
    for (const block of this.blocks) {
      const b = block.def;
      const s = leanScale(eye, b.height);
      const rx0 = cx + (b.x - cx) * s, ry0 = cy + (b.y - cy) * s;
      const rx1 = cx + (b.x + b.w - cx) * s, ry1 = cy + (b.y + b.h - cy) * s;
      const visible = !(Math.max(rx1, b.x + b.w) < left || Math.min(rx0, b.x) > right || Math.max(ry1, b.y + b.h) < top || Math.min(ry0, b.y) > bottom);
      block.walls.setVisible(visible); block.roof.setVisible(visible); block.detail.setVisible(visible);
      if (!visible) continue;
      this.drawn++;
      const st = styles[b.style], sh = this.shaded[b.style];
      const g = block.walls, d = block.detail;
      g.clear(); d.clear();
      const faces = visibleWalls(b, cx, cy);
      if (faces & N) this.wall(g, block, N, b.x, b.y, b.x + b.w, b.y, eye, cx, cy, st, sh, detailed);
      if (faces & S) this.wall(g, block, S, b.x, b.y + b.h, b.x + b.w, b.y + b.h, eye, cx, cy, st, sh, detailed);
      if (faces & W) this.wall(g, block, W, b.x, b.y, b.x, b.y + b.h, eye, cx, cy, st, sh, detailed);
      if (faces & E) this.wall(g, block, E, b.x + b.w, b.y, b.x + b.w, b.y + b.h, eye, cx, cy, st, sh, detailed);
      // Parapet: a lit rim with a dark lower lip; the tiled roof sits inside it.
      g.fillStyle(st.rim, 1).fillRect(rx0, ry0, rx1 - rx0, ry1 - ry0);
      g.fillStyle(shadeInt(st.rim, 1.2), 1).fillRect(rx0, ry0, rx1 - rx0, s);
      g.fillStyle(shadeInt(st.rim, 0.6), 1).fillRect(rx0, ry1 - s, rx1 - rx0, s);
      block.roof.setPosition(rx0 + RIM * s, ry0 + RIM * s).setScale(s);
      // Inner shadow under the north and west parapet.
      d.fillStyle(0x000000, 0.35).fillRect(rx0 + RIM * s, ry0 + RIM * s, rx1 - rx0 - 2 * RIM * s, 2 * s).fillRect(rx0 + RIM * s, ry0 + RIM * s, 2 * s, ry1 - ry0 - 2 * RIM * s);
      for (const det of b.details) this.detail(d, det, rx0, ry0, s, b, eye, cx, cy, st, time);
      if (b.tower) {
        // Rooftop beacons: a slow pulse, never a flash.
        const pulse = 0.55 + 0.45 * Math.sin(time / 600);
        d.fillStyle(0xff3030, 0.4 + 0.5 * pulse).fillRect(rx0 + 8 * s, ry0 + 8 * s, 5 * s, 5 * s).fillRect(rx1 - 13 * s, ry0 + 8 * s, 5 * s, 5 * s);
        this.towerSign.setPosition((rx0 + rx1) / 2, (ry0 + ry1) / 2).setScale(s * 0.8);
      }
    }
    // Billboards on stilts sit highest of all.
    for (const { def, image, posts } of this.boards) {
      const s = leanScale(eye, def.height), base = leanScale(eye, def.height - 30);
      const x0 = cx + (def.x - cx) * s, y0 = cy + (def.y - cy) * s;
      const visible = x0 < right && x0 + def.w * s > left && y0 < bottom && y0 + def.h * s > top;
      image.setVisible(visible); posts.setVisible(visible);
      if (!visible) continue;
      posts.clear();
      for (const fx of [0.2, 0.8]) {
        const px = def.x + def.w * fx, py = def.y + def.h;
        posts.lineStyle(3, 0x303034, 1).lineBetween(cx + (px - cx) * base, cy + (py - cy) * base, cx + (px - cx) * s, cy + (py - 4 - cy) * s);
      }
      image.setPosition(x0, y0).setScale((def.w * s) / image.width, (def.h * s) / image.height);
    }
  }

  private detail(d: Phaser.GameObjects.Graphics, det: Building["details"][number], rx0: number, ry0: number, s: number, b: Building, eye: number, cx: number, cy: number, st: Style, time: number) {
    const dx = rx0 + det.x * s, dy = ry0 + det.y * s, dw = det.w * s, dh = det.h * s;
    if (det.kind === "pad") {
      // Helipad: a dark disc, a yellow ring and a big H.
      const r = dw / 2, mx = dx + r, my = dy + r;
      d.fillStyle(0x2a2a30, 1).fillCircle(mx, my, r);
      d.lineStyle(3 * s, 0xf5c518, 1).strokeCircle(mx, my, r * 0.86);
      d.fillStyle(0xf0f0f0, 1).fillRect(mx - r * 0.35, my - r * 0.4, r * 0.16, r * 0.8).fillRect(mx + r * 0.19, my - r * 0.4, r * 0.16, r * 0.8).fillRect(mx - r * 0.35, my - r * 0.08, r * 0.7, r * 0.16);
      return;
    }
    if (det.kind === "sky") {
      // A skylight: framed glass panes with a glint.
      d.fillStyle(0x2a3a4a, 1).fillRect(dx, dy, dw, dh);
      d.fillStyle(0x7ab0d0, 1).fillRect(dx + s, dy + s, dw - 2 * s, dh - 2 * s);
      d.fillStyle(0x2a3a4a, 1);
      for (let i = 1; i < 4; i++) d.fillRect(dx + (dw * i) / 4, dy, s, dh);
      d.fillStyle(0xd8f0ff, 1).fillRect(dx + 3 * s, dy + 2 * s, 4 * s, s);
      return;
    }
    // Boxes stand proud of the roof: they lean a touch more and show a side.
    const lift = det.kind === "tank" ? 18 : 8;
    const hs = leanScale(eye, b.height + lift) / leanScale(eye, b.height);
    const ox = (dx + dw / 2 - cx) * (hs - 1), oy = (dy + dh / 2 - cy) * (hs - 1);
    d.fillStyle(0x000000, 0.3).fillRect(dx + 2 * s, dy + 2 * s, dw, dh);
    d.fillStyle(shadeInt(st.detail, 0.6), 1).fillRect(Math.min(dx, dx + ox), Math.min(dy, dy + oy), dw + Math.abs(ox), dh + Math.abs(oy));
    if (det.kind === "tank") {
      // Water tank: a round lid with a band.
      const r = Math.min(dw, dh) / 2, mx = dx + ox + dw / 2, my = dy + oy + dh / 2;
      d.fillStyle(0x6a5a44, 1).fillCircle(mx, my, r);
      d.fillStyle(0x8a7658, 1).fillCircle(mx, my, r * 0.8);
      d.fillStyle(0x5a4a36, 1).fillRect(mx - r * 0.8, my - s / 2, r * 1.6, s);
      return;
    }
    d.fillStyle(st.detail, 1).fillRect(dx + ox, dy + oy, dw, dh);
    d.fillStyle(shadeInt(st.detail, 1.3), 1).fillRect(dx + ox, dy + oy, dw, s);
    d.fillStyle(shadeInt(st.detail, 0.7), 1).fillRect(dx + ox, dy + oy + dh - s, dw, s);
    if (det.kind === "vent") {
      // A fan with a slowly turning blade.
      const r = Math.min(dw, dh) * 0.32, mx = dx + ox + dw / 2, my = dy + oy + dh / 2;
      d.fillStyle(0x1a1a1a, 1).fillCircle(mx, my, r);
      const a = time / 400;
      d.lineStyle(Math.max(1, s), 0x5a5a5a, 1).lineBetween(mx - Math.cos(a) * r, my - Math.sin(a) * r, mx + Math.cos(a) * r, my + Math.sin(a) * r);
    } else {
      // An AC unit: grille slats.
      d.fillStyle(shadeInt(st.detail, 0.75), 1);
      for (let i = 2; i < det.w - 2; i += 3) d.fillRect(dx + ox + i * s, dy + oy + 2 * s, s, dh - 4 * s);
    }
  }

  private wall(g: Phaser.GameObjects.Graphics, block: Block, face: number, ax: number, ay: number, bx: number, by: number, eye: number, cx: number, cy: number, st: Style, sh: Shaded, detailed: boolean) {
    const b = block.def;
    const s = leanScale(eye, b.height);
    const tax = cx + (ax - cx) * s, tay = cy + (ay - cy) * s, tbx = cx + (bx - cx) * s, tby = cy + (by - cy) * s;
    g.fillStyle(sh.walls[face], 1);
    g.fillTriangle(ax, ay, bx, by, tbx, tby);
    g.fillTriangle(ax, ay, tbx, tby, tax, tay);
    const floors = Math.max(1, Math.round(b.height / FLOOR));
    const len = Math.hypot(bx - ax, by - ay);
    const seed = block.seed + face * 131;
    // A ledge under every floor.
    g.fillStyle(sh.ledges[face], 1);
    for (let f = 1; f < floors; f++) this.quad(g, ax, ay, bx, by, leanScale(eye, f * FLOOR), leanScale(eye, f * FLOOR + 2), 0, 1, cx, cy);
    if (!detailed || st.ribbon) {
      // Glass ribbons: one band per floor, with mullions when close.
      for (let f = 0; f < floors; f++) {
        g.fillStyle(sh.frames[face], 1);
        this.quad(g, ax, ay, bx, by, leanScale(eye, f * FLOOR + 5), leanScale(eye, f * FLOOR + 17), 0.03, 0.97, cx, cy);
        g.fillStyle(((seed + f) % 5 === 0) ? sh.lit[face] : sh.dark[face], 1);
        this.quad(g, ax, ay, bx, by, leanScale(eye, f * FLOOR + 6), leanScale(eye, f * FLOOR + 16), 0.035, 0.965, cx, cy);
      }
      if (detailed) {
        const cols = Math.max(2, Math.floor(len / 16));
        g.fillStyle(sh.frames[face], 1);
        for (let i = 1; i < cols; i++) this.quad(g, ax, ay, bx, by, leanScale(eye, 0), s, i / cols - 0.008, i / cols + 0.008, cx, cy);
      }
      return;
    }
    // Punched windows: a dark frame around each pane.
    const cols = Math.max(1, Math.floor(len / 15));
    for (let f = 0; f < floors; f++) {
      const sf0 = leanScale(eye, f * FLOOR + 5), sf1 = leanScale(eye, f * FLOOR + 17);
      const sp0 = leanScale(eye, f * FLOOR + 6), sp1 = leanScale(eye, f * FLOOR + 16);
      for (let i = 0; i < cols; i++) {
        const u0 = (i + 0.2) / cols, u1 = (i + 0.8) / cols, du = 0.04 / cols;
        g.fillStyle(sh.frames[face], 1);
        this.quad(g, ax, ay, bx, by, sf0, sf1, u0 - du, u1 + du, cx, cy);
        const lit = ((seed + f * 17 + i * 31) * 2654435761 >>> 0) % 7 === 0;
        g.fillStyle(lit ? sh.lit[face] : sh.dark[face], 1);
        this.quad(g, ax, ay, bx, by, sp0, sp1, u0, u1, cx, cy);
      }
    }
  }

  /** A quad on a wall: u along the base edge, heights given as projection scales. */
  private quad(g: Phaser.GameObjects.Graphics, ax: number, ay: number, bx: number, by: number, s0: number, s1: number, u0: number, u1: number, cx: number, cy: number) {
    const px0 = ax + (bx - ax) * u0, py0 = ay + (by - ay) * u0, px1 = ax + (bx - ax) * u1, py1 = ay + (by - ay) * u1;
    const x00 = cx + (px0 - cx) * s0, y00 = cy + (py0 - cy) * s0, x10 = cx + (px1 - cx) * s0, y10 = cy + (py1 - cy) * s0;
    const x01 = cx + (px0 - cx) * s1, y01 = cy + (py0 - cy) * s1, x11 = cx + (px1 - cx) * s1, y11 = cy + (py1 - cy) * s1;
    g.fillTriangle(x00, y00, x10, y10, x11, y11);
    g.fillTriangle(x00, y00, x11, y11, x01, y01);
  }
}

/** A billboard: dark panel, a coloured frame lined with bulbs, the slogan in the pixel font. */
function makeBillboard(scene: Phaser.Scene, key: string, def: Billboard) {
  const w = Math.round(def.w), h = Math.round(def.h);
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  const hex = `#${def.color.toString(16).padStart(6, "0")}`;
  ctx.fillStyle = "#0c0c10"; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = hex; ctx.fillRect(2, 2, w - 4, h - 4);
  ctx.fillStyle = "#101016"; ctx.fillRect(4, 4, w - 8, h - 8);
  ctx.fillStyle = "#fff6c8";
  for (let x = 6; x < w - 4; x += 6) { ctx.fillRect(x, 2, 2, 2); ctx.fillRect(x, h - 4, 2, 2); }
  const fill = ["#ffffff", hex, hex];
  let text = renderPixelText(def.text, { size: 30, fill, outline: "#000000" });
  if (text.width > w - 12) {
    const words = def.text.split(" ");
    let best = 1, bestDiff = Infinity;
    for (let i = 1; i < words.length; i++) {
      const diff = Math.abs(words.slice(0, i).join(" ").length - words.slice(i).join(" ").length);
      if (diff < bestDiff) { bestDiff = diff; best = i; }
    }
    const two = `${words.slice(0, best).join(" ")}\n${words.slice(best).join(" ")}`;
    for (let size = 22; size >= 10; size -= 2) { text = renderPixelText(two, { size, fill, outline: "#000000" }); if (text.width <= w - 12 && text.height <= h - 6) break; }
  }
  ctx.drawImage(text, Math.round((w - text.width) / 2), Math.round((h - text.height) / 2));
  scene.textures.addCanvas(key, c);
}
