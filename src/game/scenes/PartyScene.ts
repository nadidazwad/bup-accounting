import { Scene, GameObjects } from "phaser";
import { gameStore, type Species } from "../state/store";
import { species as speciesData, statsAt, typeIndex } from "../data/species";
import { moves } from "../battle/moves";
import { chip } from "../audio/chip";
import { Menu, UiStack } from "../ui/Menu";
import { Window } from "../ui/Window";
import { label } from "../ui/text";
import { bindInput, playCry } from "./helpers";
import { closeOverlay, hpColors } from "./menuBase";

// FRLG party screen: native background and slot boxes (bg.bin, slot_main.bin,
// slot_wide.bin) at their window-template positions.
const slotPos = (i: number) => (i === 0 ? { x: 8, y: 24 } : { x: 96, y: 8 + (i - 1) * 24 });
const CANCEL = 6;

export class PartyScene extends Scene {
  private index = 0;
  private swapFrom: number | null = null;
  private layer!: GameObjects.Container;
  private message!: GameObjects.BitmapText;
  private icons: GameObjects.Sprite[] = [];
  private ui = new UiStack();
  private from = "Overworld";
  constructor() { super("Party"); }
  init(data: { from?: string }) { this.from = data.from ?? "Overworld"; }

  create() {
    this.index = 0; this.swapFrom = null; this.ui = new UiStack(); this.icons = [];
    this.add.image(0, 0, "party-bg").setOrigin(0);
    this.layer = this.add.container(0, 0);
    const msg = new Window(this, 0, 128, 176, 32);
    this.message = label(this, 8, 8, "");
    msg.add(this.message);
    this.render();
    bindInput(this, (a) => this.onAction(a), (x, y) => this.onPointer(x, y));
    // Icons bob like the native party menu: the selected one faster.
    this.time.addEvent({ delay: 160, loop: true, callback: () => this.icons.forEach((icon, i) => {
      if (i === this.index || this.time.now % 640 < 320) icon.setFrame(icon.frame.name === "0" ? 1 : 0);
    }) });
  }

  private get party() { return gameStore.getSnapshot().party; }

  private render() {
    this.layer.removeAll(true); this.icons = [];
    const party = this.party;
    for (let i = 0; i < 6; i++) {
      const { x, y } = slotPos(i);
      const palette = this.swapFrom === i ? 2 : this.index === i ? 1 : 0;
      const mon = party[i];
      if (i === 0) this.layer.add(this.add.image(x, y, "party-slots").setOrigin(0).setCrop(0, palette * 56, 80, 56).setY(y - palette * 56));
      else this.layer.add(this.add.image(x - 80, y, "party-slots").setOrigin(0).setCrop(80, palette * 56 + (mon ? 0 : 28), 144, 24).setY(y - palette * 56 - (mon ? 0 : 28)));
      if (!mon) continue;
      const info = speciesData[mon], hp = statsAt(info).hp;
      const iconX = i === 0 ? x + 18 : x + 14, iconY = i === 0 ? y + 22 : y + 10;
      if (i === 0) this.layer.add(this.add.sprite(x - 2, y - 6, "party-ball", this.index === 0 ? 1 : 0).setOrigin(0));
      const icon = this.add.sprite(iconX, iconY, `icon-${info.key}`, 0);
      this.icons.push(icon); this.layer.add(icon);
      const tx = i === 0 ? x + 32 : x + 30;
      this.layer.add(label(this, i === 0 ? x + 24 : tx, i === 0 ? y + 4 : y - 1, info.name, "white"));
      this.layer.add(label(this, i === 0 ? x + 40 : tx + 8, i === 0 ? y + 20 : y + 11, `Lv${info.level} ${info.gender}`, "small-white"));
      const bar = i === 0 ? { x: x + 24, y: y + 35 } : { x: x + 88, y: y + 10 };
      const [light, dark] = hpColors(1);
      const g = this.add.graphics();
      g.fillStyle(light).fillRect(bar.x, bar.y, 48, 2); g.fillStyle(dark).fillRect(bar.x, bar.y + 2, 48, 1);
      this.layer.add(g);
      this.layer.add(label(this, i === 0 ? x + 74 : x + 136, i === 0 ? y + 38 : y + 11, `${hp}/ ${hp}`, "small-white").setOrigin(1, 0));
    }
    const cancel = label(this, 210, 136, "CANCEL", this.index === CANCEL ? "small" : "small-white").setOrigin(0.5, 0);
    this.layer.add(cancel);
    if (this.index === CANCEL) this.layer.add(this.add.rectangle(186, 133, 48, 20).setStrokeStyle(1, 0xf87038).setOrigin(0));
    this.message.setText(this.swapFrom !== null ? "Move to where?" : "Choose a POKéMON.");
    gameStore.say(this.index === CANCEL ? "Cancel" : `${speciesData[party[this.index]]?.name ?? ""}. ${this.message.text}`);
  }

