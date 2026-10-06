import { Scene, GameObjects } from "phaser";
import { gameStore, type ItemId } from "../state/store";
import { bagOrder, items } from "../data/items";
import { chip } from "../audio/chip";
import { TextBox } from "../ui/TextBox";
import { Menu, UiStack } from "../ui/Menu";
import { label, wrap } from "../ui/text";
import { bindInput } from "./helpers";
import { closeOverlay } from "./menuBase";

// FRLG bag: native item_menu background, the bag sprite on the left, the item
// list on the cream panel and the description strip with the item icon below.
export class BagScene extends Scene {
  private index = 0;
  private rows!: GameObjects.Container;
  private icon!: GameObjects.Image;
  private description!: GameObjects.Container;
  private bag!: GameObjects.Sprite;
  private textbox!: TextBox;
  private ui = new UiStack();
  private from = "Overworld";
  constructor() { super("Bag"); }
  init(data: { from?: string }) { this.from = data.from ?? "Overworld"; }

  private get list(): (ItemId | null)[] {
    const bag = gameStore.getSnapshot().bag;
    return [...bagOrder.filter((id) => (bag[id] ?? 0) > 0), null];
  }

  create() {
    this.index = 0; this.ui = new UiStack();
    this.add.image(0, 0, "bag-bg").setOrigin(0);
    label(this, 10, 3, "ITEMS", "white");
    this.bag = this.add.sprite(40, 92, "bag", 0).setOrigin(0.5, 1);
    this.rows = this.add.container(0, 0);
    this.icon = this.add.image(8, 126, "item-potion").setOrigin(0);
    this.description = this.add.container(40, 118);
    this.textbox = new TextBox(this);
    this.render();
    bindInput(this, (a) => this.onAction(a), (x, y) => this.onPointer(x, y));
    this.tweens.add({ targets: this.bag, angle: { from: -4, to: 4 }, duration: 120, yoyo: true, repeat: 1 });
  }
  update(time: number, delta: number) { this.textbox.update(time, delta); }

  private render() {
    const list = this.list, bag = gameStore.getSnapshot().bag;
    this.index = Math.min(this.index, list.length - 1);
    this.rows.removeAll(true);
    list.forEach((id, i) => {
      const y = 9 + i * 16;
      this.rows.add(label(this, 100, y, id ? items[id].name : "CLOSE BAG"));
      if (id) this.rows.add(label(this, 228, y, `×${bag[id]}`).setOrigin(1, 0));
    });
    this.rows.add(label(this, 90, 9 + this.index * 16, "▶"));
    const id = list[this.index];
    this.icon.setVisible(!!id);
    if (id) this.icon.setTexture(items[id].icon);
    this.description.removeAll(true);
    const text = id ? items[id].description : "Close the BAG and go back.";
    wrap(this, text, 192, "white").slice(0, 3).forEach((line, i) => this.description.add(label(this, 0, i * 13, line, "white")));
    gameStore.say(`${id ? items[id].name : "Close bag"}. ${text}`);
  }

  private onAction(action: string) {
    if (this.ui.active) { this.ui.handle(action as never); return; }
    const count = this.list.length;
    if (action === "up" || action === "down") {
      this.index = (this.index + (action === "up" ? -1 : 1) + count) % count;
      chip.sfx("cursor"); this.bag.setAngle(0);
      this.tweens.add({ targets: this.bag, angle: { from: -3, to: 3 }, duration: 80, yoyo: true });
      this.render();
    } else if (["confirm", "start", "interact"].includes(action)) this.choose();
    else if (action === "cancel" || action === "menu") closeOverlay(this, this.from);
  }

  private onPointer(x: number, y: number) {
    if (this.ui.active) { this.ui.pointer(x, y); return; }
    if (this.textbox.open) { this.textbox.advance(); return; }
    const i = Math.floor((y - 9) / 16);
    if (x >= 86 && i >= 0 && i < this.list.length) { this.index = i; this.render(); this.choose(); }
  }

  private choose() {
    chip.sfx("select");
    const id = this.list[this.index];
    if (!id) { closeOverlay(this, this.from); return; }
    let release = () => {};
    const menu = new Menu(this, {
      x: 168, y: 88, width: 72, items: ["USE", "CANCEL"],
      onCancel: () => { release(); menu.destroy(); },
      onSelect: (i) => {
        release(); menu.destroy();
        if (i === 0) {
          const closeText = this.ui.push({ handle: (a) => { if (["confirm", "cancel", "start", "interact"].includes(a)) this.textbox.advance(); return true; }, pointer: () => { this.textbox.advance(); return true; } });
          void this.textbox.show(items[id].use, () => closeText());
        }
      },
    });
    release = this.ui.push({ handle: (a) => menu.handle(a), pointer: (x, y) => { if (!menu.pointer(x, y)) { release(); menu.destroy(); } return true; } });
  }
}
