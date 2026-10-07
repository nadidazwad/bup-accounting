// Procedural pixel art for Level 2: original, GTA 2-era style tiles, 60s/70s
// cars, office-worker peds with walk and run cycles, effects and HUD icons.
// Drawn at runtime, one texel per world pixel, with whole-pixel rects and
// pixel-tested discs only (no anti-aliasing), and sampled nearest-neighbour.
// No GTA art is used.
import type Phaser from "phaser";
import { CELL, rng, Tile, TILE_COUNT } from "./layout";
import { models, type ModelName } from "./car";

export const TEX = 1;
const T = CELL;
const PAD = 2;
export const TILESET = { key: "city-tiles", size: T, margin: PAD, spacing: PAD * 2, cols: 8 };

type Ctx = CanvasRenderingContext2D;
const canvas = (w: number, h: number) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; };
const ctx2d = (c: HTMLCanvasElement) => { const x = c.getContext("2d", { willReadFrequently: true })!; x.imageSmoothingEnabled = false; return x; };
const rect = (c: Ctx, x: number, y: number, w: number, h: number, color: string) => { c.fillStyle = color; c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
const dot = (c: Ctx, x: number, y: number, color: string) => rect(c, x, y, 1, 1, color);
/** A pixel-tested filled ellipse. */
function blob(c: Ctx, cx: number, cy: number, rx: number, ry: number, color: string) {
  c.fillStyle = color;
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
    const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
    if (dx * dx + dy * dy <= 1) c.fillRect(x, y, 1, 1);
  }
}
// 4×4 Bayer matrix for ordered dithering.
const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
/** Ordered-dither a second colour over a rect at a 0–1 density. */
function dither(c: Ctx, x0: number, y0: number, w: number, h: number, color: string, density: number) {
  c.fillStyle = color;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (bayer[((y0 + y) & 3) * 4 + ((x0 + x) & 3)] < density * 16) c.fillRect(x0 + x, y0 + y, 1, 1);
}
function speckle(c: Ctx, x0: number, y0: number, w: number, h: number, colors: string[], amount: number, seed: number) {
  const r = rng(seed);
  for (let i = 0; i < amount; i++) dot(c, x0 + Math.floor(r() * w), y0 + Math.floor(r() * h), colors[Math.floor(r() * colors.length)]);
}
/** Snaps alpha to three levels so stray anti-aliasing never softens an edge. */
function crisp(c: Ctx, w: number, h: number) {
  const img = c.getImageData(0, 0, w, h), d = img.data;
  for (let i = 3; i < d.length; i += 4) d[i] = d[i] < 40 ? 0 : d[i] < 200 ? 110 : 255;
  c.putImageData(img, 0, 0);
}

function addCanvas(scene: Phaser.Scene, key: string, c: HTMLCanvasElement) {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  return scene.textures.addCanvas(key, c)!;
}

/** Builds every Level 2 texture once per game. */
export function ensureCityTextures(scene: Phaser.Scene) {
  if (scene.textures.exists(TILESET.key)) return;
  buildTiles(scene);
  buildCars(scene);
  buildPeds(scene);
  buildFx(scene);
  buildRoofs(scene);
}

// ——— Ground ———
const ASPHALT = ["#45454d", "#3d3d45", "#4f4f57", "#36363d"];
function asphalt(c: Ctx, seed: number, base = ASPHALT[0]) {
  rect(c, 0, 0, T, T, base);
  dither(c, 0, 0, T, T, ASPHALT[1], 0.22);
  speckle(c, 0, 0, T, T, [ASPHALT[2], ASPHALT[3], "#5a5a62"], 70, seed);
  const r = rng(seed * 3 + 1);
  if (r() < 0.35) { // a tar seam
    let x = Math.floor(r() * T), y = 0;
    while (y < T) { dot(c, x, y, "#2c2c33"); y++; if (r() < 0.3) x += r() < 0.5 ? -1 : 1; }
  }
  if (r() < 0.2) blob(c, 6 + r() * 20, 6 + r() * 20, 4 + r() * 3, 3 + r() * 2, "#37373f"); // an oil stain
}
function paint(c: Ctx, x: number, y: number, w: number, h: number, seed: number, color = "#d6d2c2") {
  rect(c, x, y, w, h, color);
  const r = rng(seed);
  for (let i = 0; i < (w * h) / 6; i++) dot(c, x + Math.floor(r() * w), y + Math.floor(r() * h), "#9c998e"); // worn paint
}

