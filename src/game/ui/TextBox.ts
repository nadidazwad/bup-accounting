import { Scene, GameObjects } from "phaser";
import { gameStore, textSpeedMs } from "../state/store";
import { chip } from "../audio/chip";
import { fontKey, wrap, type Ink } from "./text";

export type TextBoxStyle = "field" | "battle";
export type ShowOptions = { ink?: Ink; onClose?: () => void; keepOpen?: boolean };
// sDownArrowYCoords in text.c steps the arrow through these offsets.
const arrowBob = [0, 1, 2, 1];

// Bitmap glyphs and 8 px border pieces preserve native pixels at every scale.
export class TextBox {
  private readonly frame: GameObjects.Container;
  private text: GameObjects.BitmapText;
  private readonly arrow: GameObjects.Image;
  private readonly style: TextBoxStyle;
  private pages: string[][] = [];
  private page = 0;
  private elapsed = 0;
  private count = 0;
  private ink: Ink = "gray";
  private resolve?: () => void;
  private keepOpen = false;
  private lastWidth = 0;
  onClose?: () => void;
  constructor(private readonly scene: Scene, style: TextBoxStyle = "field", depth = 10000) {
    this.style = style;
    this.frame = scene.add.container(0, 112).setScrollFactor(0).setDepth(depth).setVisible(false);
    if (style === "battle") {
      this.frame.add(scene.add.image(0, 0, "battle-box").setOrigin(0).setCrop(0, 0, 240, 48));
    } else {
      this.frame.add(scene.add.rectangle(16, 8, 208, 32, 0xf8f8f8).setOrigin(0));
      for (let row = 0; row < 6; row++) for (let col = 0; col < 30; col++) {
        if (row !== 0 && row !== 5 && col >= 2 && col <= 27) continue;
        const edge = col === 0 ? 0 : col === 1 ? 1 : col === 28 ? 3 : col === 29 ? 4 : 2;
        const topRow = row <= 2 ? row : 5 - row;
        const index = topRow === 0 ? edge : topRow === 1 ? [5, 6, 7, 8, 9][edge] : [10, 11, 7, 12, 13][edge];
        this.frame.add(scene.add.image(col * 8, row * 8, "textbox", index).setOrigin(0).setFlipY(row >= 3));
      }
    }
    this.text = scene.add.bitmapText(...this.origin(), fontKey(style === "battle" ? "white" : "gray"), "", 14);
    this.arrow = scene.add.image(0, 0, "arrow-down", "arrow").setOrigin(0).setVisible(false);
    this.frame.add([this.text, this.arrow]);
  }
  private origin(): [number, number] { return this.style === "battle" ? [11, 9] : [16, 9]; }
  private get width() { return this.style === "battle" ? 210 : 202; }
  get open() { return this.frame.visible; }
  get busy() { return this.open && this.count < this.current.length; }
  private get current() { return this.pages[this.page]?.join("\n") ?? ""; }
  setDepth(depth: number) { this.frame.setDepth(depth); return this; }

  /** Shows a message; resolves once the reader closes the last page. */
  show(message: string, options: ShowOptions | (() => void) = {}) {
    const opts = typeof options === "function" ? { onClose: options } : options;
    this.resolve?.();
    const ink = opts.ink ?? (this.style === "battle" ? "white" : "gray");
    if (ink !== this.ink) {
      this.ink = ink;
      this.text.setFont(fontKey(ink));
    }
    const lines = wrap(this.scene, message, this.width, ink);
    this.pages = [];
    for (let i = 0; i < lines.length; i += 2) this.pages.push(lines.slice(i, i + 2));
    this.page = 0; this.onClose = opts.onClose; this.keepOpen = !!opts.keepOpen;
    this.frame.setVisible(true); this.beginPage();
    return new Promise<void>((resolve) => { this.resolve = resolve; });
  }
  private beginPage() {
    this.elapsed = 0; this.count = 0; this.arrow.setVisible(false); gameStore.say(this.current);
    this.text.setText(this.pages[this.page].at(-1) ?? "");
    this.lastWidth = this.text.width;
    this.text.setText("");
  }
  /** A/B: finish the page, turn it, or close. */
  advance() {
    if (!this.open) return;
    if (this.count < this.current.length) { this.count = this.current.length; this.text.setText(this.current); return; }
    if (this.page + 1 < this.pages.length) { chip.sfx("select"); this.page++; this.beginPage(); return; }
    if (this.keepOpen) { this.finish(); return; }
    chip.sfx("select");
    this.close();
  }
  /** Text is fully printed on the last page (used for prompts that sit on screen). */
  get waiting() { return this.open && this.page === this.pages.length - 1 && this.count >= this.current.length; }
  private finish() { const resolve = this.resolve; this.resolve = undefined; resolve?.(); }
  close() {
    if (!this.open) return;
    this.frame.setVisible(false); gameStore.say("");
    const onClose = this.onClose; this.onClose = undefined;
    onClose?.(); this.finish();
  }
  update(time: number, delta: number) {
    if (!this.open) return;
    this.elapsed += delta;
    const value = this.current;
    const count = Math.min(value.length, Math.floor(this.elapsed / textSpeedMs[gameStore.getSnapshot().settings.textSpeed]));
    if (count > this.count) { this.count = count; this.text.setText(value.slice(0, count)); }
    const done = this.count >= value.length;
    // Prompts resolve as soon as their text is printed, so a menu can appear beside them.
    if (done && this.keepOpen && this.page === this.pages.length - 1 && this.resolve) this.finish();
    const showArrow = done && !(this.keepOpen && this.page === this.pages.length - 1);
    if (showArrow) {
      // The arrow sits just after the last printed glyph, bobbing like the original.
      const [ox, oy] = this.origin();
      this.arrow.setPosition(ox + this.lastWidth + 2, oy + (this.pages[this.page].length - 1) * 15 + 5 + arrowBob[Math.floor(time / 133) % 4]);
    }
    this.arrow.setVisible(showArrow);
  }
}
