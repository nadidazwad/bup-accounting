import Phaser from "phaser";
import { Scene, GameObjects } from "phaser";
import { FRLG } from "../style/frlg";
import { formatPlayTime, gameStore } from "../state/store";
import { chip } from "../audio/chip";
import { Window } from "../ui/Window";
import { label } from "../ui/text";
import { bindInput, fadeOut, markReady, reducedMotion, tween, wait } from "./helpers";

// FireRed-style title: a splash, then the box-art dragon over rising flames,
// a POKéMON wordmark, a blinking PRESS START and the main menu.
export class TitleScene extends Scene {
  private phase: "splash" | "title" | "menu" | "leaving" = "splash";
  private flames: GameObjects.Sprite[] = [];
  private press!: GameObjects.BitmapText;
  private menu: { items: { y: number; h: number }[]; index: number; cursor: GameObjects.BitmapText; frames: Window[] } | null = null;
  constructor() { super("Title"); }

  create() {
    gameStore.setScene("Title");
    this.scale.setGameSize(FRLG.width, FRLG.height);
    this.phase = "splash"; this.flames = []; this.menu = null;
    this.cameras.main.setBackgroundColor("#000000");
    if (!this.anims.exists("title-flame")) this.anims.create({ key: "title-flame", frames: this.anims.generateFrameNumbers("flames", { start: 0, end: 9 }), frameRate: 15 });
    bindInput(this, (action) => this.onAction(action), (_x, y) => this.onPointer(y));
    markReady(this);
    gameStore.say("GAME FREAK-ISH presents.");
    void this.splash();
  }

  private async splash() {
    const container = this.add.container(0, 0);
    // A shooting star crosses the dark, as in the original publisher intro.
    const star = this.add.rectangle(-10, 40, 3, 2, 0xffffff);
    const trail = this.add.graphics();
    container.add([trail, star]);
    const words = label(this, 120, 72, "GAME FREAK-ISH", "white").setOrigin(0.5).setAlpha(0);
    const presents = label(this, 120, 90, "presents", "white").setOrigin(0.5).setAlpha(0);
    container.add([words, presents]);
    if (!reducedMotion()) {
      await tween(this, {
        targets: star, x: 250, y: 64, duration: 700, ease: "Sine.easeIn",
        onUpdate: () => { trail.fillStyle(0xf8f8a0, 0.5).fillRect(Math.round(star.x) - 6, Math.round(star.y), 6, 1); },
      });
    }
    if (this.phase !== "splash") return;
    chip.sfx("sparkle");
    await tween(this, { targets: [words, presents], alpha: 1, duration: 500 });
    await wait(this, 1100);
    if (this.phase !== "splash") return;
    await tween(this, { targets: container, alpha: 0, duration: 400 });
    container.destroy();
    if (this.phase === "splash") this.showTitle();
  }