function drawTile(c: Ctx, id: number) {
  switch (id) {
    case Tile.asphalt: asphalt(c, 11); break;
    case Tile.asphalt2: asphalt(c, 23); break;
    case Tile.roadVL: asphalt(c, 31); paint(c, T - 2, 4, 2, 16, 1); break;
    case Tile.roadVR: asphalt(c, 37); paint(c, 0, 4, 2, 16, 2); break;
    case Tile.roadHT: asphalt(c, 41); paint(c, 4, T - 2, 16, 2, 3); break;
    case Tile.roadHB: asphalt(c, 43); paint(c, 4, 0, 16, 2, 4); break;
    case Tile.zebraV: asphalt(c, 47); for (let x = 2; x < T; x += 8) paint(c, x, 1, 4, T - 2, x); break;
    case Tile.zebraH: asphalt(c, 53); for (let y = 2; y < T; y += 8) paint(c, 1, y, T - 2, 4, y); break;
    case Tile.manhole: {
      asphalt(c, 59);
      blob(c, 16, 16, 8, 8, "#2a2a30"); blob(c, 16, 16, 7, 7, "#55555d"); blob(c, 16, 16, 6, 6, "#46464e");
      for (let i = -4; i <= 4; i += 2) rect(c, 16 + i, 11, 1, 10, "#33333a");
      dot(c, 13, 12, "#7a7a82"); dot(c, 14, 11, "#7a7a82");
      break;
    }
    case Tile.grass: case Tile.grass2: case Tile.flowers: {
      rect(c, 0, 0, T, T, id === Tile.grass ? "#3f7d32" : "#45853a");
      dither(c, 0, 0, T, T, "#356c2a", 0.25);
      const r = rng(id * 5);
      for (let i = 0; i < 40; i++) { const x = Math.floor(r() * T), y = Math.floor(r() * T); dot(c, x, y, "#5fa04a"); dot(c, x, y + 1, "#2c5e23"); }
      if (id === Tile.flowers) for (let i = 0; i < 8; i++) { const x = 2 + Math.floor(r() * 28), y = 2 + Math.floor(r() * 28), col = ["#f0e050", "#f07080", "#f8f8f8", "#a070e0"][i % 4]; dot(c, x, y, col); dot(c, x + 1, y, col); dot(c, x, y + 1, col); dot(c, x + 1, y + 1, "#2c5e23"); }
      break;
    }
    case Tile.path: rect(c, 0, 0, T, T, "#a8977a"); dither(c, 0, 0, T, T, "#968466", 0.3); speckle(c, 0, 0, T, T, ["#c4b494", "#7c6c52"], 80, 77); break;
    case Tile.lot: asphalt(c, 81, "#4b4b53"); break;
    case Tile.lotLineV: asphalt(c, 83, "#4b4b53"); paint(c, 0, 0, 2, T, 5); break;
    case Tile.lotLineH: asphalt(c, 85, "#4b4b53"); paint(c, 0, 0, T, 2, 6); break;
    case Tile.base: rect(c, 0, 0, T, T, "#24242a"); break;
    case Tile.plaza: {
      rect(c, 0, 0, T, T, "#9d9588");
      for (const [x, y] of [[0, 0], [16, 16]]) { rect(c, x, y, 16, 16, "#aaa295"); rect(c, x, y, 16, 1, "#bdb5a8"); rect(c, x, y, 1, 16, "#bdb5a8"); }
      rect(c, 0, 15, T, 1, "#7c7568"); rect(c, 15, 0, 1, T, "#7c7568"); rect(c, 0, 31, T, 1, "#7c7568"); rect(c, 31, 0, 1, T, "#7c7568");
      speckle(c, 0, 0, T, T, ["#8a8276", "#b2aa9d"], 30, 91);
      break;
    }
    case Tile.water: {
      rect(c, 0, 0, T, T, "#2b5f8e"); dither(c, 0, 0, T, T, "#24507a", 0.3);
      for (const [x, y] of [[4, 7], [18, 13], [8, 22], [22, 27]]) { rect(c, x, y, 5, 1, "#7fb2dc"); rect(c, x + 5, y - 1, 2, 1, "#7fb2dc"); }
      break;
    }
    default: {
      if (id < Tile.pavement || id >= Tile.pavement + 16) break;
      const mask = id - Tile.pavement;
      // Concrete slabs: a light top-left bevel and dark joints, a few cracks.
      rect(c, 0, 0, T, T, "#8f887c");
      for (const sx of [0, 16]) for (const sy of [0, 16]) {
        rect(c, sx, sy, 16, 1, "#a39c90"); rect(c, sx, sy, 1, 16, "#a39c90");
        rect(c, sx + 15, sy, 1, 16, "#6f695e"); rect(c, sx, sy + 15, 16, 1, "#6f695e");
      }
      speckle(c, 0, 0, T, T, ["#7d766a", "#9c9589", "#857e72"], 60, 101 + mask);
      const r = rng(200 + mask);
      if (r() < 0.5) { let x = 3 + Math.floor(r() * 10), y = 3; for (let i = 0; i < 9; i++) { dot(c, x, y, "#6a6459"); y++; x += r() < 0.5 ? 0 : 1; } }
      // Kerbs: pale stone with a highlight, then a dark gutter line.
      if (mask & 1) { rect(c, 0, 0, T, 4, "#bab2a2"); rect(c, 0, 3, T, 1, "#8c8577"); rect(c, 0, 0, T, 1, "#26262c"); }
      if (mask & 2) { rect(c, T - 4, 0, 4, T, "#bab2a2"); rect(c, T - 4, 0, 1, T, "#d2cbbb"); rect(c, T - 1, 0, 1, T, "#26262c"); }
      if (mask & 4) { rect(c, 0, T - 4, T, 4, "#bab2a2"); rect(c, 0, T - 4, T, 1, "#d2cbbb"); rect(c, 0, T - 1, T, 1, "#26262c"); }
      if (mask & 8) { rect(c, 0, 0, 4, T, "#bab2a2"); rect(c, 3, 0, 1, T, "#8c8577"); rect(c, 0, 0, 1, T, "#26262c"); }
    }
  }
}

function buildTiles(scene: Phaser.Scene) {
  const { cols, margin, spacing } = TILESET;
  const rows = Math.ceil(TILE_COUNT / cols);
  const sheet = canvas(margin * 2 + cols * T + (cols - 1) * spacing, margin * 2 + rows * T + (rows - 1) * spacing);
  const out = ctx2d(sheet);
  const one = canvas(T, T), c = ctx2d(one);
  for (let id = 0; id < TILE_COUNT; id++) {
    c.clearRect(0, 0, T, T);
    drawTile(c, id);
    const x = margin + (id % cols) * (T + spacing), y = margin + Math.floor(id / cols) * (T + spacing);
    out.drawImage(one, x, y);
    // Extrude the edges so sampling at fractional zoom never bleeds a neighbour.
    out.drawImage(one, 0, 0, T, 1, x, y - PAD, T, PAD);
    out.drawImage(one, 0, T - 1, T, 1, x, y + T, T, PAD);
    out.drawImage(one, 0, 0, 1, T, x - PAD, y, PAD, T);
    out.drawImage(one, T - 1, 0, 1, T, x + T, y, PAD, T);
  }
  addCanvas(scene, TILESET.key, sheet);
}

