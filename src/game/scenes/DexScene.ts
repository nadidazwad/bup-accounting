import { Scene, GameObjects } from "phaser";
import { gameStore } from "../state/store";
import { dexOrder, species as speciesData, typeIndex } from "../data/species";
import { chip } from "../audio/chip";
import { Window } from "../ui/Window";
import { label, wrap } from "../ui/text";
import { bindInput, playCry } from "./helpers";
import { closeOverlay } from "./menuBase";

// The BUP-DEX: only the six species in this story, with accounting entries.
export class DexScene extends Scene {
  private index = 0;
  private page: GameObjects.Container | null = null;
  private list!: GameObjects.Container;
  private preview!: GameObjects.Container;
  private from = "Overworld";
  constructor() { super("Dex"); }
  init(data: { from?: string }) { this.from = data.from ?? "Overworld"; }

  create() {
    this.index = 0; this.page = null;
    this.add.rectangle(0, 0, 240, 160, 0x404850).setOrigin(0);
    // Dot grid backdrop, like the Kanto dex screen.
    const dots = this.add.graphics().fillStyle(0x505a64);
    for (let y = 18; y < 160; y += 4) for (let x = (y / 4) % 2 ? 2 : 0; x < 240; x += 4) dots.fillRect(x, y, 1, 1);
    this.add.rectangle(0, 0, 240, 16, 0xd83828).setOrigin(0);
    this.add.rectangle(0, 15, 240, 1, 0x801810).setOrigin(0);
    label(this, 6, 0, "POKéDEX", "white");
    const s = gameStore.getSnapshot();
    label(this, 234, 1, `SEEN ${s.seen.length}  OWN ${s.party.length}`, "small-white").setOrigin(1, 0);
    new Window(this, 4, 20, 96, 112);
    this.preview = this.add.container(4, 20);
    new Window(this, 104, 20, 132, 112);
    this.list = this.add.container(104, 20);
    label(this, 8, 140, "A: ENTRY   B: BACK", "small-white");
    this.render();
    bindInput(this, (a) => this.onAction(a), (x, y) => this.onPointer(x, y));
  }

  private seen(i: number) { return gameStore.getSnapshot().seen.includes(dexOrder[i]); }

  private render() {
    const s = gameStore.getSnapshot();
    this.list.removeAll(true); this.preview.removeAll(true);
    dexOrder.forEach((mon, i) => {
      const info = speciesData[mon], y = 8 + i * 16;
      this.list.add(label(this, 18, y, `${String(info.dex).padStart(3, "0")} ${this.seen(i) ? info.name : "----------"}`));
      if (s.party.some(owned => owned === mon)) this.list.add(this.add.image(120, y + 7, "ball", 0).setScale(0.5));
    });
    this.list.add(label(this, 8, 8 + this.index * 16, "▶"));
    const mon = dexOrder[this.index], info = speciesData[mon];
    if (this.seen(this.index)) {
      this.preview.add(this.add.image(48, 74, `front-${info.key}`).setOrigin(0.5, 1));
      info.types.forEach((t, i) => this.preview.add(this.add.image(14 + i * 36, 82, "types", typeIndex[t]).setOrigin(0)));
    } else {
      this.preview.add(label(this, 48, 38, "?", "gray").setOrigin(0.5));
    }
    gameStore.say(this.seen(this.index) ? `Number ${info.dex}, ${info.name}` : `Number ${info.dex}, not seen yet`);
  }

  private onAction(action: string) {
    if (this.page) { if (["cancel", "confirm", "menu", "start"].includes(action)) this.closePage(); return; }
    if (action === "up" || action === "down") { this.index = (this.index + (action === "up" ? 5 : 1)) % 6; chip.sfx("cursor"); this.render(); }
    else if (["confirm", "start", "interact"].includes(action)) this.entry();
    else if (action === "cancel" || action === "menu") closeOverlay(this, this.from);
  }
  private onPointer(x: number, y: number) {
    if (this.page) { this.closePage(); return; }
    const i = Math.floor((y - 28) / 16);
    if (x >= 104 && i >= 0 && i < 6) { this.index = i; this.render(); this.entry(); }
  }
  private closePage() { this.page?.destroy(); this.page = null; chip.sfx("select"); }

  private entry() {
    if (!this.seen(this.index)) { chip.sfx("buzz"); return; }
    chip.sfx("select");
    const info = speciesData[dexOrder[this.index]];
    const page = this.add.container(0, 0);
    page.add(this.add.rectangle(0, 0, 240, 160, 0xf0e8d0).setOrigin(0));
    page.add(this.add.rectangle(0, 0, 240, 16, 0xd83828).setOrigin(0));
    page.add(label(this, 6, 0, `No${String(info.dex).padStart(3, "0")} ${info.name}`, "white"));
    page.add(this.add.ellipse(52, 82, 76, 16, 0xd8d0b8));
    page.add(this.add.image(52, 84, `front-${info.key}`).setOrigin(0.5, 1));
    page.add(label(this, 104, 20, `${info.category} POKéMON`, "blue"));
    page.add(label(this, 104, 38, `HT  ${info.height}`));
    page.add(label(this, 104, 54, `WT  ${info.weight}`));
    page.add(this.add.rectangle(4, 92, 232, 1, 0xb8a888).setOrigin(0));
    wrap(this, info.entry, 228, "small").slice(0, 5).forEach((line, i) => page.add(label(this, 6, 95 + i * 13, line, "small")));
    this.page = page;
    playCry(this, info.key);
    gameStore.say(`${info.name}, the ${info.category} Pokémon. ${info.entry}`);
  }
}
