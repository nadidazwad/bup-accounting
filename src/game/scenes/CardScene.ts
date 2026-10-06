import { Scene } from "phaser";
import { formatPlayTime, gameStore } from "../state/store";
import { label } from "../ui/text";
import { bindInput } from "./helpers";
import { closeOverlay } from "./menuBase";

// TRAINER CARD, drawn in the FRLG card's layout and colours.
export class CardScene extends Scene {
  private from = "Overworld";
  constructor() { super("Card"); }
  init(data: { from?: string }) { this.from = data.from ?? "Overworld"; }

  create() {
    const s = gameStore.getSnapshot();
    this.add.rectangle(0, 0, 240, 160, 0x48a088).setOrigin(0);
    const stripes = this.add.graphics().fillStyle(0x58b098);
    for (let y = 0; y < 160; y += 4) stripes.fillRect(0, y, 240, 2);
    const card = this.add.graphics();
    card.fillStyle(0x304838).fillRoundedRect(10, 12, 224, 140, 8);
    card.fillStyle(0xf8f0c0).fillRoundedRect(8, 8, 224, 140, 8);
    card.fillStyle(0xe8c850).fillRoundedRect(8, 8, 224, 22, { tl: 8, tr: 8, bl: 0, br: 0 });
    card.lineStyle(1, 0x907020).strokeRoundedRect(8, 8, 224, 140, 8);
    card.fillStyle(0xe8d898);
    for (let i = 0; i < 6; i++) card.fillRect(40 + i * 24, 30 + i * 14, 120, 3);
    label(this, 16, 11, "BUP ACCOUNTING TRAINER CARD", "white");
    label(this, 150, 34, "IDNo.26026", "small");
    const rows: [string, string][] = [["NAME", s.playerName], ["MONEY", `¥${s.money}`], ["POKéDEX", String(s.seen.length)], ["TIME", formatPlayTime(s.playMs)]];
    rows.forEach(([k, v], i) => { label(this, 18, 48 + i * 18, k); label(this, 150, 48 + i * 18, v).setOrigin(1, 0); });
    this.add.image(196, 128, "red-full").setOrigin(0.5, 1).setScale(0.75).setCrop(0, 0, 64, 92);
    label(this, 18, 124, "BADGES", "small");
    for (let i = 0; i < 8; i++) this.add.circle(66 + i * 12, 131, 4, 0xd8c888).setStrokeStyle(1, 0xa89048);
    label(this, 120, 150, "Strictly business.", "small-white").setOrigin(0.5, 0);
    gameStore.say(`Trainer card. ${rows.map(([k, v]) => `${k} ${v}`).join(". ")}. No badges yet.`);
    bindInput(this, (a) => { if (["cancel", "confirm", "menu", "start"].includes(a)) closeOverlay(this, this.from); }, () => closeOverlay(this, this.from));
  }
}