// ——— Roof textures (tiled under the pseudo-3D roofs) ———
export const roofKeys = ["roof-tar", "roof-slab", "roof-metal", "roof-gravel", "roof-tar", "roof-slab", "roof-glass"];
function buildRoofs(scene: Phaser.Scene) {
  const make = (key: string, fn: (c: Ctx) => void) => { const cv = canvas(32, 32), c = ctx2d(cv); fn(c); addCanvas(scene, key, cv); };
  make("roof-tar", (c) => { rect(c, 0, 0, 32, 32, "#5c5c60"); dither(c, 0, 0, 32, 32, "#525256", 0.35); speckle(c, 0, 0, 32, 32, ["#6c6c70", "#48484c", "#77777a"], 90, 3); });
  make("roof-slab", (c) => { rect(c, 0, 0, 32, 32, "#7b766e"); for (const o of [0, 16]) { rect(c, 0, o, 32, 1, "#66625b"); rect(c, o, 0, 1, 32, "#66625b"); rect(c, 1, o + 1, 30, 1, "#8b867e"); } speckle(c, 0, 0, 32, 32, ["#716c64", "#86817a"], 40, 5); });
  make("roof-metal", (c) => { rect(c, 0, 0, 32, 32, "#6d7680"); for (let x = 0; x < 32; x += 4) { rect(c, x, 0, 1, 32, "#8a939c"); rect(c, x + 2, 0, 1, 32, "#58606a"); } });
  make("roof-gravel", (c) => { rect(c, 0, 0, 32, 32, "#8a8072"); dither(c, 0, 0, 32, 32, "#7a7062", 0.4); speckle(c, 0, 0, 32, 32, ["#a39a8c", "#665e52", "#b0a898"], 140, 9); });
  make("roof-glass", (c) => { rect(c, 0, 0, 32, 32, "#1d2436"); for (const o of [0, 16]) { rect(c, 0, o, 32, 1, "#2e3854"); rect(c, o, 0, 1, 32, "#2e3854"); } dot(c, 4, 4, "#4a5a80"); dot(c, 5, 4, "#4a5a80"); dot(c, 20, 20, "#4a5a80"); });
}

// ——— Cars: 60s/70s American-style, top-down, front to the right ———
export type CarVariant = { name: string; model: ModelName; body: string; trim: string; roof?: string; stripe?: string };
export const carVariants: CarVariant[] = [
  { name: "sedan-avocado", model: "sedan", body: "#6f7d2c", trim: "#4b5420", roof: "#e8e0c0" },
  { name: "sedan-gold", model: "sedan", body: "#c99a28", trim: "#8a6814", roof: "#5a3a1e" },
  { name: "sedan-maroon", model: "sedan", body: "#6e1f2a", trim: "#4a121a", roof: "#e6dcc0" },
  { name: "sedan-babyblue", model: "sedan", body: "#86aed6", trim: "#5a7ea6" },
  { name: "sedan-cream", model: "sedan", body: "#e2d6aa", trim: "#a89c74", roof: "#7a2a24" },
  { name: "sedan-black", model: "sedan", body: "#2a2a30", trim: "#18181c" },
  { name: "sport-orange", model: "sport", body: "#c4561c", trim: "#7a3410", stripe: "#f0ead8" },
  { name: "sport-lime", model: "sport", body: "#8cbf26", trim: "#5a7c14", stripe: "#1c1c1c" },
  { name: "sport-purple", model: "sport", body: "#5a2a7a", trim: "#381650", stripe: "#e8c040" },
  { name: "wagon-wood", model: "wagon", body: "#c8bfa0", trim: "#8f8668" },
  { name: "wagon-green", model: "wagon", body: "#3e6a4c", trim: "#284634" },
  { name: "bug-mint", model: "bug", body: "#8fcaa6", trim: "#5e9676" },
  { name: "bug-red", model: "bug", body: "#b62e2a", trim: "#7a1a18" },
  { name: "pickup-rust", model: "pickup", body: "#9a4a26", trim: "#6a2e14" },
  { name: "pickup-teal", model: "pickup", body: "#2f7a7a", trim: "#1e5252" },
  { name: "van-brown", model: "van", body: "#7a5634", trim: "#e6dcc0", stripe: "#e6dcc0" },
  { name: "taxi", model: "taxi", body: "#e2b622", trim: "#9a7a10" },
  { name: "police", model: "police", body: "#f0f0ec", trim: "#1c1c22" },
];
export const civilianVariants = carVariants.filter((v) => v.model !== "police");

const CAR_CELL = { w: 72, h: 36 };
const CHROME = ["#f0f0f4", "#b8bcc6", "#80848e"];
const shadeHex = (hex: string, k: number) => {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)));
  return `#${((f(n >> 16) << 16) | (f((n >> 8) & 255) << 8) | f(n & 255)).toString(16).padStart(6, "0")}`;
};

