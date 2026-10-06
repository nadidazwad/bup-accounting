import { Scene, GameObjects } from "phaser";
import { gameStore, type Species } from "../state/store";
import { species as speciesData, statsAt } from "../data/species";
import { chip } from "../audio/chip";
import { TextBox } from "../ui/TextBox";
import { label } from "../ui/text";
import { bindInput, fadeOut, playCry, reducedMotion, tween, wait } from "./helpers";

// PLAN.md §4.4 step 4: a wild-battle vignette that ends in a guaranteed catch.
// Positions follow the FRLG singles layout (opponent sprite centred on 176,40;
// the player's back pic on 72,80; messages in the bottom 48 px).
const actions = ["FIGHT", "BAG", "POKéMON", "RUN"];
const actionPos = [[136, 121], [192, 121], [136, 137], [192, 137]];

export class CatchScene extends Scene {
  private textbox!: TextBox;
  private mon: Species = "Pikachu";
  private choosing: ((i: number) => void) | null = null;
  private cursor = 0;
  private menu!: GameObjects.Container;
  private arrow!: GameObjects.BitmapText;
  constructor() { super("Catch"); }

  init(data: { species?: Species }) { this.mon = data.species ?? "Pikachu"; }

  create() {
    this.choosing = null; this.cursor = 0;
    this.cameras.main.setBackgroundColor("#000000");
    this.textbox = new TextBox(this, "battle");
    bindInput(this, (action) => this.onAction(action), (x, y) => this.onPointer(x, y));
    void this.run();
  }

  update(time: number, delta: number) { this.textbox.update(time, delta); }

  private say(text: string) { return this.textbox.show(text); }

  private onAction(action: string) {
    if (this.choosing) {
      const c = this.cursor;
      if (action === "left" || action === "right") this.cursor = c ^ 1;
      else if (action === "up" || action === "down") this.cursor = c ^ 2;
      else if (["confirm", "start", "interact"].includes(action)) { chip.sfx("select"); this.pick(c); return; }
      else return;
      chip.sfx("cursor"); this.placeArrow();
      return;
    }
    if (["confirm", "cancel", "start", "interact"].includes(action)) this.textbox.advance();
  }
  private onPointer(x: number, y: number) {
    if (this.choosing) {
      if (x >= 124 && y >= 116) { this.cursor = (y >= 134 ? 2 : 0) + (x >= 186 ? 1 : 0); this.placeArrow(); chip.sfx("select"); this.pick(this.cursor); }
      return;
    }
    this.textbox.advance();
  }
  private placeArrow() { const [x, y] = actionPos[this.cursor]; this.arrow.setPosition(x - 9, y); gameStore.say(actions[this.cursor]); }
  private pick(i: number) { const done = this.choosing; this.choosing = null; this.menu.setVisible(false); done?.(i); }

  private async run() {
    const info = speciesData[this.mon], s = gameStore.getSnapshot();
    const lead = speciesData[s.party[0] ?? "Charizard"];
    const bg = this.add.image(0, 0, "battle-bg").setOrigin(0);
    const foe = this.add.image(-40, 72, `front-${info.key}`).setOrigin(0.5, 1);
    const trainer = this.add.sprite(300, 112, "red-back", 0).setOrigin(0.5, 1);
    this.textbox.setDepth(100);
    // Opening: the foe slides in from the left as the trainer slides in from the right.
    const slide = reducedMotion() ? 1 : 900;
    bg.setAlpha(0);
    await tween(this, { targets: bg, alpha: 1, duration: reducedMotion() ? 1 : 200 });
    await Promise.all([
      tween(this, { targets: foe, x: 176, duration: slide, ease: "Linear" }),
      tween(this, { targets: trainer, x: 72, duration: slide, ease: "Linear" }),
    ]);
    playCry(this, info.key);
    const box = this.healthbox(info.name, info.gender, statsAt(info).hp);
    box.setX(-110);
    void tween(this, { targets: box, x: 13, duration: reducedMotion() ? 1 : 300 });
    await this.say(`Wild ${info.name} appeared!`);
    await this.say(`${info.name} wants to join BUP ACCOUNTING! It brought a résumé and three references.`);
    gameStore.markSeen(this.mon);
    this.buildMenu(s.playerName);
    for (;;) {
      const choice = await this.choose(s.playerName);
      if (choice === 1) break;
      if (choice === 0) await this.say(`${lead.name} doesn’t want to battle a future coworker!`);
      if (choice === 2) await this.say(`${lead.name} gave ${info.name} an encouraging thumbs-up.`);
      if (choice === 3) await this.say(`Can’t escape! ${info.name} already submitted its timesheet.`);
    }
    gameStore.useItem("POKE_BALL");
    await this.say(`${s.playerName} used POKé BALL!`);
    await this.throwBall(trainer, foe);
    chip.play("caught");
    await this.say(`Gotcha! ${info.name} was caught!`);
    await wait(this, Math.max(0, chip.duration("caught") * 1000 - 1600));
    await this.say(`${info.name}’s data was added to the POKéDEX.`);
    await this.say(`${info.name} joined your team! Welcome aboard, junior associate.`);
    await fadeOut(this, 500);
    this.game.events.emit("catch-done");
    this.scene.resume("Overworld");
    this.scene.stop();
  }

