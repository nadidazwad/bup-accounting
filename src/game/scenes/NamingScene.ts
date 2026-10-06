import { Scene, GameObjects } from "phaser";
import { gameStore } from "../state/store";
import { chip } from "../audio/chip";
import { Window } from "../ui/Window";
import { label } from "../ui/text";
import { bindInput } from "./helpers";

// The FRLG naming screen: native background and keyboard frame, a 4×8 grid,
// page swap / BACK / OK buttons on the right, max 7 characters.
const pages = {
  UPPER: ["ABCDEF .", "GHIJKL ,", "MNOPQRS ", "TUVWXYZ "],
  OTHERS: ["01234   ", "56789   ", "!?♂♀/-  ", "…“”‘’   "],
} as const;
type Page = keyof typeof pages;
const cellX = (col: number) => 28 + col * 19, cellY = (row: number) => 88 + row * 16;
const buttons = ["page", "back", "ok"] as const;
const buttonY = [84, 108, 132];
const maxLength = 7;

export class NamingScene extends Scene {
  private name = "";
  private page: Page = "UPPER";
  private col = 0;
  private row = 0;
  private letters: GameObjects.BitmapText[] = [];
  private slots: GameObjects.BitmapText[] = [];
  private cursor!: GameObjects.Rectangle;
  private pageLabel!: GameObjects.BitmapText;
  constructor() { super("Naming"); }

  create() {
    this.name = ""; this.page = "UPPER"; this.col = 0; this.row = 0; this.letters = []; this.slots = [];
    this.add.image(0, 0, "naming-bg").setOrigin(0);
    this.add.sprite(56, 70, "player", 0).setOrigin(0.5, 1);
    label(this, 76, 36, "YOUR NAME?");
    for (let i = 0; i < maxLength; i++) {
      this.add.rectangle(78 + i * 10, 70, 7, 1, 0x606060).setOrigin(0);
      this.slots.push(label(this, 78 + i * 10, 55, ""));
    }
    for (let row = 0; row < 4; row++) for (let col = 0; col < 8; col++) this.letters.push(label(this, cellX(col), cellY(row), ""));
    new Window(this, 190, 80, 44, 24); new Window(this, 190, 104, 44, 24); new Window(this, 190, 128, 44, 24);
    this.pageLabel = label(this, 212, 85, "", "small").setOrigin(0.5, 0);
    label(this, 212, 109, "BACK", "small").setOrigin(0.5, 0);
    label(this, 212, 133, "OK", "small").setOrigin(0.5, 0);
    this.cursor = this.add.rectangle(0, 0, 14, 16).setStrokeStyle(1, 0xe83020).setOrigin(0);
    this.renderPage(); this.place();
    gameStore.say("Your name? Choose letters with the arrow keys and A. B deletes, Start jumps to OK. Up to 7 characters.");
    bindInput(this, (action) => this.onAction(action), (x, y) => this.onPointer(x, y));
  }

  private renderPage() {
    pages[this.page].forEach((line, row) => [...line].forEach((ch, col) => this.letters[row * 8 + col].setText(ch === " " ? "" : ch)));
    this.pageLabel.setText(this.page === "UPPER" ? "OTHERS" : "UPPER");
  }
  private place() {
    if (this.col < 8) this.cursor.setPosition(cellX(this.col) - 4, cellY(this.row) - 1).setSize(14, 16);
    else this.cursor.setPosition(191, buttonY[Math.min(this.row, 2)] + 1).setSize(42, 22);
  }
  private renderName() {
    this.slots.forEach((slot, i) => slot.setText(this.name[i] ?? ""));
    gameStore.say(this.name ? `Name: ${this.name.split("").join(" ")}` : "Name is empty");
  }
  private type(ch: string) {
    if (this.name.length >= maxLength) { chip.sfx("buzz"); return; }
    this.name += ch; chip.sfx("type"); this.renderName();
    if (this.name.length === maxLength) { this.col = 8; this.row = 2; this.place(); }
  }
  private press() {
    if (this.col < 8) {
      const ch = pages[this.page][this.row][this.col];
      if (ch === " " && !this.name) { chip.sfx("buzz"); return; }
      this.type(ch);
      return;
    }
    const button = buttons[Math.min(this.row, 2)];
    if (button === "page") { this.page = this.page === "UPPER" ? "OTHERS" : "UPPER"; chip.sfx("menu"); this.renderPage(); }
    else if (button === "back") this.backspace();
    else this.finish();
  }
  private backspace() {
    if (!this.name) { chip.sfx("buzz"); return; }
    this.name = this.name.slice(0, -1); chip.sfx("cursor"); this.renderName();
  }
  private finish() {
    const name = this.name.trim();
    if (!name) { chip.sfx("buzz"); gameStore.say("Please enter at least one character."); return; }
    chip.sfx("select");
    this.game.events.emit("naming-done", name);
    this.scene.resume("Intro");
    this.scene.stop();
  }
  private onAction(action: string) {
    if (action === "up") this.row = (this.row + 3) % 4;
    else if (action === "down") this.row = (this.row + 1) % 4;
    else if (action === "left") this.col = (this.col + 8) % 9;
    else if (action === "right") this.col = (this.col + 1) % 9;
    else if (action === "confirm" || action === "interact") { this.press(); return; }
    else if (action === "cancel") { this.backspace(); return; }
    else if (action === "start" || action === "menu") { this.col = 8; this.row = 2; this.place(); chip.sfx("cursor"); return; }
    else if (action === "select") { this.page = this.page === "UPPER" ? "OTHERS" : "UPPER"; chip.sfx("menu"); this.renderPage(); return; }
    else return;
    if (this.col === 8 && this.row > 2) this.row = 2;
    chip.sfx("cursor"); this.place();
    gameStore.say(this.col < 8 ? (pages[this.page][this.row][this.col].trim() || "space") : buttons[this.row]);
  }
  private onPointer(x: number, y: number) {
    if (x >= 190 && y >= 80 && y < 152) { this.col = 8; this.row = Math.min(2, Math.floor((y - 80) / 24)); this.place(); this.press(); return; }
    const col = Math.round((x - 28 - 3) / 19), row = Math.floor((y - 88 + 1) / 16);
    if (col >= 0 && col < 8 && row >= 0 && row < 4) { this.col = col; this.row = row; this.place(); this.press(); }
  }
}