function drawCar(c: Ctx, v: CarVariant, opts: { dented?: boolean; wreck?: boolean; lights?: number }) {
  const m = models[v.model];
  const L = m.length, W = m.width;
  const x = Math.round((CAR_CELL.w - L) / 2), y = Math.round((CAR_CELL.h - W) / 2);
  const wreck = !!opts.wreck;
  const body = wreck ? "#2c2724" : v.body;
  const light = wreck ? "#3a332e" : shadeHex(body, 1.22), dark = wreck ? "#1c1814" : shadeHex(body, 0.72), edge = wreck ? "#0e0c0a" : shadeHex(body, 0.45);
  const glass = wreck ? "#141414" : "#22314a", glassHi = wreck ? "#202020" : "#6a86b0";
  // Hard shadow, offset down-right.
  c.fillStyle = "rgba(0,0,0,0.45)"; c.fillRect(x + 2, y + 2, L, W);
  // Tyres at the four corners, poking out by a pixel.
  const bug = v.model === "bug";
  const tyre = (tx: number) => { rect(c, tx, y - 1, 8, 3, "#141414"); rect(c, tx, y + W - 2, 8, 3, "#141414"); };
  tyre(x + (bug ? 6 : 8)); tyre(x + L - (bug ? 14 : 17));
  // Body slab with clipped corners, a dark outline, a lit top flank and a shaded bottom flank.
  rect(c, x, y + 1, L, W - 2, edge); rect(c, x + 1, y, L - 2, W, edge);
  const r = bug ? 4 : 2;
  rect(c, x + 1, y + r - 1, L - 2, W - 2 * r + 2, body); rect(c, x + r - 1, y + 1, L - 2 * r + 2, W - 2, body);
  rect(c, x + 2, y + 1, L - 4, 2, light); rect(c, x + 2, y + W - 3, L - 4, 2, dark);
  if (bug) for (const fx of [x + 4, x + L - 12]) { rect(c, fx, y, 8, 2, body); rect(c, fx, y + W - 2, 8, 2, dark); } // round fenders
  if (!wreck) {
    // Chrome bumpers front and back.
    rect(c, x + L - 2, y + 2, 2, W - 4, CHROME[1]); rect(c, x + L - 2, y + 2, 1, W - 4, CHROME[0]); rect(c, x + L - 1, y + W - 4, 1, 2, CHROME[2]);
    rect(c, x, y + 2, 2, W - 4, CHROME[1]); rect(c, x + 1, y + 2, 1, W - 4, CHROME[0]);
    // Round headlights and tail lights.
    for (const ly of [y + 3, y + W - 6]) { rect(c, x + L - 4, ly, 2, 3, "#fff6c8"); dot(c, x + L - 4, ly, "#ffffff"); rect(c, x + 2, ly, 2, 3, "#c01818"); dot(c, x + 2, ly, "#ff5a4a"); }
  }
  // Cabin: windscreen, roof (vinyl or body), rear window, each with a glint.
  const cab = { wagon: [0.18, 0.62], bug: [0.22, 0.66], pickup: [0.42, 0.66], van: [0.06, 0.86], sport: [0.32, 0.58], sedan: [0.3, 0.64], taxi: [0.3, 0.64], police: [0.3, 0.64] }[v.model];
  const c0 = x + Math.round(L * cab[0]), c1 = x + Math.round(L * cab[1]);
  if (v.model === "van") {
    rect(c, c1 - 1, y + 3, 5, W - 6, glass); rect(c, c1, y + 4, 1, W - 10, glassHi);
    rect(c, x + 3, y + 3, c1 - x - 5, W - 6, wreck ? body : shadeHex(body, 1.08));
    if (v.stripe && !wreck) { rect(c, x + 3, y + 3, c1 - x - 10, 2, v.stripe); rect(c, x + 3, y + W - 5, c1 - x - 10, 2, v.stripe); rect(c, c1 - 8, y + 3, 3, W - 6, v.stripe); }
    rect(c, x + 8, y + 7, 10, 2, "#555555"); rect(c, x + 22, y + 7, 10, 2, "#555555"); // roof vents
  } else {
    rect(c, c1, y + 3, 5, W - 6, glass); rect(c, c1 + 1, y + 4, 1, 3, glassHi); rect(c, c1 + 2, y + 6, 1, 2, glassHi);
    rect(c, c0, y + 3, 3, W - 6, glass); dot(c, c0 + 1, y + 4, glassHi);
    const roof = wreck ? "#1e1a17" : v.roof ?? shadeHex(body, 1.06);
    rect(c, c0 + 3, y + 3, c1 - c0 - 3, W - 6, roof);
    if (v.roof && !wreck) dither(c, c0 + 3, y + 3, c1 - c0 - 3, W - 6, shadeHex(v.roof, 0.85), 0.25); // vinyl grain
    rect(c, c0 + 3, y + 3, c1 - c0 - 3, 1, wreck ? roof : shadeHex(roof, 1.25));
    // Side windows peek out along the flanks.
    rect(c, c0 + 1, y + 2, c1 - c0 + 2, 1, glass); rect(c, c0 + 1, y + W - 3, c1 - c0 + 2, 1, glass);
  }
  if (v.model === "pickup" && !wreck) { rect(c, x + 3, y + 4, c0 - x - 4, W - 8, shadeHex(body, 0.55)); rect(c, x + 3, y + 4, c0 - x - 4, 1, edge); for (let i = x + 6; i < c0 - 2; i += 5) rect(c, i, y + 5, 1, W - 10, shadeHex(body, 0.45)); }
  if (v.model === "wagon" && !wreck) {
    // Wood panelling on the flanks, a roof rack.
    for (const wy of [y + 1, y + W - 3]) { rect(c, x + 6, wy, L - 14, 2, "#8a5a2c"); for (let i = x + 8; i < x + L - 10; i += 6) dot(c, i, wy, "#b07a40"); }
    for (let i = c0 + 6; i < c1 - 2; i += 6) rect(c, i, y + 4, 1, W - 8, "#3a3a3a");
  }
  if (v.stripe && v.model === "sport" && !wreck) { rect(c, x + 3, y + W / 2 - 4, L - 6, 2, v.stripe); rect(c, x + 3, y + W / 2 + 2, L - 6, 2, v.stripe); rect(c, x + L - 16, y + W / 2 - 2, 6, 4, edge); }
  if (v.model === "taxi" && !wreck) {
    for (let i = 0; i < 10; i++) { dot(c, x + 10 + i * 2, y + 1, i % 2 ? "#111111" : "#f4f4f4"); dot(c, x + 10 + i * 2, y + W - 2, i % 2 ? "#f4f4f4" : "#111111"); }
    rect(c, c0 + 7, y + W / 2 - 3, 5, 6, "#f8f0c0"); rect(c, c0 + 7, y + W / 2 - 3, 5, 1, "#c03030");
  }
  if (v.model === "police" && !wreck) {
    // Black-and-white: dark bonnet and boot, one red bubble light.
    rect(c, x + 3, y + 2, c0 - x - 3, W - 4, "#1c1c22"); rect(c, c1 + 5, y + 2, x + L - c1 - 8, W - 4, "#1c1c22");
    rect(c, x + 3, y + 2, c0 - x - 3, 1, "#3a3a44"); rect(c, c1 + 5, y + 2, x + L - c1 - 8, 1, "#3a3a44");
    const on = opts.lights ?? 0;
    blob(c, c0 + (c1 - c0) / 2 + 1, y + W / 2, 3, 3, on ? "#ff3a2a" : "#7a1410");
    dot(c, c0 + (c1 - c0) / 2, y + W / 2 - 2, on ? "#ffd0c0" : "#a02a20");
  }
  if (opts.dented || wreck) {
    const rr = rng(L * 3 + W + (wreck ? 7 : 0));
    for (let i = 0; i < 9; i++) { const sx = x + 3 + Math.floor(rr() * (L - 6)), sy = y + 2 + Math.floor(rr() * (W - 4)); dot(c, sx, sy, edge); dot(c, sx + 1, sy + (rr() < 0.5 ? 1 : 0), dark); }
    if (!wreck) { // crazed windscreen, a dead headlight, a crumpled corner
      for (let i = 0; i < 4; i++) dot(c, c1 + 1 + Math.floor(rr() * 3), y + 4 + Math.floor(rr() * (W - 8)), "#c8d4e4");
      rect(c, x + L - 4, y + 3, 2, 3, "#3a3a3a");
      rect(c, x + L - 4, y, 4, 3, edge);
    }
  }
  if (wreck) { const rr = rng(9); for (let i = 0; i < 30; i++) dot(c, x + Math.floor(rr() * L), y + Math.floor(rr() * W), rr() < 0.5 ? "#6a3a1e" : "#0a0806"); }
}