  private healthbox(name: string, gender: string, hp: number) {
    // Drawn to the FRLG opponent box: cream panel, dark frame, HP tag and bar.
    const c = this.add.container(13, 16).setDepth(50);
    const g = this.add.graphics();
    g.fillStyle(0x506858).fillRoundedRect(4, 3, 100, 29, 4);
    g.fillStyle(0xf8f8d8).fillRoundedRect(0, 0, 100, 29, 4);
    g.lineStyle(1, 0x304040).strokeRoundedRect(0, 0, 100, 29, 4);
    g.fillStyle(0x485058).fillRect(30, 19, 64, 5);
    g.fillStyle(0xf8b030).fillRect(18, 19, 14, 5);
    g.fillStyle(0x70f8a8).fillRect(32, 20, 61, 3);
    c.add(g);
    c.add(label(this, 6, 1, `${name}${gender}`));
    c.add(label(this, 68, 2, `Lv${speciesData[this.mon].level}`, "small"));
    c.add(label(this, 19, 15, "HP", "small-white"));
    void hp;
    return c;
  }

  private buildMenu(name: string) {
    this.menu = this.add.container(0, 0).setDepth(120).setVisible(false);
    this.menu.add(this.add.image(0, 112, "battle-box").setOrigin(0).setCrop(0, 48, 240, 48).setY(64));
    this.menu.add(label(this, 11, 121, "What will", "white"));
    this.menu.add(label(this, 11, 137, `${name} do?`, "white"));
    actions.forEach((a, i) => this.menu.add(label(this, actionPos[i][0], actionPos[i][1], a)));
    this.arrow = label(this, 0, 0, "▶");
    this.menu.add(this.arrow);
  }

  private choose(name: string) {
    this.textbox.close();
    this.menu.setVisible(true); this.placeArrow();
    gameStore.say(`What will ${name} do? Fight, Bag, Pokémon or Run.`);
    return new Promise<number>((resolve) => { this.choosing = resolve; });
  }

  private async throwBall(trainer: GameObjects.Sprite, foe: GameObjects.Image) {
    // Native throw frames: wind-up, swing, release.
    for (const frame of [1, 2, 3, 4]) { trainer.setFrame(frame); await wait(this, 70); }
    chip.sfx("throw");
    const ball = this.add.sprite(88, 70, "ball", 0).setDepth(60);
    const arc = { t: 0 };
    await tween(this, {
      targets: arc, t: 1, duration: 520,
      onUpdate: () => {
        const t = arc.t;
        ball.setPosition(Math.round(88 + (176 - 88) * t), Math.round(70 + (36 - 70) * t - Math.sin(t * Math.PI) * 44));
        ball.setAngle(t * 720);
      },
    });
    void tween(this, { targets: trainer, x: -60, duration: 500, ease: "Quad.easeIn" });
    ball.setAngle(0);
    chip.sfx("ballOpen");
    const burst = this.add.circle(176, 40, 6, 0xffffff).setDepth(55);
    void tween(this, { targets: burst, radius: 34, alpha: 0, duration: 320 });
    await tween(this, { targets: foe, scaleX: 0, scaleY: 0, y: 40, alpha: 0.4, duration: 300, ease: "Quad.easeIn" });
    foe.setVisible(false); burst.destroy();
    await wait(this, 200);
    // Drop to the ground with two bounces.
    await tween(this, { targets: ball, y: 64, duration: 260, ease: "Bounce.easeOut" });
    await wait(this, 450);
    for (let i = 0; i < 3; i++) {
      chip.sfx("wobble");
      await tween(this, { targets: ball, angle: i % 2 ? 22 : -22, duration: 110, yoyo: true, ease: "Sine.easeInOut" });
      await wait(this, 520);
    }
    chip.sfx("click");
    ball.setFrame(1);
    for (const [dx, dy] of [[-18, -14], [0, -20], [18, -14]]) {
      const star = this.add.image(176, 60, "stars", "small").setDepth(70);
      void tween(this, { targets: star, x: 176 + dx, y: 60 + dy, alpha: 0, duration: 500, ease: "Quad.easeOut" }).then(() => star.destroy());
    }
    chip.sfx("sparkle");
    await wait(this, 400);
  }
}

