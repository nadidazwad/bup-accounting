import Phaser from "phaser";
import { GTA2 } from "../style/gta2";
import { MAX_HEADS, FRENZY_TARGET } from "../city/rules";
import { reducedMotion } from "./helpers";
import { FlashLimiter } from "../city/flash";
import { PixelText, pixelFamily, renderPixelText, type PixelStyle } from "../ui/pixelText";
import { chip } from "../audio/chip";

// GTA 2-era HUD for Level 2, drawn on the native 640×480 grid with pixel fonts
// and pixel-art icons: a pager handset top-left (one-off messages, then the
// current job on a loop), cop heads top-centre, score and multiplier
// top-right, lives and armour bottom-left, chunky centre messages, and the
// mission briefing that opens the level. It lives in its own scene so the
// world camera can zoom with speed while the HUD stays put.
const W = GTA2.width, H = GTA2.height;
const LCD = { x: 16, y: 15, w: 166, h: 22 };
const GOLD = ["#fffbd0", "#ffe060", "#f5c518", "#e09a10", "#b86a08"];
const RED = ["#ffd0c0", "#ff5040", "#e8262b", "#a8100c"];
const WHITE = ["#ffffff", "#e8e8e8", "#c8c8d0"];
const BLUE = ["#d0f0ff", "#60c0ff", "#2a80e0"];

type Line = { text: string; style: PixelStyle };

export class CityHudScene extends Phaser.Scene {
  private score!: PixelText;
  private mult!: PixelText;
  private victims!: PixelText;
  private heads: Phaser.GameObjects.Image[] = [];
  private lcd!: Phaser.Textures.CanvasTexture;
  private pagerQueue: string[] = [];
  private pagerLoop = "";
  private pagerStrip: HTMLCanvasElement | null = null;
  private pagerScroll = 0;
  private pagerLed!: Phaser.GameObjects.Rectangle;
  private big!: PixelText;
  private small!: PixelText;
  private radioText!: PixelText;
  private armour!: Phaser.GameObjects.Graphics;
  private shield!: Phaser.GameObjects.Image;
  private edge!: Phaser.GameObjects.Image;
  private pauseLayer!: Phaser.GameObjects.Container;
  private cover!: Phaser.GameObjects.Rectangle;
  private readonly flashes = new FlashLimiter(2);
  private wanted = 0;
  private bigTimer?: Phaser.Time.TimerEvent;
  private radioTimer?: Phaser.Time.TimerEvent;
  private briefing: { skip: boolean; done: boolean; resolve: () => void } | null = null;

  constructor() { super("CityHud"); }