function buildCars(scene: Phaser.Scene) {
  const frames: { name: string; draw: (c: Ctx) => void }[] = [];
  for (const v of carVariants) {
    if (v.model === "police") {
      for (const lights of [0, 1]) {
        frames.push({ name: `police-${lights}`, draw: (c) => drawCar(c, v, { lights }) });
        frames.push({ name: `police-${lights}-d`, draw: (c) => drawCar(c, v, { lights, dented: true }) });
      }
    } else {
      frames.push({ name: v.name, draw: (c) => drawCar(c, v, {}) });
      frames.push({ name: `${v.name}-d`, draw: (c) => drawCar(c, v, { dented: true }) });
    }
  }
  for (const model of Object.keys(models) as ModelName[]) {
    const v = carVariants.find((c) => c.model === model)!;
    frames.push({ name: `wreck-${model}`, draw: (c) => drawCar(c, v, { wreck: true }) });
  }
  const cols = 8, cw = CAR_CELL.w, ch = CAR_CELL.h;
  const sheet = canvas(cols * cw, Math.ceil(frames.length / cols) * ch);
  const ctx = ctx2d(sheet);
  const one = canvas(cw, ch), oc = ctx2d(one);
  frames.forEach((f, i) => {
    oc.clearRect(0, 0, cw, ch);
    f.draw(oc);
    crisp(oc, cw, ch);
    ctx.drawImage(one, (i % cols) * cw, Math.floor(i / cols) * ch);
  });
  const tex = addCanvas(scene, "city-cars", sheet);
  frames.forEach((f, i) => tex.add(f.name, 0, (i % cols) * cw, Math.floor(i / cols) * ch, cw, ch));
}
export const carFrame = (variant: string, dented: boolean, lights = 0) =>
  variant === "police" ? `police-${lights}${dented ? "-d" : ""}` : `${variant}${dented ? "-d" : ""}`;

// ——— Pedestrians: top-down, facing +x, 32 px cells ———
export type Look = { suit: string; skin: string; hair: string; tie: string; case: boolean; cap?: string; peak?: string; badge?: string; skirt?: boolean };
export const pedVariants: Look[] = [
  { suit: "#2c2c38", skin: "#e0b088", hair: "#2a1a10", tie: "#c02020", case: true },
  { suit: "#565c6c", skin: "#c08860", hair: "#101010", tie: "#2050c0", case: true },
  { suit: "#7a5434", skin: "#f0c8a0", hair: "#a07030", tie: "#e0c040", case: false },
  { suit: "#283a5a", skin: "#8a5a38", hair: "#101010", tie: "#e0c020", case: true },
  { suit: "#9a9aa0", skin: "#e8b890", hair: "#5a3a20", tie: "#901818", case: false, skirt: true },
  { suit: "#6a2a3a", skin: "#d8a070", hair: "#202020", tie: "#e0e0e0", case: true, skirt: true },
  { suit: "#c8bc9c", skin: "#a87048", hair: "#181008", tie: "#3050a0", case: true },
  { suit: "#3a5a44", skin: "#f0d0b0", hair: "#d8b060", tie: "#a02040", case: false },
];
const COP: Look = { suit: "#1e2c6c", skin: "#d8a878", hair: "#101010", tie: "#101018", case: false, cap: "#141c48", peak: "#0a0a14", badge: "#e8c040" };
// Red's cap and a brown leather jacket.
const PLAYER: Look = { suit: "#6a4a30", skin: "#e8b890", hair: "#3a2010", tie: "#f0f0f0", case: false, cap: "#d02828", peak: "#f0f0f0" };
export const PED_COP = pedVariants.length, PED_PLAYER = pedVariants.length + 1;
export const PED_CELL = 32;
export const WALK_FRAMES = 8, RUN_FRAMES = 6;
export const PED_WALK = 0, PED_RUN = WALK_FRAMES, PED_PANIC = WALK_FRAMES + RUN_FRAMES, PED_FLAT = WALK_FRAMES + RUN_FRAMES * 2;
export const PED_FRAMES = PED_FLAT + 1;

