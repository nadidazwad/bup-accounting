import Phaser from "phaser";
import { gameStore } from "../state/store";
import { REGISTRATION_URL } from "../links";
import { chip } from "../audio/chip";
import { GTA2, loadGtaFont } from "../style/gta2";
import { PixelText, wrapPixel, type PixelStyle } from "../ui/pixelText";
import { bindInput, markReady, reducedMotion, wait } from "./helpers";

// After the city: a GTA 2 mission briefing. THE BROKER calls on the pager
// line, a portrait on the left, typewriter text on the right, then the offer:
// the next level. YES goes to the real event registration page.
const W = GTA2.width, H = GTA2.height;
const GOLD = ["#fffbd0", "#ffe060", "#f5c518", "#e09a10", "#b86a08"];
const GREY = ["#9a9a9a", "#6a6a6a"];
const noLines = [
  "WRONG ANSWER. THE BROKER DOESN'T TAKE NO FOR AN ANSWER.",
  "THAT'S NOT HOW NEGOTIATIONS WORK, KID.",
  "\"NO\" IS NOT A VALID LEDGER ENTRY. TRY AGAIN.",
  "I'LL PRETEND I DIDN'T HEAR THAT. ONE MORE TIME.",
];

export class FinaleScene extends Phaser.Scene {
  private choice = 0;
  private asking = false;
  private noCount = 0;
  private skip = false;
  constructor() { super("Finale"); }

  init() { this.choice = 0; this.asking = false; this.noCount = 0; this.skip = false; }

  create(stats?: { score?: number; victims?: number }) {
    gameStore.setScene("Finale");
    this.scale.setGameSize(W * GTA2.render, H * GTA2.render);
    this.cameras.main.setZoom(GTA2.render).centerOn(W / 2, H / 2).setBackgroundColor("#000000");
    void loadGtaFont().then(() => { if (this.sys.isActive()) void this.brief(stats ?? {}); });
  }

  private async brief(stats: { score?: number; victims?: number }) {
    const calm = reducedMotion();
    const pt = (x: number, y: number, value: string, style: PixelStyle) => new PixelText(this, x, y, value, { outline: "#000000", ...style });

    // Scanlines and a header strip, like the GTA 2 briefing phone screen.
    const bg = this.add.graphics();
    bg.fillStyle(0x0c0c0e, 1).fillRect(0, 0, W, H);
    bg.fillStyle(0x000000, 0.35);
    for (let y = 0; y < H; y += 3) bg.fillRect(0, y, W, 1);
    bg.fillStyle(0x16140c, 1).fillRect(0, 0, W, 40);
    bg.fillStyle(0xf5c518, 1).fillRect(0, 40, W, 2);
    bg.fillStyle(0x6a5208, 1).fillRect(0, 42, W, 1);
    pt(16, 4, "INCOMING CALL", { size: 30, fill: GOLD, shadow: "#2a1600" });
    pt(W - 16, 14, "BROKER-COM  ENCRYPTED", { font: "smallBold", size: 8, fill: "#8a8a8a" }).setOrigin(1, 0).setScale(2);

    // Portrait: THE BROKER's FRLG picture, tinted like an old video phone.
    const frame = this.add.graphics();
    frame.fillStyle(0x000000, 1).fillRect(26, 74, 204, 238);
    frame.fillStyle(0xf5c518, 1).fillRect(28, 76, 200, 2).fillRect(28, 308, 200, 2).fillRect(28, 76, 2, 234).fillRect(226, 76, 2, 234);
    frame.fillStyle(0x10301c, 1).fillRect(34, 84, 188, 188);
    const portrait = this.add.image(128, 178, "broker-front").setScale(3).setTint(0xb8ffcc);
    const lines = this.add.graphics();
    lines.fillStyle(0x000000, 0.28);
    for (let y = 84; y < 272; y += 2) lines.fillRect(34, y, 188, 1);
    pt(128, 278, "THE BROKER", { size: 20, fill: GOLD }).setOrigin(0.5, 0);
    // A 2-frame idle bob on a timer, not a smooth tween.
    if (!calm) this.time.addEvent({ delay: 700, loop: true, callback: () => portrait.setY(portrait.y === 178 ? 176 : 178) });

    const victims = stats.victims ?? gameStore.getSnapshot().kills;
    const score = stats.score ?? 0;
    const stat = { font: "smallBold" as const, size: 8, fill: "#ffffff" };
    pt(28, 330, `VICTIMS: ${victims}`, stat).setScale(2);
    pt(28, 352, `SCORE: $${score.toLocaleString("en-US")}`, stat).setScale(2);
    pt(28, 374, "COPS ON YOUR TAIL: 5", stat).setScale(2);

    chip.play("briefing");
    bindInput(this, (action) => this.onAction(action), (x, y) => this.onTap(x / GTA2.render, y / GTA2.render));
    markReady(this);

    // Typewriter briefing with a pager beep per line. Any key skips ahead.
    const script = [
      `Well, well. ${victims} victims and five cops on your tail. My accountant is weeping.`,
      "You did good, kid. Pokemon. Cars. Cops. Child's play.",
      "But that was just the warm-up. The real game is the NEXT LEVEL.",
    ];
    const bodyStyle: PixelStyle = { font: "small", size: 8, fill: "#ececec" };
    const typed: PixelText[] = [];
    let y = 80;
    for (const line of script) {
      chip.sfx("pager");
      gameStore.say(`THE BROKER: ${line}`);
      for (const row of wrapPixel(line, bodyStyle, W - 276, 2)) {
        const t = pt(252, y, "", bodyStyle).setScale(2);
        typed.push(t);
        for (let i = 1; i <= row.length; i++) {
          t.setText(row.slice(0, i));
          if (!this.skip) { if (row[i - 1] !== " " && i % 2) chip.sfx("type"); await wait(this, 26); }
        }
        y += 20;
      }
      y += 14;
      if (!this.skip) await wait(this, 500);
    }
    await wait(this, 500);
    typed.forEach((t) => t.destroy());
    await this.offer(pt);
  }

