import { Scene } from "phaser";
import { FRLG } from "../style/frlg";
import { gameStore } from "../state/store";
import { chip } from "../audio/chip";
import { TextBox } from "../ui/TextBox";
import { Menu, UiStack } from "../ui/Menu";
import { bindInput, fadeOut, markReady, playCry, reducedMotion, tween, wait } from "./helpers";

// PROF. LEDGER's speech, following the beats of the FRLG Oak intro.
export class IntroScene extends Scene {
  private textbox!: TextBox;
  private ui = new UiStack();
  constructor() { super("Intro"); }

  create() {
    gameStore.setScene("Intro");
    this.scale.setGameSize(FRLG.width, FRLG.height);
    this.ui = new UiStack();
    this.add.image(0, 0, "oak-bg").setOrigin(0);
    this.textbox = new TextBox(this);
    bindInput(this, (action) => {
      if (this.ui.handle(action)) return;
      if (["confirm", "start", "cancel", "interact"].includes(action)) this.textbox.advance();
    }, (x, y) => { if (!this.ui.pointer(x, y)) this.textbox.advance(); });
    markReady(this);
    void this.run();
  }

  update(time: number, delta: number) { this.textbox.update(time, delta); }

  private say(text: string, keepOpen = false) { return this.textbox.show(text, { keepOpen }); }

  private async run() {
    chip.play("route");
    this.cameras.main.fadeIn(600, 0, 0, 0);
    const platform = this.add.image(120, 92, "oak-platform").setOrigin(0.5, 0.5);
    const prof = this.add.image(120, 100, "prof").setOrigin(0.5, 1).setAlpha(0);
    await tween(this, { targets: prof, alpha: 1, duration: 500 });
    await this.say("Hello there! Welcome to the world of BUP ACCOUNTING!");
    await this.say("My name is LEDGER. People affectionately call me the AUDIT PROFESSOR.");
    // The professor steps aside and sends out a POKéMON, as Oak does with NIDORAN♀.
    const side = this.add.image(176, 100, "oak-platform").setOrigin(0.5, 0.5).setAlpha(0).setScale(0.75, 1);
    await Promise.all([
      tween(this, { targets: [prof, platform], x: 72, duration: 500, ease: "Sine.easeInOut" }),
      tween(this, { targets: side, alpha: 1, duration: 500 }),
    ]);
    const ball = this.add.sprite(176, 50, "ball", 0);
    chip.sfx("throw");
    await tween(this, { targets: ball, y: 92, duration: 380, ease: "Bounce.easeOut" });
    chip.sfx("ballOpen");
    const burst = this.add.circle(176, 88, 4, 0xffffff);
    ball.destroy();
    const mon = this.add.image(176, 108, "front-pikachu").setOrigin(0.5, 1).setScale(0);
    await Promise.all([
      tween(this, { targets: burst, radius: 26, alpha: 0, duration: 300 }),
      tween(this, { targets: mon, scale: 1, duration: 300, ease: "Back.easeOut" }),
    ]);
    burst.destroy();
    playCry(this, "pikachu");
    await this.say("This world is inhabited far and wide by creatures called POKéMON…");
    await this.say("…and by people who file their taxes on time.");
    await this.say("For some people, POKéMON are pets. Others use them for battling. As for myself…");
    await this.say("I reconcile ledgers with them. PIKACHU is excellent at catching rounding errors.");
    chip.sfx("shrink");
    await tween(this, { targets: mon, scale: 0, duration: 260 });
    await Promise.all([
      tween(this, { targets: [prof, platform], x: 120, duration: 500, ease: "Sine.easeInOut" }),
      tween(this, { targets: side, alpha: 0, duration: 300 }),
    ]);
    await tween(this, { targets: prof, alpha: 0, duration: 400 });
    const red = this.add.image(120, 104, "red-full").setOrigin(0.5, 1).setAlpha(0);
    await tween(this, { targets: red, alpha: 1, duration: 400 });
    const name = await this.askName();
    gameStore.setPlayerName(name);
    const finalName = gameStore.getSnapshot().playerName;
    await this.say(`Right… So your name is ${finalName}.`);
    await tween(this, { targets: red, alpha: 0, duration: 400 });
    await tween(this, { targets: prof, alpha: 1, duration: 400 });
    await this.say(`${finalName}! Your very own POKéMON legend is about to unfold!`);
    await this.say("A world of dreams and adventures with POKéMON awaits! Let’s go!");
    await this.say("…Please keep your receipts.");
    await tween(this, { targets: prof, alpha: 0, duration: 300 });
    platform.setVisible(false);
    // The shrink-into-the-world animation: the player pic dwindles to a sprite.
    red.setAlpha(1).setY(110);
    chip.sfx("shrink");
    if (!reducedMotion()) await tween(this, { targets: red, scale: 0.25, y: 92, duration: 900, ease: "Sine.easeIn" });
    await wait(this, 200);
    chip.stopMusic();
    await fadeOut(this, 600);
    this.scene.start("Overworld");
  }

  private async askName() {
    await this.say("Let’s begin with your name. What is it?", true);
    const presets = ["NEW NAME", "RED", "DEBIT", "CREDIT", "AUDIT"];
    const choice = await new Promise<number>((resolve) => {
      let release = () => {};
      const menu = new Menu(this, { x: 136, y: 8, width: 96, items: presets, onSelect: (i) => { release(); menu.destroy(); resolve(i); } });
      release = this.ui.push({ handle: (a) => menu.handle(a), pointer: (x, y) => menu.pointer(x, y) });
    });
    this.textbox.close();
    if (choice > 0) return presets[choice];
    return new Promise<string>((resolve) => {
      this.game.events.once("naming-done", (value: string) => resolve(value));
      this.scene.launch("Naming");
      this.scene.pause();
    });
  }
}