type Pose = { stride: number; arm: number; lean: number; bob: number; panic: boolean };
// Peds are drawn about a third larger than a GTA 2 sprite at this zoom, so they
// read clearly next to the cars.
function drawPed(c: Ctx, k: Look, pose: Pose) {
  const cx = 15 + pose.lean, cy = 16;
  const o = "#141414";
  c.fillStyle = "rgba(0,0,0,0.4)"; // ground shadow
  for (let y = -6; y <= 6; y++) for (let x = -8; x <= 9; x++) if ((x / 9) ** 2 + (y / 7) ** 2 <= 1) c.fillRect(cx + 2 + x, cy + 2 + y, 1, 1);
  const trousers = k.skirt ? "#2a2a30" : shadeHex(k.suit, 0.7);
  // Legs: from the hip to a shoe; one forward, one back.
  for (const [side, s] of [[-1, pose.stride], [1, -pose.stride]] as const) {
    const ly = cy + side * 4 - 1;
    const from = Math.min(0, s), to = Math.max(0, s);
    rect(c, cx + from - 1, ly - 1, to - from + 3, 5, o);
    rect(c, cx + from, ly, to - from + 1, 3, trousers);
    rect(c, cx + s + (s >= 0 ? 1 : -2), ly, 3, 3, "#2a1a10");
  }
  const armL = pose.panic ? 0 : pose.arm, armR = pose.panic ? 0 : -pose.arm;
  // A briefcase swings with the far arm.
  if (k.case && !pose.panic) { rect(c, cx + armR - 4, cy + 11, 9, 5, o); rect(c, cx + armR - 3, cy + 12, 7, 3, "#6a3e18"); rect(c, cx + armR - 1, cy + 11, 3, 1, "#c8a040"); }
  // Arms swing opposite the legs, or go up and wave in a panic.
  const sleeve = (ay: number, swing: number, dir: number) => {
    if (pose.panic) { rect(c, cx + 2, ay + dir, 10, 4, o); rect(c, cx + 3, ay + dir + 1, 7, 2, k.suit); rect(c, cx + 9 + pose.bob, ay + dir, 3, 3, k.skin); return; }
    const a0 = Math.min(0, swing) - 1, a1 = Math.max(0, swing) + 3;
    rect(c, cx + a0 - 1, ay - 1, a1 - a0 + 2, 5, o);
    rect(c, cx + a0, ay, a1 - a0, 3, shadeHex(k.suit, 0.9));
    rect(c, cx + swing + (swing >= 0 ? 2 : -3), ay, 3, 3, k.skin);
  };
  sleeve(cy - 10, armL, -1); sleeve(cy + 8, armR, 1);
  // Shoulders seen from above, lit from the top-left.
  blob(c, cx, cy, 7, 10.5, o);
  blob(c, cx, cy, 6, 9.5, k.suit);
  rect(c, cx - 4, cy - 7, 3, 4, shadeHex(k.suit, 1.3));
  rect(c, cx - 2, cy + 5, 5, 2, shadeHex(k.suit, 0.75));
  // Collar and tie at the front.
  if (!k.cap || k.peak === "#f0f0f0") { rect(c, cx + 4, cy - 3, 2, 6, "#f0f0f0"); rect(c, cx + 5, cy - 1, 2, 3, k.tie); }
  // Head: face at the front, hair or a cap over the back and top.
  const hx = cx + 1 + pose.bob;
  blob(c, hx, cy, 5.2, 5.2, o);
  blob(c, hx, cy, 4.3, 4.3, k.skin);
  if (k.cap) {
    blob(c, hx - 0.6, cy, 4.3, 4.6, k.cap);
    rect(c, hx + 3, cy - 3, 2, 6, k.peak ?? o);
    if (k.badge) rect(c, hx + 1, cy - 1, 2, 2, k.badge);
    rect(c, hx - 3, cy - 3, 2, 1, shadeHex(k.cap, 1.4));
  } else {
    c.fillStyle = k.hair;
    for (let y = -4; y <= 4; y++) for (let x = -4; x <= 1; x++) if (x * x + y * y <= 19) c.fillRect(hx + x, cy + y, 1, 1);
    rect(c, hx - 3, cy - 3, 2, 1, shadeHex(k.hair, 1.6));
  }
}
function drawFlat(c: Ctx, k: Look) {
  // Flattened, spread-eagle and cartoonish: squashed wide, X eyes.
  const cx = 13, cy = 16, o = "#141414";
  c.fillStyle = "rgba(0,0,0,0.35)"; c.fillRect(cx - 11, cy - 13, 28, 27);
  for (const [dx, dy] of [[-11, -12], [-11, 12], [11, -13], [11, 13]]) {
    for (let i = 0; i <= 10; i++) rect(c, cx + (dx * i) / 10 - 2, cy + (dy * i) / 10 - 2, 4, 4, o);
    for (let i = 0; i <= 10; i++) rect(c, cx + (dx * i) / 10 - 1, cy + (dy * i) / 10 - 1, 2, 2, i > 8 ? k.skin : k.suit);
  }
  blob(c, cx - 1, cy, 8, 11, o); blob(c, cx - 1, cy, 7, 10, k.suit);
  blob(c, cx + 10, cy, 6, 6, o); blob(c, cx + 10, cy, 5, 5, k.skin);
  for (const ey of [cy - 2, cy + 3]) { dot(c, cx + 9, ey - 1, o); dot(c, cx + 11, ey - 1, o); dot(c, cx + 10, ey, o); dot(c, cx + 9, ey + 1, o); dot(c, cx + 11, ey + 1, o); }
}

