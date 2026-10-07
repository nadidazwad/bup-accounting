import { Scene } from "phaser";
import { FRLG } from "../style/frlg";
import { gameStore } from "../state/store";
import { chip } from "../audio/chip";
import { TextBox } from "../ui/TextBox";
import { Menu, UiStack, askYesNo } from "../ui/Menu";
import { label } from "../ui/text";
import { species as speciesData } from "../data/species";
import { starters, type Starter } from "../state/store";
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
    chip.play("opening");
    this.cameras.main.fadeIn(600, 0, 0, 0);
    const platform = this.add.image(120, 92, "oak-platform").setOrigin(0.5, 0.5);
    const prof = this.add.image(120, 100, "prof").setOrigin(0.5, 1).setAlpha(0);
    await tween(this, { targets: prof, alpha: 1, duration: 500 });
    await this.say("Hello there! Welcome to the world of POKéMON!");
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
    await this.say(`${finalName}! You can’t go out there alone. Take one of these POKéMON as your partner!`);
    await tween(this, { targets: [prof, platform], alpha: 0, duration: 300 });
    const starter = await this.chooseStarter();
    gameStore.chooseStarter(starter);
    await tween(this, { targets: [prof, platform], alpha: 1, duration: 300 });
    await this.say(`${speciesData[starter].name} is your partner now. It will follow you everywhere. Even to meetings.`);
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

  /** Starter choice: three partners on platforms; browse with left/right, confirm with YES. */
  private async chooseStarter(): Promise<Starter> {
    const xs = [44, 120, 196];
    const group = this.add.container(0, 0);
    const mons = starters.map((s, i) => {
      group.add(this.add.image(xs[i], 96, "oak-platform").setScale(0.75, 0.8));
      const mon = this.add.image(xs[i], 104, `front-${speciesData[s].key}`).setOrigin(0.5, 1).setAlpha(0.45);
      group.add(mon);
      return mon;
    });
    const arrow = label(this, 0, 4, "▼", "red").setOrigin(0.5, 0);
    group.add(arrow);
    group.setAlpha(0);
    await tween(this, { targets: group, alpha: 1, duration: 400 });
    let index = 0;
    for (;;) {
      const pick = await new Promise<number>((resolve) => {
        const focus = (i: number) => {
          index = (i + 3) % 3;
          mons.forEach((m, k) => m.setAlpha(k === index ? 1 : 0.45).setScale(k === index ? 1 : 0.9));
          arrow.setX(xs[index]);
          const info = speciesData[starters[index]];
          playCry(this, info.key);
          void this.textbox.show(`${info.name}, the ${info.category} POKéMON.\n${info.types.join("/")} type.`, { keepOpen: true });
        };
        focus(index);
        const release = this.ui.push({
          handle: (a) => {
            if (a === "left" || a === "right") { chip.sfx("cursor"); focus(index + (a === "left" ? -1 : 1)); }
            else if (a === "confirm") { chip.sfx("select"); release(); resolve(index); }
            return true;
          },
          pointer: (x) => {
            const i = x < 82 ? 0 : x < 158 ? 1 : 2;
            if (i === index) { chip.sfx("select"); release(); resolve(index); } else { chip.sfx("cursor"); focus(i); }
            return true;
          },
        });
      });
      const info = speciesData[starters[pick]];
      this.textbox.close();
      await this.textbox.show(`So, you want ${info.name}?`, { keepOpen: true });
      const yes = await askYesNo(this, (h) => this.ui.push(h));
      this.textbox.close();
      if (yes) {
        chip.play("caught");
        await tween(this, { targets: mons.filter((_, k) => k !== pick), alpha: 0, duration: 300 });
        await this.say(`${gameStore.getSnapshot().playerName} received ${info.name}!`);
        await tween(this, { targets: group, alpha: 0, duration: 300 });
        group.destroy();
        return starters[pick];
      }
    }
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

