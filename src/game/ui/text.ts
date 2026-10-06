import type { Scene } from "phaser";

export type Ink = "gray" | "blue" | "red" | "white" | "small" | "small-white" | "gold" | "edge";
const fonts: Record<Ink, string> = { gray: "frlg", blue: "frlg-blue", red: "frlg-red", white: "frlg-white", small: "frlg-small", "small-white": "frlg-small-white", gold: "frlg-gold", edge: "frlg-edge" };
// Bitmap text must render at its native size; any other size resamples the glyphs.
export const fontSize = (ink: Ink) => (ink.startsWith("small") ? 12 : 14);

// The native font has curly quotes and its own Pokédollar glyph (¥), but no
// ASCII apostrophe or straight double quote.
export function fr(text: string) {
  let open = true;
  return text.replace(/'/g, "’").replace(/"/g, () => ((open = !open) ? "”" : "“")).replace(/₽/g, "¥").replace(/[—–]/g, "-");
}

export function label(scene: Scene, x: number, y: number, text: string, ink: Ink = "gray") {
  return scene.add.bitmapText(x, y, fonts[ink], fr(text), fontSize(ink));
}

export const fontKey = (ink: Ink) => fonts[ink];

/** Splits text into lines that fit `width` pixels, honouring explicit newlines. */
export function wrap(scene: Scene, text: string, width: number, ink: Ink = "gray") {
  const probe = scene.add.bitmapText(0, 0, fonts[ink], "", fontSize(ink)).setVisible(false);
  const lines: string[] = [];
  for (const paragraph of fr(text).split("\n")) {
    let line = "";
    for (const word of paragraph.split(/ +/)) {
      const candidate = line ? `${line} ${word}` : word;
      probe.setText(candidate);
      if (probe.width > width && line) { lines.push(line); line = word; } else line = candidate;
    }
    lines.push(line);
  }
  probe.destroy();
  return lines;
}

export function measure(scene: Scene, text: string, ink: Ink = "gray") {
  const probe = scene.add.bitmapText(0, 0, fonts[ink], fr(text), fontSize(ink)).setVisible(false);
  const width = probe.width; probe.destroy();
  return width;
}