function buildPeds(scene: Phaser.Scene) {
  const looks = [...pedVariants, COP, PLAYER];
  const cw = PED_CELL;
  const sheet = canvas(PED_FRAMES * cw, looks.length * cw);
  const ctx = ctx2d(sheet);
  const one = canvas(cw, cw), oc = ctx2d(one);
  looks.forEach((look, row) => {
    for (let f = 0; f < PED_FRAMES; f++) {
      oc.clearRect(0, 0, cw, cw);
      if (f === PED_FLAT) drawFlat(oc, look);
      else if (f < PED_RUN) {
        const p = Math.sin((f / WALK_FRAMES) * Math.PI * 2);
        drawPed(oc, look, { stride: Math.round(p * 6), arm: Math.round(-p * 4), lean: 0, bob: Math.abs(p) > 0.9 ? 1 : 0, panic: false });
      } else {
        const i = (f - PED_RUN) % RUN_FRAMES;
        const p = Math.sin((i / RUN_FRAMES) * Math.PI * 2);
        drawPed(oc, look, { stride: Math.round(p * 10), arm: Math.round(-p * 6), lean: 1, bob: i % 3 === 0 ? 1 : 0, panic: f >= PED_PANIC });
      }
      crisp(oc, cw, cw);
      ctx.drawImage(one, f * cw, row * cw);
    }
  });
  const tex = addCanvas(scene, "city-peds", sheet);
  looks.forEach((_, row) => { for (let f = 0; f < PED_FRAMES; f++) tex.add(row * PED_FRAMES + f, 0, f * cw, row * cw, cw, cw); });
}

// ——— Effects, decals and HUD icons ———
function draw(scene: Phaser.Scene, key: string, w: number, h: number, fn: (ctx: Ctx) => void, sharp = true) {
  const cv = canvas(w, h), c = ctx2d(cv);
  fn(c);
  if (sharp) crisp(c, w, h);
  addCanvas(scene, key, cv);
}
function radial(scene: Phaser.Scene, key: string, size: number, stops: [number, string][]) {
  draw(scene, key, size, size, (c) => {
    const g = c.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    for (const [at, color] of stops) g.addColorStop(at, color);
    c.fillStyle = g; c.fillRect(0, 0, size, size);
  }, false);
}
/** Pixel art from a character map: each character is a palette key. */
function sprite(scene: Phaser.Scene, key: string, rows: string[], palette: Record<string, string>) {
  draw(scene, key, rows[0].length, rows.length, (c) => rows.forEach((row, y) => [...row].forEach((ch, x) => { if (palette[ch]) dot(c, x, y, palette[ch]); })));
}