  private showTitle() {
    this.tweens.killAll();
    this.time.removeAllEvents();
    this.phase = "title";
    this.children.removeAll(true);
    // The downloaded Pokémon theme is shared with the intro and overworld.
    chip.play("opening");
    // Background: black sky fading into a deep ember red.
    const sky = this.add.graphics();
    const bands = [0x000000, 0x080000, 0x100000, 0x200408, 0x300808, 0x480c08, 0x601008, 0x781808];
    bands.forEach((c, i) => sky.fillStyle(c).fillRect(0, 60 + i * 12, 240, 12));
    sky.fillStyle(0x000000).fillRect(0, 0, 240, 60);
    const dragon = this.add.image(236, 140, "title-mon").setOrigin(1, 1).setAlpha(0).setDepth(2);
    this.tweens.add({ targets: dragon, alpha: 1, duration: 600 });
    if (!reducedMotion()) this.tweens.add({ targets: dragon, y: 138, duration: 1400, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    // Rising flames, spawned along the bottom edge.
    if (!reducedMotion()) this.time.addEvent({ delay: 90, loop: true, callback: () => this.spawnFlame() });
    // Wordmark: navy edge copies under a gold face, at an exact 2× glyph scale.
    const logo = this.add.container(10, 8).setDepth(3);
    const word = (text: string, x: number, y: number, size: number) => {
      for (const [dx, dy] of [[-2, 0], [2, 0], [0, -2], [0, 2], [-2, -2], [2, 2], [2, -2], [-2, 2], [3, 3], [4, 4]]) {
        logo.add(this.add.bitmapText(x + dx, y + dy, "frlg-edge", text, size));
      }
      logo.add(this.add.bitmapText(x, y, "frlg-gold", text, size));
    };
    word("POKEMON", 2, 6, 42);
    // The accent over the E, drawn in the same navy-edged gold at glyph scale.
    const accent = this.add.graphics();
    accent.fillStyle(0x203890).fillRect(76, 0, 12, 7);
    accent.fillStyle(0xffd828).fillRect(78, 1, 9, 3).fillRect(84, 1, 3, 5);
    logo.add(accent);
    const version = label(this, 18, 58, "BrokerRed Version", "red");
    logo.add(version);
    logo.setAlpha(0).setY(-20);
    this.tweens.add({ targets: logo, alpha: 1, y: 8, duration: 700, ease: "Back.easeOut" });
    // Gold glints pop on the wordmark's corners, like the logo sparkle in the original.
    const glints = [[16, 10], [70, 6], [118, 46], [8, 52], [96, 22]];
    let glint = 0;
    if (!reducedMotion()) this.time.addEvent({ delay: 1400, loop: true, callback: () => {
      const [gx, gy] = glints[glint++ % glints.length];
      const star = this.add.image(10 + gx, 8 + gy, "stars", "big").setDepth(4).setScale(0);
      this.tweens.add({ targets: star, scale: 1, angle: 90, duration: 260, yoyo: true, onComplete: () => star.destroy() });
    } });
    this.press = label(this, 120, 118, "PRESS START", "white").setOrigin(0.5, 0).setDepth(3);
    label(this, 120, 145, "(C)2026 GAME FREAK-ISH", "small-white").setOrigin(0.5, 0).setDepth(3);
    this.time.addEvent({ delay: 530, loop: true, callback: () => { if (this.phase === "title") this.press.setVisible(!this.press.visible); } });
    gameStore.say("POKéMON BrokerRed Version. Press Start.");
  }

  private spawnFlame() {
    if (this.phase === "leaving" || this.flames.length > 24) return;
    const x = Phaser.Math.Between(0, 240), flame = this.add.sprite(x, 168, "flames", 0).setOrigin(0.5, 1).setAlpha(0.95).setDepth(1);
    this.flames.push(flame);
    flame.play("title-flame");
    this.tweens.add({
      targets: flame, y: Phaser.Math.Between(118, 140), x: x + Phaser.Math.Between(-6, 6), duration: 660,
      onComplete: () => { flame.destroy(); this.flames = this.flames.filter((f) => f !== flame); },
    });
  }

  private onPointer(y: number) {
    if (this.phase === "menu" && this.menu) { this.menu.index = y >= 100 ? 1 : 0; this.menu.cursor.setY(this.menu.items[this.menu.index].y); }
    this.onAction("start");
  }

  private onAction(action: string) {
    if (this.phase === "splash") { if (["start", "confirm", "menu"].includes(action)) { this.phase = "title"; this.time.delayedCall(0, () => this.showTitle()); } return; }
    if (this.phase === "title" && ["start", "confirm", "menu"].includes(action)) {
      chip.sfx("select");
      if (gameStore.hasSave()) this.showMenu(); else void this.leave("Intro");
      return;
    }
    if (this.phase === "menu" && this.menu) {
      const m = this.menu;
      if (action === "up" || action === "down") {
        m.index = (m.index + (action === "up" ? -1 : 1) + m.items.length) % m.items.length; chip.sfx("cursor");
        m.cursor.setY(m.items[m.index].y);
        gameStore.say(m.index === 0 ? "Continue" : "New game");
      } else if (["confirm", "start"].includes(action)) {
        chip.sfx("select");
        // A save from after THE BROKER's defeat continues in BROKER CITY.
        if (m.index === 0 && gameStore.load()) void this.leave(gameStore.getSnapshot().flags.bossBeaten ? "City" : "Overworld");
        else { gameStore.reset(); void this.leave("Intro"); }
      } else if (["cancel", "menu"].includes(action)) {
        chip.sfx("select"); this.scene.restart();
      }
    }
  }

  private showMenu() {
    this.phase = "menu";
    this.tweens.killAll();
    this.time.removeAllEvents();
    this.children.removeAll(true); this.flames = [];
    chip.stopMusic();
    this.cameras.main.setBackgroundColor("#5878b8");
    const save = gameStore.readSave()!;
    const top = new Window(this, 8, 8, 224, 88);
    label(this, 32, 16, "CONTINUE", "blue");
    const rows: [string, string][] = [["PLAYER", save.playerName], ["TIME", formatPlayTime(save.playMs)], ["POKéDEX", String(save.seen.length)], ["BADGES", "0"]];
    rows.forEach(([k, v], i) => { label(this, 32, 32 + i * 14, k, "gray"); label(this, 200, 32 + i * 14, v, "gray").setOrigin(1, 0); });
    const bottom = new Window(this, 8, 104, 224, 32);
    label(this, 32, 112, "NEW GAME", "blue");
    const cursor = label(this, 18, 16, "▶");
    this.menu = { items: [{ y: 16, h: 88 }, { y: 112, h: 32 }], index: 0, cursor, frames: [top, bottom] };
    gameStore.say(`Continue. Player ${save.playerName}, time ${formatPlayTime(save.playMs)}, ${save.seen.length} in the POKéDEX. Or New game.`);
  }

  private async leave(next: "Intro" | "Overworld" | "City") {
    if (this.phase === "leaving") return;
    this.phase = "leaving";
    chip.stopMusic();
    await fadeOut(this, 500);
    this.scene.start(next);
  }
}
