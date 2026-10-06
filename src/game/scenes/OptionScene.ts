import { Scene, GameObjects } from "phaser";
import { gameStore, type TextSpeed } from "../state/store";
import { chip } from "../audio/chip";
import { Window } from "../ui/Window";
import { label } from "../ui/text";
import { bindInput } from "./helpers";
import { closeOverlay } from "./menuBase";

// FRLG OPTION screen: the chosen value is red, the rest gray; left/right change it.
const speeds: TextSpeed[] = ["slow", "mid", "fast"];
export class OptionScene extends Scene {
  private index = 0;
  private body!: GameObjects.Container;
  private from = "Overworld";
  constructor() { super("Option"); }
  init(data: { from?: string }) { this.from = data.from ?? "Overworld"; }

  create() {
    this.index = 0;
    this.add.rectangle(0, 0, 240, 160, 0x5878b8).setOrigin(0);
    new Window(this, 8, 4, 224, 24);
    label(this, 16, 9, "OPTION");
    new Window(this, 8, 32, 224, 96);
    this.body = this.add.container(0, 0);
    new Window(this, 8, 128, 224, 28);
    label(this, 16, 134, "←/→ change   A/B close", "small");
    this.render();
    bindInput(this, (a) => this.onAction(a), (x, y) => this.onPointer(x, y));
  }

  private rows() {
    const s = gameStore.getSnapshot().settings;
    return [
      { name: "TEXT SPEED", values: ["SLOW", "MID", "FAST"], at: speeds.indexOf(s.textSpeed) },
      { name: "SOUND", values: ["ON", "OFF"], at: s.muted ? 1 : 0 },
      { name: "CRT SCREEN", values: ["OFF", "ON"], at: s.crt ? 1 : 0 },
      { name: "CANCEL", values: [], at: 0 },
    ];
  }

  private render() {
    this.body.removeAll(true);
    this.rows().forEach((row, i) => {
      const y = 40 + i * 20;
      this.body.add(label(this, 26, y, row.name));
      row.values.forEach((v, j) => this.body.add(label(this, 112 + j * 40, y, v, j === row.at ? "red" : "gray")));
    });
    this.body.add(label(this, 16, 40 + this.index * 20, "▶"));
    const row = this.rows()[this.index];
    gameStore.say(row.values.length ? `${row.name}: ${row.values[row.at]}` : "Cancel");
  }

  private change(delta: number) {
    const s = gameStore.getSnapshot().settings;
    if (this.index === 0) gameStore.setSettings({ textSpeed: speeds[Math.max(0, Math.min(2, speeds.indexOf(s.textSpeed) + delta))] });
    else if (this.index === 1) gameStore.setSettings({ muted: delta > 0 });
    else if (this.index === 2) gameStore.setSettings({ crt: delta > 0 });
    else return;
    chip.sfx("cursor"); this.render();
  }

  private onAction(action: string) {
    if (action === "up" || action === "down") { this.index = (this.index + (action === "up" ? 3 : 1)) % 4; chip.sfx("cursor"); this.render(); }
    else if (action === "left") this.change(-1);
    else if (action === "right") this.change(1);
    else if (["cancel", "menu"].includes(action) || (["confirm", "start"].includes(action) && this.index === 3)) closeOverlay(this, this.from);
    else if (action === "confirm") this.change(this.index === 0 ? 1 : this.rows()[this.index].at === 0 ? 1 : -1);
  }

  private onPointer(x: number, y: number) {
    const i = Math.floor((y - 38) / 20);
    if (i < 0 || i > 3) return;
    this.index = i;
    if (i === 3) { closeOverlay(this, this.from); return; }
    const value = Math.floor((x - 108) / 40);
    const row = this.rows()[i];
    if (value >= 0 && value < row.values.length) this.change(value - row.at);
    this.render();
  }
}