  create() {
    this.cameras.main.setZoom(GTA2.render).centerOn(W / 2, H / 2);
    this.heads = []; this.pagerQueue = []; this.pagerLoop = ""; this.pagerStrip = null; this.wanted = 0; this.briefing = null;
    this.drawPager();

    // Wanted level: six pixel cop heads.
    for (let i = 0; i < MAX_HEADS; i++) this.heads.push(this.add.image(W / 2 + 14 - ((MAX_HEADS - 1) / 2) * 30 + i * 30, 22, "cophead-off").setScale(2));

    this.score = new PixelText(this, W - 8, 2, "$0", { size: 40, fill: GOLD, outline: "#000000", shadow: "#2a1600", shadowOffset: 2 }).setOrigin(1, 0);
    this.mult = new PixelText(this, W - 10, 40, "x1", { size: 30, fill: WHITE, outline: "#000000", shadow: "#202020" }).setOrigin(1, 0);
    this.victims = new PixelText(this, W - 10, 70, `VICTIMS 0/${FRENZY_TARGET}`, { font: "smallBold", size: 8, fill: "#ffffff", outline: "#000000", shadow: "#202020" }).setOrigin(1, 0).setScale(2);

    // Lives and armour, bottom-left.
    this.add.image(10, H - 30, "heart").setOrigin(0).setScale(2);
    this.add.image(32, H - 30, "infinity").setOrigin(0).setScale(2);
    this.shield = this.add.image(68, H - 32, "shield").setOrigin(0).setScale(2);
    this.armour = this.add.graphics();

    this.radioText = new PixelText(this, W / 2, 46, "", { font: "smallBold", size: 8, fill: ["#c8ffff", "#3ee6ff"], outline: "#002a30", shadow: "#000000" }).setOrigin(0.5, 0).setScale(2).setVisible(false);
    this.big = new PixelText(this, W / 2, H * 0.36, "", { size: 30, fill: GOLD, outline: "#000000", shadow: "#000000", block: 2 }).setOrigin(0.5).setVisible(false);
    this.small = new PixelText(this, W / 2, H * 0.36 + 44, "", { font: "smallBold", size: 8, fill: "#ffffff", outline: "#000000", shadow: "#000000" }).setOrigin(0.5, 0).setScale(2).setVisible(false);
    const dim = this.add.rectangle(0, 0, W, H, 0x000000, 0.55).setOrigin(0);
    const paused = new PixelText(this, W / 2, H / 2 - 20, "PAUSED", { size: 30, fill: WHITE, outline: "#000000", shadow: "#000000", block: 2 }).setOrigin(0.5);
    const resume = new PixelText(this, W / 2, H / 2 + 30, "ESC / M TO RESUME", { font: "smallBold", size: 8, fill: GOLD, outline: "#000000" }).setOrigin(0.5).setScale(2);
    this.pauseLayer = this.add.container(0, 0, [dim, paused, resume]).setVisible(false).setDepth(50);
    this.edge = this.add.image(0, 0, "city-arrow").setScale(2).setVisible(false);
    this.cover = this.add.rectangle(0, 0, W, H, 0xffffff, 1).setOrigin(0).setAlpha(0).setDepth(100);
    this.setArmour(null);
  }

  // ——— Pager ———
  private drawPager() {
    // A chunky 90s pager: bevelled plastic, an antenna nub, two buttons, a status LED.
    const g = this.add.graphics();
    const x = 6, y = 6, w = 204, h = 42;
    g.fillStyle(0x000000, 0.5).fillRect(x + 3, y + 3, w, h);
    g.fillStyle(0x000000, 1).fillRect(x - 1, y - 1, w + 2, h + 2);
    g.fillStyle(0x2c2f35, 1).fillRect(x, y, w, h);
    g.fillStyle(0x4c5059, 1).fillRect(x, y, w, 2).fillRect(x, y, 2, h);
    g.fillStyle(0x17181c, 1).fillRect(x, y + h - 2, w, 2).fillRect(x + w - 2, y, 2, h);
    g.fillStyle(0x000000, 1).fillRect(x + 14, y - 5, 18, 5);
    g.fillStyle(0x3a3d44, 1).fillRect(x + 15, y - 4, 16, 4);
    // LCD bezel and glass with a dot-matrix grid.
    g.fillStyle(0x0b1208, 1).fillRect(LCD.x - 3, LCD.y - 3, LCD.w + 6, LCD.h + 6);
    g.fillStyle(0x91c45c, 1).fillRect(LCD.x, LCD.y, LCD.w, LCD.h);
    g.fillStyle(0x86b852, 1);
    for (let gx = LCD.x + 1; gx < LCD.x + LCD.w; gx += 2) g.fillRect(gx, LCD.y, 1, LCD.h);
    for (let gy = LCD.y + 1; gy < LCD.y + LCD.h; gy += 2) g.fillRect(LCD.x, gy, LCD.w, 1);
    if (this.textures.exists("pager-lcd")) this.textures.remove("pager-lcd");
    this.lcd = this.textures.createCanvas("pager-lcd", LCD.w, LCD.h)!;
    this.add.image(LCD.x, LCD.y, "pager-lcd").setOrigin(0);
    // Buttons and the message LED.
    for (const by of [y + 9, y + 23]) {
      g.fillStyle(0x000000, 1).fillRect(x + w - 18, by, 12, 10);
      g.fillStyle(0x6a6e78, 1).fillRect(x + w - 17, by + 1, 10, 7);
      g.fillStyle(0x8a8e98, 1).fillRect(x + w - 17, by + 1, 10, 1);
    }
    this.pagerLed = this.add.rectangle(x + w - 26, y + 6, 3, 3, 0x2a0a0a).setOrigin(0);
  }

