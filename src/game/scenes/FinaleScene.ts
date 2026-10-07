import Phaser from "phaser";
import { gameStore } from "../state/store";
import { REGISTRATION_URL } from "../links";
import { chip } from "../audio/chip";
import { GTA2, gtaFontFamily, loadGtaFont } from "../style/gta2";
import { bindInput, markReady, reducedMotion, wait } from "./helpers";

// After the city: a GTA 2 mission briefing. THE BROKER calls on the pager
// line, a portrait on the left, typewriter text on the right, then the offer:
// the next level. YES goes to the real event registration page.
const W = GTA2.width, H = GTA2.height;
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
    const font = gtaFontFamily();
    const calm = reducedMotion();
    const text = (x: number, y: number, value: string, size: number, color = "#ffffff", stroke = 4) =>
      this.add.text(x, y, value, { fontFamily: font, fontSize: `${size}px`, color, stroke: "#000000", strokeThickness: stroke, resolution: GTA2.render });

    // Scanlines and a header strip, like the GTA 2 briefing phone screen.
    const bg = this.add.graphics();
    bg.fillStyle(0x0c0c0e, 1).fillRect(0, 0, W, H);
    bg.fillStyle(0x000000, 0.35);
    for (let y = 0; y < H; y += 3) bg.fillRect(0, y, W, 1);
    bg.fillStyle(0x16140c, 1).fillRect(0, 0, W, 44);
    bg.lineStyle(2, 0xf5c518, 1).lineBetween(0, 44, W, 44);
    text(20, 8, "INCOMING CALL", 22, GTA2.palette.hudGold);
    text(W - 20, 12, "BROKER-COM · ENCRYPTED", 15, "#7a7a7a", 3).setOrigin(1, 0);

    // Portrait: THE BROKER's FRLG picture, tinted like an old video phone.
    const frame = this.add.graphics();
    frame.fillStyle(0x000000, 1).fillRect(28, 78, 200, 232);
    frame.lineStyle(3, 0xf5c518, 1).strokeRect(28, 78, 200, 232);
    frame.fillStyle(0x10301c, 1).fillRect(34, 84, 188, 188);
    const portrait = this.add.image(128, 178, "broker-front").setScale(2.8).setTint(0xb8ffcc);
    const lines = this.add.graphics();
    lines.fillStyle(0x000000, 0.25);
    for (let y = 84; y < 272; y += 2) lines.fillRect(34, y, 188, 1);
    text(128, 280, "THE BROKER", 22, GTA2.palette.hudGold).setOrigin(0.5, 0);
    if (!calm) this.tweens.add({ targets: portrait, y: 176, duration: 1400, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });

    const victims = stats.victims ?? gameStore.getSnapshot().kills;
    const score = stats.score ?? 0;
    text(28, 330, `VICTIMS: ${victims}`, 18);
    text(28, 354, `SCORE: $${score.toLocaleString("en-US")}`, 18);
    text(28, 378, "COPS ON YOUR TAIL: 5", 18);

    chip.play("briefing");
    bindInput(this, (action) => this.onAction(action), (x, y) => this.onTap(x / GTA2.render, y / GTA2.render));
    markReady(this);

    // Typewriter briefing with a pager beep per line. Any key skips ahead.
    const body = text(252, 78, "", 23, "#ffffff", 3).setWordWrapWidth(W - 280).setLineSpacing(6);
    const script = [
      `Well, well. ${victims} victims and five cops on your tail. My accountant is weeping.`,
      "You did good, kid. Pokémon. Cars. Cops. Child's play.",
      "But that was just the warm-up. The real game is the NEXT LEVEL.",
    ];
    let shown = "";
    for (const line of script) {
      chip.sfx("pager");
      gameStore.say(`THE BROKER: ${line}`);
      for (const ch of line) {
        shown += ch; body.setText(shown);
        if (!this.skip) { if (ch !== " ") chip.sfx("type"); await wait(this, 28); }
      }
      shown += "\n\n"; body.setText(shown);
      if (!this.skip) await wait(this, 500);
    }
    await wait(this, 400);
    this.tweens.add({ targets: body, alpha: 0, duration: 250 });
    await wait(this, 260);
    body.setVisible(false);
    await this.offer(text);
  }

  private yes!: Phaser.GameObjects.Text;
  private no!: Phaser.GameObjects.Text;
  private reply!: Phaser.GameObjects.Text;

  private async offer(text: (x: number, y: number, value: string, size: number, color?: string, stroke?: number) => Phaser.GameObjects.Text) {
    const cx = 252 + (W - 280) / 2;
    const question = text(cx, 170, "READY FOR THE\nNEXT LEVEL?", 46, GTA2.palette.hudGold, 7).setOrigin(0.5).setAlign("center");
    if (!reducedMotion()) {
      question.setScale(2.4).setAlpha(0);
      this.tweens.add({ targets: question, scale: 1, alpha: 1, duration: 280, ease: "Back.easeOut" });
      await wait(this, 260);
      this.cameras.main.shake(180, 0.006);
    }
    chip.sfx("crash");
    this.yes = text(cx - 70, 278, "YES", 38, GTA2.palette.hudGold, 6).setOrigin(0.5);
    this.no = text(cx + 70, 278, "NO", 38, "#7a7a7a", 6).setOrigin(0.5);
    this.reply = text(cx, 350, "", 19, "#ff3ea5", 3).setOrigin(0.5, 0).setAlign("center").setWordWrapWidth(W - 300);
    this.asking = true;
    this.render();
    gameStore.say("THE BROKER: Ready for the next level? Yes or no.");
    this.game.canvas.dataset.finale = "asking";
  }

  private render() {
    if (!this.yes) return;
    this.yes.setText(this.choice === 0 ? "▶ YES" : "YES").setColor(this.choice === 0 ? GTA2.palette.hudGold : "#7a7a7a");
    this.no.setText(this.choice === 1 ? "▶ NO" : "NO").setColor(this.choice === 1 ? GTA2.palette.hudGold : "#7a7a7a");
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
      this.reply.setText("SEE YOU THERE, KID.").setColor("#3ee6ff");
      gameStore.say("THE BROKER: See you there, kid. Opening the next level.");
      this.game.canvas.dataset.finale = "accepted";
      await wait(this, 700);
      chip.stopMusic();
      window.location.assign(REGISTRATION_URL);
      return;
    }
    chip.sfx("buzz");
    const line = noLines[this.noCount++ % noLines.length];
    this.reply.setText(line).setColor("#ff3ea5");
    gameStore.say(`THE BROKER: ${line} Ready for the next level?`);
    this.choice = 0;
    this.render();
  }
}