  private move(delta: number) {
    const count = this.party.length;
    const order = [...Array(count).keys(), CANCEL];
    const at = order.indexOf(this.index);
    this.index = order[(at + delta + order.length) % order.length];
    chip.sfx("cursor"); this.render();
  }

  private onAction(action: string) {
    if (this.ui.active) { this.ui.handle(action as never); return; }
    if (action === "up") this.move(-1);
    else if (action === "down") this.move(1);
    else if (action === "left" && this.index !== 0 && this.index !== CANCEL) { this.index = 0; chip.sfx("cursor"); this.render(); }
    else if (action === "right" && this.index === 0 && this.party.length > 1) { this.index = 1; chip.sfx("cursor"); this.render(); }
    else if (["confirm", "start", "interact"].includes(action)) this.choose();
    else if (action === "cancel" || action === "menu") {
      if (this.swapFrom !== null) { this.swapFrom = null; chip.sfx("select"); this.render(); }
      else closeOverlay(this, this.from);
    }
  }

  private onPointer(x: number, y: number) {
    if (this.ui.active) { this.ui.pointer(x, y); return; }
    if (x >= 184 && y >= 130) { this.index = CANCEL; this.choose(); return; }
    for (let i = 0; i < this.party.length; i++) {
      const p = slotPos(i), w = i === 0 ? 80 : 144, h = i === 0 ? 56 : 24;
      if (x >= p.x && x < p.x + w && y >= p.y && y < p.y + h) { this.index = i; this.render(); this.choose(); return; }
    }
  }

  private choose() {
    chip.sfx("select");
    if (this.index === CANCEL) { if (this.swapFrom !== null) { this.swapFrom = null; this.render(); } else closeOverlay(this, this.from); return; }
    if (this.swapFrom !== null) {
      gameStore.swapParty(this.swapFrom, this.index);
      this.swapFrom = null; chip.sfx("menu"); this.render();
      return;
    }
    const mon = this.party[this.index];
    this.message.setText("Do what with this PKMN?");
    let release = () => {};
    const menu = new Menu(this, {
      x: 160, y: 72, width: 80, items: ["SUMMARY", "SWITCH", "CANCEL"],
      onCancel: () => { release(); menu.destroy(); this.render(); },
      onSelect: (i) => {
        release(); menu.destroy();
        if (i === 0) this.summary(mon);
        else if (i === 1 && this.party.length > 1) { this.swapFrom = this.index; this.render(); }
        else this.render();
      },
    });
    release = this.ui.push({ handle: (a) => menu.handle(a), pointer: (x, y) => { if (!menu.pointer(x, y)) { release(); menu.destroy(); this.render(); } return true; } });
  }

  private summary(mon: Species) {
    const info = speciesData[mon], stats = statsAt(info);
    const page = this.add.container(0, 0).setDepth(500);
    page.add(this.add.rectangle(0, 0, 240, 160, 0x88b8e8).setOrigin(0));
    page.add(this.add.rectangle(0, 0, 240, 16, 0x305890).setOrigin(0));
    page.add(label(this, 6, 0, "POKéMON INFO", "white"));
    page.add(label(this, 234, 1, "B: BACK", "small-white").setOrigin(1, 0));
    const left = new Window(this, 4, 20, 96, 136); page.add(left);
    left.add(this.add.image(48, 74, `front-${info.key}`).setOrigin(0.5, 1));
    left.add(label(this, 8, 72, `No${String(info.dex).padStart(3, "0")}`, "small"));
    left.add(label(this, 8, 84, `${info.name}${info.gender}`, "blue"));
    left.add(label(this, 8, 98, `Lv${info.level}`));
    info.types.forEach((t, i) => left.add(this.add.image(8 + i * 34, 115, "types", typeIndex[t]).setOrigin(0)));
    const right = new Window(this, 104, 20, 132, 136); page.add(right);
    const rows: [string, number][] = [["HP", stats.hp], ["ATTACK", stats.attack], ["DEFENSE", stats.defense], ["SP. ATK", stats.spAttack], ["SP. DEF", stats.spDefense], ["SPEED", stats.speed]];
    rows.forEach(([k, v], i) => { right.add(label(this, 8, 6 + i * 12, k, "small")); right.add(label(this, 122, 6 + i * 12, i === 0 ? `${v}/${v}` : String(v), "small").setOrigin(1, 0)); });
    info.moves.forEach((id, i) => { const m = moves[id]; right.add(label(this, 8, 80 + i * 12, m.name, "small")); right.add(label(this, 122, 80 + i * 12, `PP${m.pp}/${m.pp}`, "small").setOrigin(1, 0)); });
    playCry(this, info.key);
    gameStore.say(`${info.name}, level ${info.level}. HP ${stats.hp}. Moves: ${info.moves.map((id) => moves[id].name).join(", ")}.`);
    let release = () => {};
    const close = () => { release(); page.destroy(); chip.sfx("select"); this.render(); return true; };
    release = this.ui.push({ handle: (a) => (["cancel", "confirm", "menu", "start"].includes(a) ? close() : true), pointer: () => close() });
  }
}