  update(_time: number, delta: number) {
    this.tickPager(delta / 1000);
  }

  /** One-off messages scroll once each; then the loop message cycles forever. */
  private tickPager(dt: number) {
    if (!this.pagerStrip) {
      const next = this.pagerQueue.shift();
      const text = next ?? this.pagerLoop;
      if (!text) return;
      this.pagerStrip = renderPixelText(text.toUpperCase(), { font: "smallBold", size: 8, fill: "#16280e", outline: null, shadow: "#7aa84a", shadowOffset: 1 });
      this.pagerScroll = -LCD.w;
      if (next !== undefined) { chip.sfx("pager"); this.pagerLed.setFillStyle(0xff3020); }
    }
    this.pagerScroll += dt * 58;
    const ctx = this.lcd.context;
    ctx.clearRect(0, 0, LCD.w, LCD.h);
    ctx.drawImage(this.pagerStrip, -Math.round(this.pagerScroll), Math.round((LCD.h - this.pagerStrip.height) / 2));
    this.lcd.refresh();
    if (this.pagerScroll > this.pagerStrip.width + 12) {
      this.pagerStrip = null;
      if (!this.pagerQueue.length) this.pagerLed.setFillStyle(0x2a0a0a);
    }
  }

  /** Queue a message (urgent ones cut in now). */
  pager(message: string, urgent = false) {
    if (urgent) { this.pagerQueue.length = 0; this.pagerStrip = null; }
    this.pagerQueue.push(message);
  }

  /** The message the pager repeats whenever nothing new has come in. */
  setPagerLoop(message: string) { this.pagerLoop = message; }

  // ——— Stats ———
  setScore(score: number, multiplier: number) {
    this.score.setText(`$${score.toLocaleString("en-US")}`);
    this.mult.setText(`x${multiplier}`);
  }

  setVictims(n: number) { this.victims.setText(`VICTIMS ${Math.min(n, 999)}/${FRENZY_TARGET}`); }

  setWanted(level: number) {
    if (level === this.wanted) return;
    const rising = level > this.wanted;
    this.wanted = level;
    this.heads.forEach((h, i) => {
      h.setTexture(i < level ? "cophead" : "cophead-off");
      if (rising && i === level - 1 && !reducedMotion()) { h.setScale(3); this.time.delayedCall(120, () => h.setScale(2)); }
    });
  }

  setArmour(health: number | null) {
    this.armour.clear();
    this.shield.setVisible(health !== null);
    if (health === null) return;
    // Ten chunky segments.
    const x = 92, y = H - 28, segs = 10;
    this.armour.fillStyle(0x000000, 1).fillRect(x - 2, y - 2, segs * 8 + 2, 14);
    const lit = Math.ceil((Math.max(0, health) / 100) * segs);
    const color = health > 60 ? 0x3aa8ff : health > 30 ? 0xf5c518 : 0xe8262b;
    for (let i = 0; i < segs; i++) {
      this.armour.fillStyle(i < lit ? color : 0x26262c, 1).fillRect(x + i * 8, y, 6, 10);
      if (i < lit) this.armour.fillStyle(0xffffff, 0.35).fillRect(x + i * 8, y, 6, 2);
    }
  }