function buildFx(scene: Phaser.Scene) {
  radial(scene, "fx-lamp", 96, [[0, "rgba(255,190,110,0.30)"], [0.5, "rgba(255,170,80,0.11)"], [1, "rgba(255,150,60,0)"]]);
  radial(scene, "fx-glow", 64, [[0, "rgba(255,240,200,1)"], [0.3, "rgba(255,200,90,0.7)"], [1, "rgba(255,120,0,0)"]]);
  // A dithered smoke puff and a stepped fireball read as 90s sprites.
  draw(scene, "fx-smoke", 16, 16, (c) => { blob(c, 8, 8, 7, 7, "#55555b"); dither(c, 1, 1, 14, 14, "#6e6e74", 0.35); blob(c, 6, 6, 3, 3, "#808086"); c.globalCompositeOperation = "destination-in"; blob(c, 8, 8, 7, 7, "#000000"); });
  draw(scene, "fx-fire", 12, 12, (c) => { blob(c, 6, 6, 6, 6, "#c8300c"); blob(c, 6, 6, 4.5, 4.5, "#f08018"); blob(c, 6, 6, 3, 3, "#ffd040"); blob(c, 6, 6, 1.5, 1.5, "#fff8d0"); });
  draw(scene, "fx-spark", 2, 2, (c) => rect(c, 0, 0, 2, 2, "#fff6b0"));
  draw(scene, "fx-receipt", 4, 6, (c) => { rect(c, 0, 0, 4, 6, "#f4f2e8"); rect(c, 1, 1, 2, 1, "#8a887e"); rect(c, 1, 3, 2, 1, "#8a887e"); });
  draw(scene, "fx-ring", 48, 48, (c) => { for (let a = 0; a < 360; a += 1.5) { const r = (a * Math.PI) / 180; rect(c, 24 + Math.cos(r) * 21 - 1, 24 + Math.sin(r) * 21 - 1, 3, 3, "#ffffff"); } });
  for (const [key, ink, hi] of [["fx-splat", "#a3171c", "#d84040"], ["fx-splat-ink", "#1f3fa0", "#5a7ad8"]] as const) {
    draw(scene, key, 24, 24, (c) => {
      // A small, goofy cartoon splat.
      const r = rng(key.length * 17);
      blob(c, 12, 12, 6, 5, ink);
      for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2 + r(); const d = 6 + r() * 3; blob(c, 12 + Math.cos(a) * d, 12 + Math.sin(a) * d, 2, 2, ink); }
      for (let i = 0; i < 6; i++) { const a = r() * Math.PI * 2, d = 9 + r() * 2; dot(c, 12 + Math.cos(a) * d, 12 + Math.sin(a) * d, ink); }
      dot(c, 10, 9, hi); dot(c, 11, 9, hi); dot(c, 10, 10, hi);
    });
  }
  draw(scene, "fx-scorch", 48, 48, (c) => { blob(c, 24, 24, 22, 18, "rgba(0,0,0,0.5)"); dither(c, 4, 8, 40, 32, "#000000", 0.4); c.globalCompositeOperation = "destination-in"; blob(c, 24, 24, 22, 18, "#000000"); }, false);
  draw(scene, "city-tree", 48, 48, (c) => {
    const r = rng(5);
    blob(c, 24, 24, 21, 21, "#1d3f19");
    for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2; blob(c, 24 + Math.cos(a) * 11, 24 + Math.sin(a) * 11, 10, 10, i % 2 ? "#2f6a2a" : "#2a5f26"); }
    blob(c, 22, 22, 12, 12, "#3b7d33");
    for (let i = 0; i < 22; i++) { const x = 12 + r() * 22, y = 10 + r() * 24; blob(c, x, y, 2, 2, r() < 0.5 ? "#5a9e48" : "#24501f"); }
    blob(c, 17, 16, 3, 2, "#7ab862");
  });
  // GTA 2's chunky objective arrow, pointing right, black-outlined, two-tone yellow.
  sprite(scene, "city-arrow", [
    "..............##........",
    "..............#Y#.......",
    "..............#YY#......",
    "..............#YYY#.....",
    "###############YYYY#....",
    "#YYYYYYYYYYYYYYYYYYY#...",
    "#YWWWWWWWWWWWWYYYYYYY#..",
    "#YYYYYYYYYYYYYYYYYYYYY#.",
    "#OOOOOOOOOOOOOOOOOOOO#..",
    "###############OOOOO#...",
    "..............#OOOO#....",
    "..............#OOO#.....",
    "..............#OO#......",
    "..............##........",
  ], { "#": "#120e00", Y: "#f8d820", W: "#fff6a0", O: "#d08a10" });
  const head = (lit: boolean) => [
    "....BBBBBB....",
    "..BBBBBBBBBB..",
    ".BBBBBGGBBBBB.",
    ".BBBBBGGBBBBB.",
    "KKKKKKKKKKKKKK",
    ".KSSSSSSSSSSK.",
    ".KS" + (lit ? "EE" : "SS") + "SSSS" + (lit ? "EE" : "SS") + "SK.",
    ".KSSSSSSSSSSK.",
    ".KSSSSHHSSSSK.",
    ".KSS" + (lit ? "MMMMMM" : "SSSSSS") + "SSK.",
    "..KSSSSSSSSK..",
    "...KKKKKKKK...",
  ];
  sprite(scene, "cophead", head(true), { B: "#1e2c80", G: "#f5c518", K: "#0a0a12", S: "#e8b890", E: "#141414", H: "#c88a60", M: "#7a2a20" });
  sprite(scene, "cophead-off", head(false), { B: "#2c2c34", G: "#3c3c44", K: "#101014", S: "#3a3a42", H: "#3a3a42" });
  sprite(scene, "heart", [
    ".KK...KK.",
    "KRRK.KRRK",
    "KRWRKRRRK",
    "KRRRRRRRK",
    ".KRRRRRK.",
    "..KRRRK..",
    "...KRK...",
    "....K....",
  ], { K: "#1a0606", R: "#d82020", W: "#ff9080" });
  sprite(scene, "shield", [
    "KKKKKKKKK",
    "KBWBBBBBK",
    "KBWBBBBBK",
    "KBBBBBBBK",
    ".KBBBBBK.",
    ".KBBBBBK.",
    "..KBBBK..",
    "...KBK...",
    "....K....",
  ], { K: "#06101a", B: "#2a90e0", W: "#a0d8ff" });
  sprite(scene, "infinity", [
    ".KKK.....KKK.",
    "KWWWK...KWWWK",
    "KWKKWK.KWKKWK",
    "KWK.KWKWK.KWK",
    "KWK..KWK..KWK",
    "KWK.KWKWK.KWK",
    "KWKKWK.KWKKWK",
    "KWWWK...KWWWK",
    ".KKK.....KKK.",
  ], { K: "#000000", W: "#ffffff" });
}

export function shade(hex: string, amount: number) { return shadeHex(hex, 1 + amount); }

/** One Level 2 sprite on its own canvas, for the page decorations outside the game screen. */
export function decorCanvas(kind: { car: string; lights?: number } | { ped: "cop" | "player" | number } | "fire" | "cash") {
  if (kind === "fire" || kind === "cash") {
    const cv = canvas(24, 24), c = ctx2d(cv);
    if (kind === "fire") {
      // A stepped fireball with licks, like the city's burning wrecks.
      const r = rng(11);
      blob(c, 12, 13, 10, 9, "#c8300c");
      for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; blob(c, 12 + Math.cos(a) * 8, 13 + Math.sin(a) * 7, 3 + r() * 2, 3 + r() * 2, "#c8300c"); }
      blob(c, 12, 13, 7.5, 7, "#f08018"); blob(c, 12, 13, 5, 4.5, "#ffd040"); blob(c, 11, 12, 2.5, 2.5, "#fff8d0");
    } else {
      // A banded stack of bills.
      for (let i = 0; i < 4; i++) { const y = 15 - i * 3; rect(c, 2, y, 20, 6, "#141414"); rect(c, 3, y + 1, 18, 4, i % 2 ? "#4f9a4a" : "#5aaa52"); rect(c, 3, y + 1, 18, 1, "#8fd27c"); }
      rect(c, 10, 6, 4, 14, "#141414"); rect(c, 11, 6, 2, 13, "#e8c040");
      blob(c, 7, 9, 2, 1.5, "#2e6a2c"); blob(c, 17, 9, 2, 1.5, "#2e6a2c");
    }
    crisp(c, 24, 24);
    return cv;
  }
  if ("car" in kind) {
    const cv = canvas(CAR_CELL.w, CAR_CELL.h), c = ctx2d(cv);
    drawCar(c, carVariants.find((v) => v.name === kind.car) ?? carVariants[0], { lights: kind.lights });
    crisp(c, CAR_CELL.w, CAR_CELL.h);
    return cv;
  }
  const cv = canvas(PED_CELL, PED_CELL), c = ctx2d(cv);
  const look = kind.ped === "cop" ? COP : kind.ped === "player" ? PLAYER : pedVariants[kind.ped % pedVariants.length];
  drawPed(c, look, { stride: 5, arm: -3, lean: 0, bob: 0, panic: false });
  crisp(c, PED_CELL, PED_CELL);
  return cv;
}
