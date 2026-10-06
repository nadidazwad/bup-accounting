import { GameObjects, type Scene } from "phaser";
import type { InputAction } from "../input/router";
import { chip } from "../audio/chip";
import { gameStore } from "../state/store";
import { Window } from "./Window";
import { fr, label, measure } from "./text";

export type MenuOptions = {
  x: number; y: number; width?: number; items: string[]; depth?: number; cursor?: number; lineHeight?: number;
  /** Width/height include the window frame. Defaults fit the items. */
  height?: number;
  onSelect: (index: number) => void; onCancel?: () => void; onMove?: (index: number) => void;
};

// FRLG list menu: Type 1 window, ▶ cursor, 16 px rows (15 px glyphs + 1).
export class Menu {
  readonly window: Window;
  private readonly cursor: GameObjects.BitmapText;
  private readonly rows: GameObjects.BitmapText[] = [];
  index: number;
  private readonly line: number;
  constructor(private readonly scene: Scene, private readonly options: MenuOptions) {
    this.line = options.lineHeight ?? 16;
    const width = options.width ?? Math.ceil((Math.max(...options.items.map((item) => measure(scene, item))) + 32) / 8) * 8;
    const height = options.height ?? options.items.length * this.line + 16;
    this.window = new Window(scene, options.x, options.y, width, height).setDepth(options.depth ?? 10010).setScrollFactor(0);
    options.items.forEach((item, i) => {
      const row = label(scene, 18, 8 + i * this.line, item);
      this.rows.push(row); this.window.add(row);
    });
    this.cursor = label(scene, 9, 8, "▶");
    this.window.add(this.cursor);
    this.index = Math.min(options.cursor ?? 0, options.items.length - 1);
    this.place();
    gameStore.say(`${fr(options.items[this.index])}. ${options.items.length} options.`);
  }
  get bounds() { return { x: this.window.x, y: this.window.y, width: this.window.inner.width + 16, height: this.window.inner.height + 16 }; }
  private place() { this.cursor.setY(8 + this.index * this.line); }
  setItem(i: number, text: string) { this.rows[i]?.setText(fr(text)); }
  move(delta: number) {
    const count = this.options.items.length;
    this.index = (this.index + delta + count) % count;
    this.place(); chip.sfx("cursor");
    gameStore.say(fr(this.options.items[this.index]));
    this.options.onMove?.(this.index);
  }
  handle(action: InputAction) {
    if (action === "up") this.move(-1);
    else if (action === "down") this.move(1);
    else if (action === "confirm" || action === "start" || action === "interact") { chip.sfx("select"); this.options.onSelect(this.index); }
    else if (action === "cancel" || action === "menu") { chip.sfx("select"); this.options.onCancel?.(); }
    return true;
  }
  /** Pointer support: tap a row to select it. Returns false if outside. */
  pointer(x: number, y: number) {
    const b = this.bounds;
    if (x < b.x || x >= b.x + b.width || y < b.y || y >= b.y + b.height) return false;
    const i = Math.floor((y - b.y - 8) / this.line);
    if (i < 0 || i >= this.options.items.length) return true;
    if (i !== this.index) { this.index = i; this.place(); this.options.onMove?.(i); }
    chip.sfx("select"); this.options.onSelect(i);
    return true;
  }
  destroy() { this.window.destroy(); }
}

/** The YES/NO box that sits above the dialogue frame. Resolves true for YES. */
export function askYesNo(scene: Scene, register: (handler: UiHandler) => () => void, x = 184, y = 64) {
  return new Promise<boolean>((resolve) => {
    let release = () => {};
    const done = (yes: boolean) => { release(); menu.destroy(); resolve(yes); };
    const menu = new Menu(scene, { x, y, width: 56, items: ["YES", "NO"], onSelect: (i) => done(i === 0), onCancel: () => done(false) });
    release = register({ handle: (a) => menu.handle(a), pointer: (px, py) => menu.pointer(px, py) });
  });
}

export type UiHandler = { handle: (action: InputAction) => boolean; pointer?: (x: number, y: number) => boolean };

/** A stack of modal UI layers. The top layer receives input. */
export class UiStack {
  private readonly layers: UiHandler[] = [];
  push(handler: UiHandler) {
    this.layers.push(handler);
    return () => { const i = this.layers.lastIndexOf(handler); if (i >= 0) this.layers.splice(i, 1); };
  }
  get active() { return this.layers.length > 0; }
  handle(action: InputAction) { return this.layers.at(-1)?.handle(action) ?? false; }
  pointer(x: number, y: number) { return this.layers.at(-1)?.pointer?.(x, y) ?? false; }
  clear() { this.layers.length = 0; }
}
