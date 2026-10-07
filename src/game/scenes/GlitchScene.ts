import Phaser from "phaser";
import { gameStore } from "../state/store";
import { chip } from "../audio/chip";
import { GTA2, loadGtaFont } from "../style/gta2";
import { PixelText, type PixelStyle } from "../ui/pixelText";
import { bindInput, reducedMotion, snapshotTexture, wait } from "./helpers";
import { Window } from "../ui/Window";
import { label } from "../ui/text";
import { ensureCityTextures, TEX, TILESET } from "../city/textures";
import { generateCity, WORLD } from "../city/layout";
import { FlashLimiter } from "../city/flash";

// PLAN.md §6: the Pokémon cartridge breaks and boots into GTA.
// 1. The music sags to a stop while the FRLG frame corrupts: wrong tiles,
//    torn scanlines, split colour channels, then a pixelated collapse.
// 2. A fake GBA error box with glitching text.
// 3. Hard cut to black, then the GRAND THEFT AUDIT 2 front end and district select.
// Flashing is capped at 2 per second (WCAG 2.3.1 allows 3); reduced motion
// keeps the corruption but drops tearing, shaking and flashes.
const STRIPS = 20;
const CHANNELS = [0xff0000, 0x00ff00, 0x0000ff];
const SNAP = "glitch-snap";
const WHITE_BANDS = ["#ffffff", "#e8e8e8", "#b8b8c0"];

export class GlitchScene extends Phaser.Scene {
  private strips: Phaser.GameObjects.Image[][] = [];
  private tear: number[] = new Array(STRIPS).fill(0);
  private split = 0;
  private intensity = 0;
  private corruption: Phaser.GameObjects.Image[] = [];
  private stepT = 0;
  private phase: "glitch" | "error" | "black" | "menu" | "leaving" = "glitch";
  private readonly flashes = new FlashLimiter(2);
  private start = false;

  constructor() { super("Glitch"); }

  init() {
    this.strips = []; this.tear = new Array(STRIPS).fill(0); this.split = 0; this.intensity = 0;
    this.corruption = []; this.stepT = 0; this.phase = "glitch"; this.start = false;
  }

  create(setup?: { snapshot?: boolean }) {
    gameStore.setScene("Glitch");
    gameStore.setFlag("bossBeaten");
    // Checkpoint: CONTINUE on the title now goes straight to Level 2.
    if (setup?.snapshot) gameStore.save();
    this.cameras.main.setBackgroundColor("#000000");
    bindInput(this, (action) => { if (action === "confirm" || action === "interact") this.start = true; }, () => { this.start = true; });
    void this.run(!!setup?.snapshot && this.textures.exists(SNAP));
  }

  private async run(haveSnapshot: boolean) {
    if (!haveSnapshot) await this.fallbackFrame();
    this.game.canvas.dataset.ready = "true";
    gameStore.setGameReady(true);
    gameStore.say("Something is wrong with the cartridge…");
    void loadGtaFont();
    await this.corrupt();
    await this.errorBox();
    await this.hardCut();
    await this.frontEnd();
  }

  /** Dev entry (?level=glitch): render the town for one frame and capture it. */
  private async fallbackFrame() {
    const map = this.make.tilemap({ key: "town" });
    const tiles = map.addTilesetImage("town", "town-tiles")!;
    const layers = [map.createLayer("Ground", tiles)!, map.createLayer("Structures", tiles)!];
    this.cameras.main.centerOn(9 * 16 + 8, 22 * 16);
    await snapshotTexture(this, SNAP);
    layers.forEach((l) => l.destroy());
    map.destroy();
    this.cameras.main.centerOn(120, 80);
  }