  // ——— Messages ———
  /** Big centre text in chunky double pixels. */
  message(text: string, tone: "gold" | "red" | "white" | "blue" = "gold", ms = 2200, sub = "") {
    this.bigTimer?.remove();
    const fill = tone === "red" ? RED : tone === "white" ? WHITE : tone === "blue" ? BLUE : GOLD;
    this.big.setStyle({ fill }).setText(text).setVisible(true).setScale(1);
    this.small.setText(sub).setVisible(!!sub);
    // A stepped pop-in (no smooth tween), like the old games.
    if (!reducedMotion()) { this.big.setScale(1.5); this.time.delayedCall(70, () => this.big.setScale(1.25)); this.time.delayedCall(140, () => this.big.setScale(1)); }
    this.bigTimer = this.time.delayedCall(ms, () => { this.big.setVisible(false); this.small.setVisible(false); });
  }

  radio(name: string) {
    this.radioTimer?.remove();
    this.radioText.setText(name).setVisible(true);
    this.radioTimer = this.time.delayedCall(2400, () => this.radioText.setVisible(false));
  }

  /** Off-screen objective: an arrow at the screen edge. angle null hides it. */
  edgeArrow(angle: number | null, time = 0) {
    if (angle === null) { this.edge.setVisible(false); return; }
    // Kept inside the HUD furniture: below the cop heads, above lives/armour.
    const rx = W / 2 - 44, ry = H / 2 - 96;
    const c = Math.cos(angle), s = Math.sin(angle);
    const k = Math.min(rx / Math.abs(c || 1e-6), ry / Math.abs(s || 1e-6));
    const bob = reducedMotion() ? 0 : Math.round(Math.sin(time / 160) * 2) * 2;
    this.edge.setVisible(true).setPosition(Math.round(W / 2 + c * (k + bob)), Math.round(H / 2 + 6 + s * (k + bob))).setRotation(angle);
  }

  pause(on: boolean) { this.pauseLayer.setVisible(on); }

  /** One white flash for an explosion. Skipped with reduced motion or if it would break the flash limit. */
  flash() {
    if (reducedMotion() || !this.flashes.allow(this.time.now)) return;
    this.cover.setAlpha(0.55);
    this.tweens.add({ targets: this.cover, alpha: 0, duration: 260 });
  }

  // ——— Mission briefing ———
  get briefingOpen() { return !!this.briefing; }

  /** Confirm during the briefing: finish the typing first, then accept. */
  briefingInput() {
    const b = this.briefing;
    if (!b) return;
    if (!b.done) b.skip = true; else b.resolve();
  }

