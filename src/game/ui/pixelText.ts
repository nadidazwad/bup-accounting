// Old-school text for the GTA screens. Text is drawn with a pixel font at the
// native 640×480 grid, then hard-thresholded (no anti-aliasing), filled with
// colour bands top to bottom, given a 1 px outline and a hard drop shadow, and
// optionally blown up in whole-pixel blocks. Displayed with nearest sampling,
// it looks like a 90s PC game's bitmap font, not smooth "fake retro" text.
import Phaser from "phaser";

export type PixelFont = "big" | "small" | "smallBold";
export type PixelStyle = {
  font?: PixelFont;
  size: number;              // font size in native pixels
  fill?: string | string[];  // one colour, or bands from top to bottom
  outline?: string | null;
  shadow?: string | null;
  shadowOffset?: number;
  block?: number;            // integer upscale for chunky titles
  letterSpacing?: number;
};

const fallback = "monospace";
export function pixelFamily(font: PixelFont = "big") {
  if (typeof document === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(font === "big" ? "--font-gta" : "--font-gta-small").trim();
  return v ? `${v}, ${fallback}` : fallback;
}

const parse = (hex: string) => { const n = parseInt(hex.replace("#", ""), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };

/** Renders text into a fresh canvas (or into `into`, resized). */
export function renderPixelText(text: string, style: PixelStyle, into?: HTMLCanvasElement) {
  const font = style.font ?? "big";
  const weight = font === "smallBold" ? "700 " : "";
  const fontCss = `${weight}${style.size}px ${pixelFamily(font)}`;
  const probe = (into ?? document.createElement("canvas")).getContext("2d", { willReadFrequently: true })!;
  probe.font = fontCss;
  if ("letterSpacing" in probe) (probe as unknown as { letterSpacing: string }).letterSpacing = `${style.letterSpacing ?? 0}px`;
  const lines = text.split("\n");
  const m = probe.measureText("Ag");
  const ascent = Math.ceil(m.fontBoundingBoxAscent || style.size * 0.8);
  const descent = Math.ceil(m.fontBoundingBoxDescent || style.size * 0.2);
  const lineH = ascent + descent;
  const pad = 1 + (style.shadow ? style.shadowOffset ?? 1 : 0) + 1;
  const width = Math.max(1, Math.ceil(Math.max(...lines.map((l) => probe.measureText(l).width))) + pad * 2);
  const height = lineH * lines.length + pad * 2;

  // 1. Raw glyphs, white on transparent.
  const raw = document.createElement("canvas"); raw.width = width; raw.height = height;
  const r = raw.getContext("2d", { willReadFrequently: true })!;
  r.font = fontCss; r.fillStyle = "#fff"; r.textBaseline = "alphabetic";
  if ("letterSpacing" in r) (r as unknown as { letterSpacing: string }).letterSpacing = `${style.letterSpacing ?? 0}px`;
  lines.forEach((l, i) => r.fillText(l, pad, pad + ascent + i * lineH));
  const src = r.getImageData(0, 0, width, height).data;
  const mask = new Uint8Array(width * height);
  let top = height, bottom = 0;
  for (let i = 0; i < mask.length; i++) if (src[i * 4 + 3] >= 120) { mask[i] = 1; const y = (i / width) | 0; if (y < top) top = y; if (y > bottom) bottom = y; }

  // 2. Fill bands, outline, shadow.
  const fills = (Array.isArray(style.fill) ? style.fill : [style.fill ?? "#ffffff"]).map(parse);
  const outline = style.outline === null ? null : parse(style.outline ?? "#000000");
  const shadow = style.shadow ? parse(style.shadow) : null;
  const so = style.shadowOffset ?? 1;
  const out = new ImageData(width, height);
  const d = out.data;
  const glyphRow = (y: number) => {
    // Bands repeat per line so multi-line text gets the same gradient on each.
    const line = Math.min(lines.length - 1, Math.max(0, Math.floor((y - pad) / lineH)));
    const lineTop = lines.length > 1 ? pad + line * lineH + Math.max(0, top - pad) : top;
    const span = lines.length > 1 ? Math.max(1, (bottom - top + 1) / lines.length) : Math.max(1, bottom - top + 1);
    return Math.min(fills.length - 1, Math.max(0, Math.floor(((y - lineTop) / span) * fills.length)));
  };
  const set = (i: number, c: number[]) => { d[i * 4] = c[0]; d[i * 4 + 1] = c[1]; d[i * 4 + 2] = c[2]; d[i * 4 + 3] = 255; };
  const near = (x: number, y: number) => {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < width && ny < height && mask[ny * width + nx]) return true;
    }
    return false;
  };
  const solid = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = y * width + x;
    if (mask[i]) { set(i, fills[glyphRow(y)]); solid[i] = 1; }
    else if (outline && near(x, y)) { set(i, outline); solid[i] = 1; }
  }
  if (shadow) for (let y = height - 1; y >= 0; y--) for (let x = width - 1; x >= 0; x--) {
    const i = y * width + x, sx = x - so, sy = y - so;
    if (solid[i] || sx < 0 || sy < 0) continue;
    if (solid[sy * width + sx]) set(i, shadow);
  }

  const block = Math.max(1, Math.round(style.block ?? 1));
  const canvas = into ?? document.createElement("canvas");
  canvas.width = width * block; canvas.height = height * block;
  const c = canvas.getContext("2d")!;
  if (block === 1) c.putImageData(out, 0, 0);
  else {
    const tmp = document.createElement("canvas"); tmp.width = width; tmp.height = height;
    tmp.getContext("2d")!.putImageData(out, 0, 0);
    c.imageSmoothingEnabled = false;
    c.drawImage(tmp, 0, 0, width * block, height * block);
  }
  return canvas;
}

let serial = 0;

/** A Phaser image showing pixel text; setText re-renders only when the text changes. */
export class PixelText extends Phaser.GameObjects.Image {
  private value = "";
  private readonly tex: Phaser.Textures.CanvasTexture;
  constructor(scene: Phaser.Scene, x: number, y: number, text: string, private styleDef: PixelStyle) {
    const key = `pixel-text-${serial++}`;
    const first = renderPixelText(text || " ", styleDef);
    const tex = scene.textures.createCanvas(key, first.width, first.height)!;
    tex.context.drawImage(first, 0, 0);
    tex.refresh();
    super(scene, x, y, key);
    this.tex = tex; this.value = text;
    scene.add.existing(this);
    this.once(Phaser.GameObjects.Events.DESTROY, () => { if (scene.textures.exists(key)) scene.textures.remove(key); });
  }

  get text() { return this.value; }

  setText(text: string) {
    if (text === this.value) return this;
    this.value = text;
    this.redraw();
    return this;
  }

  setStyle(style: Partial<PixelStyle>) {
    this.styleDef = { ...this.styleDef, ...style };
    this.redraw();
    return this;
  }

  private redraw() {
    const fresh = renderPixelText(this.value || " ", this.styleDef);
    this.tex.setSize(fresh.width, fresh.height); // resizes the canvas and frames when needed
    this.tex.context.clearRect(0, 0, fresh.width, fresh.height);
    this.tex.context.drawImage(fresh, 0, 0);
    this.tex.refresh();
    this.setSizeToFrame(this.tex.get());
    this.updateDisplayOrigin();
  }
}