  private yes!: PixelText;
  private no!: PixelText;
  private reply!: PixelText;
  private cursor!: Phaser.GameObjects.Triangle;

  private async offer(pt: (x: number, y: number, value: string, style: PixelStyle) => PixelText) {
    const cx = Math.round(252 + (W - 280) / 2);
    const question = pt(cx, 160, "READY FOR THE\nNEXT LEVEL?", { size: 30, block: 2, fill: GOLD, shadow: "#2a1600" }).setOrigin(0.5);
    if (!reducedMotion()) {
      // Slams in over three stepped frames, then a short shake.
      question.setScale(2);
      await wait(this, 60); question.setScale(1.5);
      await wait(this, 60); question.setScale(1);
      this.cameras.main.shake(180, 0.006);
    }
    chip.sfx("crash");
    this.yes = pt(cx - 70, 278, "YES", { size: 40, fill: GOLD, shadow: "#2a1600" }).setOrigin(0.5);
    this.no = pt(cx + 70, 278, "NO", { size: 40, fill: GREY, shadow: "#000000" }).setOrigin(0.5);
    this.cursor = this.add.triangle(0, 278, 0, 0, 14, 9, 0, 18, 0xf5c518).setOrigin(0, 0.5).setStrokeStyle(2, 0x000000);
    this.reply = pt(cx, 340, "", { font: "smallBold", size: 8, fill: ["#ffc0e0", "#ff3ea5"] }).setOrigin(0.5, 0).setScale(2);
    this.asking = true;
    this.render();
    gameStore.say("THE BROKER: Ready for the next level? Yes or no.");
    this.game.canvas.dataset.finale = "asking";
  }

  private render() {
    if (!this.yes) return;
    this.yes.setStyle({ fill: this.choice === 0 ? GOLD : GREY });
    this.no.setStyle({ fill: this.choice === 1 ? GOLD : GREY });
    const target = this.choice === 0 ? this.yes : this.no;
    this.cursor.setX(Math.round(target.x - target.width / 2 - 22));
  }

  private onAction(action: string) {
    if (!this.asking) { if (action === "confirm") this.skip = true; return; }
    if (["left", "right", "up", "down"].includes(action)) { this.choice ^= 1; chip.sfx("cursor"); this.render(); }
    else if (action === "confirm" || action === "interact") void this.choose();
  }

  private onTap(x: number, y: number) {
    if (!this.asking) { this.skip = true; return; }
    if (y < 250 || y > 310 || x < 252) return;
    this.choice = x < 252 + (W - 280) / 2 ? 0 : 1;
    this.render();
    void this.choose();
  }

  private async choose() {
    if (!this.asking) return;
    if (this.choice === 0) {
      this.asking = false;
      chip.sfx("cash");
      this.reply.setStyle({ fill: ["#d0ffff", "#3ee6ff"] }).setText("SEE YOU THERE, KID.");
      gameStore.say("THE BROKER: See you there, kid. Opening the next level.");
      this.game.canvas.dataset.finale = "accepted";
      await wait(this, 700);
      chip.stopMusic();
      window.location.assign(REGISTRATION_URL);
      return;
    }
    chip.sfx("buzz");
    const line = noLines[this.noCount++ % noLines.length];
    this.reply.setStyle({ fill: ["#ffc0e0", "#ff3ea5"] }).setText(wrapPixel(line, { font: "smallBold", size: 8 }, W - 290, 2).join("\n"));
    gameStore.say(`THE BROKER: ${line} Ready for the next level?`);
    this.choice = 0;
    this.render();
  }
}