  /** A GTA 2-style mission briefing. Resolves when the player accepts the job. */
  brief(header: string, title: string, lines: string[], footer: string) {
    return new Promise<void>((resolve) => {
      const layer = this.add.container(0, 0).setDepth(80);
      const g = this.add.graphics();
      g.fillStyle(0x000000, 0.72).fillRect(0, 0, W, H);
      const px = 24, py = 54, pw = W - 48, ph = H - 100;
      g.fillStyle(0x000000, 1).fillRect(px - 2, py - 2, pw + 4, ph + 4);
      g.fillStyle(0x121216, 1).fillRect(px, py, pw, ph);
      g.fillStyle(0xf5c518, 1).fillRect(px, py, pw, 2).fillRect(px, py + ph - 2, pw, 2).fillRect(px, py, 2, ph).fillRect(px + pw - 2, py, 2, ph);
      g.fillStyle(0x24221a, 1).fillRect(px + 2, py + 2, pw - 4, 24);
      g.fillStyle(0xf5c518, 1).fillRect(px + 2, py + 26, pw - 4, 1);
      g.fillStyle(0x000000, 0.25);
      for (let y = py + 28; y < py + ph - 2; y += 2) g.fillRect(px + 2, y, pw - 4, 1);
      // Portrait: THE BROKER on a green video-phone screen.
      const fx = px + 14, fy = py + 40, fs = 132;
      g.fillStyle(0x000000, 1).fillRect(fx - 3, fy - 3, fs + 6, fs + 6);
      g.fillStyle(0xf5c518, 1).fillRect(fx - 2, fy - 2, fs + 4, 1).fillRect(fx - 2, fy + fs + 1, fs + 4, 1).fillRect(fx - 2, fy - 2, 1, fs + 4).fillRect(fx + fs + 1, fy - 2, 1, fs + 4);
      g.fillStyle(0x10301c, 1).fillRect(fx, fy, fs, fs);
      const portrait = this.add.image(fx + fs / 2, fy + fs / 2 + 4, "broker-front").setScale(2).setTint(0xb8ffcc);
      const scan = this.add.graphics();
      scan.fillStyle(0x000000, 0.28);
      for (let y = fy; y < fy + fs; y += 2) scan.fillRect(fx, y, fs, 1);
      const name = new PixelText(this, fx + fs / 2, fy + fs + 6, "THE BROKER", { size: 20, fill: GOLD, outline: "#000000" }).setOrigin(0.5, 0);
      const head = new PixelText(this, px + 10, py + 6, header, { font: "smallBold", size: 8, fill: ["#ffffff", "#c8c8c8"], outline: "#000000" }).setOrigin(0, 0).setScale(2);
      const bodyX = fx + fs + 18, bodyW = px + pw - 14 - bodyX;
      const titleText = new PixelText(this, bodyX, py + 34, title, { size: 30, fill: GOLD, outline: "#000000", shadow: "#2a1600", shadowOffset: 2 }).setOrigin(0, 0);
      const foot = new PixelText(this, W / 2, py + ph - 8, footer, { font: "smallBold", size: 8, fill: GOLD, outline: "#000000" }).setOrigin(0.5, 1).setScale(2).setVisible(false);
      layer.add([g, portrait, scan, name, head, titleText, foot]);
      // Word-wrap each line to the text column (small font drawn at 2×).
      const wrapped: Line[] = [];
      const probe = document.createElement("canvas").getContext("2d")!;
      for (const line of lines) {
        const step = /^\d\./.test(line);
        const style: PixelStyle = { font: step ? "smallBold" : "small", size: 8, fill: step ? "#ffe060" : "#e8e8e8", outline: "#000000" };
        probe.font = `${step ? "700 " : ""}8px ${pixelFamily("small")}`;
        let current = "";
        for (const word of line.split(" ")) {
          const next = current ? `${current} ${word}` : word;
          if (probe.measureText(next).width * 2 + 8 > bodyW && current) { wrapped.push({ text: current, style }); current = (step ? "   " : "") + word; }
          else current = next;
        }
        wrapped.push({ text: current, style });
        wrapped.push({ text: "", style });
      }
      wrapped.pop();
      const state = { skip: false, done: false, resolve: () => {} };
      this.briefing = state;
      let blink: Phaser.Time.TimerEvent | undefined;
      state.resolve = () => {
        if (!this.briefing) return;
        this.briefing = null;
        blink?.remove();
        chip.sfx("select");
        layer.destroy(true);
        resolve();
      };
      const pause = (ms: number) => new Promise((r) => this.time.delayedCall(ms, r));
      const run = async () => {
        chip.sfx("pager");
        let y = py + 72;
        for (const line of wrapped) {
          const t = new PixelText(this, bodyX, y, "", line.style).setOrigin(0, 0).setScale(2);
          layer.add(t);
          for (let i = 1; i <= line.text.length; i++) {
            t.setText(line.text.slice(0, i));
            if (!state.skip) { if (line.text[i - 1] !== " " && i % 2) chip.sfx("type"); await pause(22); }
          }
          y += line.text ? 18 : 8;
          if (!state.skip && line.text === "") await pause(160);
        }
        state.done = true;
        foot.setVisible(true);
        // A slow 1 Hz blink on a small prompt (well inside the flash limits).
        blink = this.time.addEvent({ delay: 500, loop: true, callback: () => foot.setVisible(reducedMotion() || !foot.visible) });
      };
      void run();
    });
  }
}