  // ——— Phase 1: the frame corrupts ———
  private async corrupt() {
    const calm = reducedMotion();
    this.cameras.main.centerOn(120, 80);
    // Three additive colour channels, each cut into horizontal strips.
    for (const color of CHANNELS) {
      const row: Phaser.GameObjects.Image[] = [];
      for (let i = 0; i < STRIPS; i++) {
        const h = 160 / STRIPS;
        row.push(this.add.image(0, 0, SNAP).setOrigin(0).setCrop(0, i * h, 240, h).setTint(color).setBlendMode(Phaser.BlendModes.ADD));
      }
      this.strips.push(row);
    }
    // Wrong-tile "MissingNo" blocks pulled from the real tileset.
    const tiles = this.textures.get("town-tiles");
    const cols = Math.floor(tiles.source[0].width / 16), rows = Math.floor(tiles.source[0].height / 16);
    for (let i = 0; i < 40; i++) {
      const frame = `glitch-${i}`;
      if (!tiles.has(frame)) tiles.add(frame, 0, Math.floor(Math.random() * cols) * 16, Math.floor(Math.random() * rows) * 16, 16, 16);
    }
    const matrix = this.cameras.main.filters.internal.addColorMatrix();
    const pixelate = this.cameras.main.filters.internal.addPixelate(0);
    chip.slowStop(2800);
    const duration = 4200;
    const started = this.time.now;
    let nextSfx = 0;
    await new Promise<void>((resolve) => {
      const tick = () => {
        const t = Math.min(1, (this.time.now - started) / duration);
        this.intensity = t;
        // Corruption creeps in tile by tile (blocks are never removed, so nothing strobes).
        while (this.corruption.length < Math.floor(t * t * 70)) {
          const img = this.add.image(Math.floor(Math.random() * 15) * 16, Math.floor(Math.random() * 10) * 16, "town-tiles", `glitch-${Math.floor(Math.random() * 40)}`).setOrigin(0);
          img.setTint([0xff60c0, 0x60ffd0, 0xffffff, 0x8080ff, 0xffe040][Math.floor(Math.random() * 5)]);
          if (Math.random() < 0.3) img.setScale(1, 1 + Math.floor(Math.random() * 4)); // smeared columns
          this.corruption.push(img);
        }
        // Palette drift: a slow hue and saturation slide, never a luminance strobe.
        matrix.colorMatrix.reset();
        matrix.colorMatrix.hue(t * 160 * (calm ? 0.4 : 1));
        matrix.colorMatrix.saturate(t * 0.8, true);
        pixelate.amount = t > 0.75 ? ((t - 0.75) / 0.25) * 6 : 0;
        if (this.time.now > nextSfx && !calm) { nextSfx = this.time.now + 260 + Math.random() * 500; if (t > 0.15) chip.sfx("glitch"); }
        if (t >= 1) { this.events.off("update", tick); resolve(); }
      };
      this.events.on("update", tick);
    });
    pixelate.amount = 0;
  }

  update(_time: number, delta: number) {
    if (this.phase !== "glitch" || !this.strips.length) return;
    const calm = reducedMotion();
    // Tearing changes at most ~12 times a second, and drifts rather than jumps.
    this.stepT -= delta;
    if (this.stepT <= 0) {
      this.stepT = 80;
      const k = this.intensity;
      for (let i = 0; i < STRIPS; i++) {
        const target = calm ? 0 : (Math.random() < k * 0.6 ? (Math.random() - 0.5) * 60 * k : 0);
        this.tear[i] += (target - this.tear[i]) * 0.6;
      }
      this.split = calm ? k * 1.5 : k * 5 + Math.sin(this.time.now / 90) * k * 2;
      if (!calm && k > 0.5 && Math.random() < 0.12 && this.flashes.allow(this.time.now)) this.cameras.main.shake(120, 0.012 * k);
    }
    this.strips.forEach((row, c) => {
      const dx = (c - 1) * this.split;
      row.forEach((strip, i) => strip.setPosition(Math.round(this.tear[i] + dx), 0));
    });
  }

  // ——— Phase 2: the GBA gives up ———
  private async errorBox() {
    this.phase = "error";
    chip.stopMusic();
    chip.sfx("buzz");
    const box = new Window(this, 16, 36, 208, 88, 0xf8f8f8);
    box.setDepth(100);
    const lines = ["An error has occurred.", "POKéMON has encountered", "a TWIST."];
    const texts = lines.map((l, i) => label(this, 30, 50 + i * 16, l, "gray").setDepth(101));
    const hint = label(this, 30, 102, "Please do not turn off the power.", "small").setDepth(101);
    // The box gets its own unfiltered camera so the palette filter can't soften its text.
    const boxCam = this.cameras.add(0, 0, 240, 160).setName("error-box");
    boxCam.centerOn(120, 80);
    const boxObjects: Phaser.GameObjects.GameObject[] = [box, ...texts, hint];
    boxCam.ignore(this.children.list.filter((o) => !boxObjects.includes(o)));
    this.cameras.main.ignore(boxObjects);
    gameStore.say("An error has occurred. POKéMON has encountered a TWIST.");
    const glyphs = "#%&?!@$*0123456789ZXQ";
    const glitchText = () => {
      texts.forEach((t, i) => {
        const chars = [...lines[i]];
        if (!reducedMotion()) for (let n = 0; n < 2; n++) { const k = Math.floor(Math.random() * chars.length); if (chars[k] !== " ") chars[k] = glyphs[Math.floor(Math.random() * glyphs.length)]; }
        t.setText(chars.join(""));
      });
    };
    const timer = this.time.addEvent({ delay: 140, loop: true, callback: glitchText });
    await wait(this, 1700);
    hint.setText("Please turn off the power.");
    await wait(this, 1500);
    hint.setText("Too late.");
    chip.sfx("glitch");
    await wait(this, 900);
    timer.remove();
  }

  // ——— Phase 3: cut to black, boot GTA ———
  private async hardCut() {
    this.phase = "black";
    const boxCam = this.cameras.getCamera("error-box");
    if (boxCam) this.cameras.remove(boxCam);
    this.cameras.main.filters.internal.clear();
    this.children.removeAll(true);
    this.strips = [];
    this.cameras.main.setBackgroundColor("#000000");
    await wait(this, 900);
    // The page and the canvas switch to the 640×480 GTA screen.
    gameStore.setScreen("gta");
    this.scale.setGameSize(GTA2.width * GTA2.render, GTA2.height * GTA2.render);
    this.cameras.main.setZoom(GTA2.render).centerOn(GTA2.width / 2, GTA2.height / 2);
    await loadGtaFont();
    chip.sfx("boot");
    await wait(this, 1300);
  }

  private async frontEnd() {
    this.phase = "menu";
    this.start = false; // presses during the glitch don't count; presses from here on do
    const W = GTA2.width, H = GTA2.height;
    const calm = reducedMotion();
    // Backdrop: BROKER CITY from very high up, drifting, darkened.
    ensureCityTextures(this);
    const layout = generateCity();
    const map = this.make.tilemap({ data: layout.tiles, tileWidth: TILESET.size, tileHeight: TILESET.size });
    const tiles = map.addTilesetImage(TILESET.key, TILESET.key, TILESET.size, TILESET.size, TILESET.margin, TILESET.spacing)!;
    const ground = map.createLayer(0, tiles, 0, 0)!.setScale(0.3 / TEX);
    const span = WORLD * 0.3;
    ground.setPosition(-span * 0.25, -span * 0.3);
    if (!calm) this.tweens.add({ targets: ground, x: -span * 0.45, y: -span * 0.2, duration: 30000, ease: "Sine.easeInOut", yoyo: true, repeat: -1 });
    this.add.rectangle(0, 0, W, H, 0x000000, 0.62).setOrigin(0);
    const scan = this.add.graphics();
    scan.fillStyle(0x000000, 0.25);
    for (let y = 0; y < H; y += 3) scan.fillRect(0, y, W, 1);

    const GOLD = ["#fffbd0", "#ffe060", "#f5c518", "#e09a10", "#b86a08"];
    const pt = (x: number, y: number, value: string, style: PixelStyle) => new PixelText(this, x, y, value, { outline: "#000000", ...style });

    // Logo: an original red-and-yellow wordmark in the GTA 2 spirit, set in
    // block-scaled pixel type (no rotation, so every pixel stays square).
    const logo = this.add.container(Math.round(W * 0.36), 128);
    const banner = this.add.graphics();
    const shape = [-190, -46, 196, -56, 190, 52, -196, 60];
    const path = (dx: number) => { banner.beginPath(); banner.moveTo(shape[0] + dx, shape[1] + dx); for (let i = 2; i < 8; i += 2) banner.lineTo(shape[i] + dx, shape[i + 1] + dx); banner.closePath(); };
    banner.fillStyle(0x000000, 0.7); path(6); banner.fillPath();
    banner.fillStyle(0xd8202a, 1); path(0); banner.fillPath();
    banner.fillStyle(0xa8141c, 1); for (let y = 0; y < 60; y += 4) banner.fillRect(-180, y - 10, 360, 1);
    banner.lineStyle(4, 0xf5c518, 1); path(0); banner.strokePath();
    const top = pt(-12, -32, "GRAND THEFT", { size: 20, block: 2, fill: GOLD, shadow: "#3a0508" }).setOrigin(0.5);
    const audit = pt(-14, 18, "AUDIT", { size: 30, block: 3, fill: ["#fff6a0", "#ffe14a", "#f5b818", "#d07a10"], outline: "#3a0508", shadow: "#000000" }).setOrigin(0.5);
    const disc = this.add.circle(152, 30, 56, 0x000000);
    const discFill = this.add.circle(150, 28, 54, 0xd8202a).setStrokeStyle(4, 0xf5c518);
    const two = pt(150, 30, "2", { size: 40, block: 3, fill: GOLD, shadow: "#3a0508" }).setOrigin(0.5);
    logo.add([banner, top, audit, disc, discFill, two]);
    if (!calm) {
      // A stepped zoom-in, three frames, like an old intro.
      logo.setScale(0.33);
      this.time.delayedCall(80, () => logo.setScale(0.66));
      this.time.delayedCall(160, () => logo.setScale(1.1));
      this.time.delayedCall(240, () => logo.setScale(1));
    }
    pt(Math.round(W * 0.36), 214, "NOW WITH 100% MORE PAPERWORK", { font: "smallBold", size: 8, fill: "#ffffff" }).setOrigin(0.5).setScale(2);
    chip.play("frontend");

    // Menu panel, right: a bevelled 90s box.
    const panel = this.add.graphics();
    const mx = W - 240, my = 236, mw = 220, mh = 200;
    panel.fillStyle(0x000000, 0.85).fillRect(mx, my, mw, mh);
    panel.fillStyle(0xf5c518, 1).fillRect(mx, my, mw, 2).fillRect(mx, my + mh - 2, mw, 2).fillRect(mx, my, 2, mh).fillRect(mx + mw - 2, my, 2, mh);
    panel.fillStyle(0x6a5208, 1).fillRect(mx + 2, my + mh - 4, mw - 4, 2).fillRect(mx + mw - 4, my + 2, 2, mh - 4);
    panel.fillStyle(0xf5c518, 1).fillTriangle(mx + 14, my + 16, mx + 14, my + 32, mx + 24, my + 24);
    pt(mx + 32, my + 10, "START PLAY", { size: 30, fill: GOLD, shadow: "#2a1600" });
    pt(mx + 32, my + 46, "OPTIONS", { size: 20, fill: ["#8a8a8a", "#5a5a5a"] });
    pt(mx + 32, my + 70, "QUIT TO SPREADSHEET", { size: 20, fill: ["#8a8a8a", "#5a5a5a"] });
    pt(mx + 16, my + 106, "DISTRICT:", { font: "smallBold", size: 8, fill: "#ffffff" }).setScale(2);
    const downtown = pt(mx + 16, my + 126, "DOWNTOWN", { size: 30, fill: WHITE_BANDS });
    const strike = this.add.rectangle(mx + 14, Math.round(downtown.y + downtown.height * 0.5), 0, 4, 0xe8262b).setOrigin(0, 0.5);
    const city = pt(mx + 36, my + 160, "", { size: 30, fill: ["#d0ffff", "#3ee6ff", "#1a9ab0"] });
    const touch = typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches;
    const prompt = pt(W / 2, H - 22, touch ? "TAP TO START" : "PRESS E OR SPACE TO START", { font: "smallBold", size: 8, fill: GOLD }).setOrigin(0.5).setScale(2);
    gameStore.say("GRAND THEFT AUDIT 2. District: Downtown, now Broker City. Press E to start.");
    this.game.canvas.dataset.glitch = "menu";

    // District select: DOWNTOWN gets struck through and BROKER CITY types in.
    if (!this.start) await wait(this, 900);
    chip.sfx("cursor");
    // The strike-through draws in whole steps, not a smooth tween.
    for (let i = 1; i <= 6; i++) { strike.width = ((downtown.width + 4) * i) / 6; if (!this.start && !calm) await wait(this, 45); }
    downtown.setStyle({ fill: ["#7a7a7a", "#5a5a5a"] });
    this.add.triangle(mx + 16, city.y + 16, 0, 0, 12, 7, 0, 14, 0x3ee6ff).setOrigin(0, 0.5);
    let typed = "";
    for (const ch of "BROKER CITY") { typed += ch; city.setText(typed); if (this.start) continue; if (ch !== " ") chip.sfx("type"); await wait(this, 55); }
    // A slow 1 Hz blink on a small prompt (well inside the flash limits).
    const blink = this.time.addEvent({ delay: 500, loop: true, callback: () => prompt.setVisible(calm || !prompt.visible) });
    await new Promise<void>((resolve) => {
      const check = () => { if (this.start) { this.events.off("update", check); resolve(); } };
      this.events.on("update", check);
    });
    blink.remove();
    this.phase = "leaving";
    chip.sfx("select");
    chip.stopMusic();
    delete this.game.canvas.dataset.glitch;
    this.cameras.main.fadeOut(450, 0, 0, 0);
    await wait(this, 500);
    this.scene.start("City", { intro: true });
  }
}
