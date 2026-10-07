import Phaser from "phaser";
import { Scene, GameObjects } from "phaser";
import { gameStore, type DexSpecies, type Species } from "../state/store";
import { chip } from "../audio/chip";
import { TextBox } from "../ui/TextBox";
import { Menu, UiStack, askYesNo } from "../ui/Menu";
import { label, measure } from "../ui/text";
import { moves, type MoveId } from "../battle/moves";
import { active, canSwitchTo, createBattle, expYield, nextFoe, runTurn, sendOutFoe, switchPlayer, type Action, type Battle, type BattleEvent, type Battler, type SideKey } from "../battle/engine";
import { gameInput } from "../input/router";
import { fadeOut, flash, playCry, reducedMotion, tween, wait } from "./helpers";
import { hpColors } from "./menuBase";

// FRLG singles layout: opponent sprite centred on (176, 40), the player's back
// sprite on (72, 80), healthboxes top-left and bottom-right, text in the bottom 48 px.
export type BattleData = { kind: "wild" | "trainer"; foe: DexSpecies[] };
export type BattleResult = "win" | "lose" | "caught" | "run";
const FOE = { x: 176, y: 72 }, PLAYER = { x: 72, y: 112 };

/** Transparent rows under a sprite whose lowest opaque row is a flat cut (≥ 40 % of its width). */
const cutDrops = new Map<string, number>();
function cutDrop(scene: Phaser.Scene, key: string) {
  const cached = cutDrops.get(key);
  if (cached !== undefined) return cached;
  const frame = scene.textures.getFrame(key);
  let drop = 0;
  for (let y = frame.height - 1; y >= 0; y--) {
    let opaque = 0;
    for (let x = 0; x < frame.width; x++) if ((scene.textures.getPixelAlpha(x, y, key) ?? 0) > 0) opaque++;
    if (!opaque) continue;
    drop = opaque >= frame.width * 0.4 ? frame.height - 1 - y : 0;
    break;
  }
  cutDrops.set(key, drop);
  return drop;
}
const grid = [[136, 121], [192, 121], [136, 137], [192, 137]];
const moveGrid = [[14, 121], [86, 121], [14, 137], [86, 137]];
const advance = ["confirm", "cancel"];

class HealthBox {
  readonly container: GameObjects.Container;
  private readonly fill: GameObjects.Graphics;
  private readonly numbers?: GameObjects.BitmapText;
  private shown = 0;
  constructor(private readonly scene: Scene, x: number, y: number, mon: Battler, private readonly player: boolean) {
    const c = this.container = scene.add.container(x, y).setDepth(50);
    const w = player ? 108 : 100, h = player ? 37 : 29;
    const g = scene.add.graphics();
    g.fillStyle(0x506858).fillRoundedRect(player ? -3 : 4, 3, w, h, 4);
    g.fillStyle(0xf8f8d8).fillRoundedRect(0, 0, w, h, 4);
    g.lineStyle(1, 0x304040).strokeRoundedRect(0, 0, w, h, 4);
    const bar = player ? { x: 36, y: 17 } : { x: 30, y: 19 };
    g.fillStyle(0xf8b030).fillRect(bar.x - 12, bar.y, 14, 5);
    g.fillStyle(0x485058).fillRect(bar.x, bar.y, 64, 5);
    g.fillStyle(0xf8f8f8).fillRect(bar.x + 2, bar.y + 1, 60, 3);
    if (player) { g.fillStyle(0x485058).fillRect(6, 32, 96, 3); g.fillStyle(0x40c8f8).fillRect(7, 33, 40, 1); }
    c.add(g);
    c.add(label(scene, 6, 0, `${mon.info.name}${mon.info.gender}`));
    c.add(label(scene, w - 32, 2, `Lv${mon.level}`, "small"));
    c.add(label(scene, bar.x - 11, bar.y - 4, "HP", "small-white"));
    this.fill = scene.add.graphics().setPosition(bar.x + 2, bar.y + 1);
    c.add(this.fill);
    if (player) { this.numbers = label(scene, 100, 21, "", "small").setOrigin(1, 0); c.add(this.numbers); }
    this.shown = mon.hp; this.draw(mon.hp, mon.maxHp);
  }
  private draw(hp: number, max: number) {
    const width = hp <= 0 ? 0 : Math.max(1, Math.round((60 * hp) / max));
    const [light, dark] = hpColors(hp / max);
    this.fill.clear().fillStyle(light).fillRect(0, 0, width, 2).fillStyle(dark).fillRect(0, 2, width, 1);
    this.numbers?.setText(`${Math.ceil(hp)}/ ${max}`);
  }
  /** HP drains at roughly the FRLG speed: about one bar pixel per frame. */
  async drain(to: number, max: number) {
    const state = { hp: this.shown };
    const pixels = Math.abs(to - this.shown) / max * 60;
    await tween(this.scene, { targets: state, hp: to, duration: Math.max(120, pixels * 16), onUpdate: () => this.draw(state.hp, max) });
    this.shown = to; this.draw(to, max);
  }
}

export class BattleScene extends Scene {
  private battle!: Battle;
  private setup!: BattleData;
  private textbox!: TextBox;
  private ui = new UiStack();
  private sprites: Record<SideKey, GameObjects.Image | null> = { player: null, foe: null };
  private boxes: Record<SideKey, HealthBox | null> = { player: null, foe: null };
  private choose: ((value: number) => void) | null = null;
  private cursor = 0;
  private gridItems: { positions: number[][]; count: number } = { positions: grid, count: 4 };
  private panel: GameObjects.Container | null = null;
  private cursorText: GameObjects.BitmapText | null = null;
  private autoAt = 0;
  private rng = Math.random;
  private movePositions = moveGrid;
  constructor() { super("Battle"); }

  init(data: Partial<BattleData>) {
    this.setup = { kind: data.kind ?? "trainer", foe: data.foe ?? ["Caterpie", "Bayleef", "Blastoise"] };
  }

  create() {
    if (!this.setup) this.init({});
    gameStore.setScene("Battle");
    this.ui = new UiStack(); this.choose = null; this.panel = null; this.sprites = { player: null, foe: null }; this.boxes = { player: null, foe: null };
    const s = gameStore.getSnapshot();
    const scale = this.setup.kind === "trainer" ? Math.max(0.25, 1 - 0.25 * s.flags.brokerLosses) : 1;
    this.battle = createBattle(this.setup.kind, [...s.party], this.setup.foe, scale);
    this.battle.guaranteedCrit = this.registry.get("pikachuAssist") === true;
    this.add.image(0, 0, "battle-bg").setOrigin(0);
    // The empty message frame is always on screen, as in the original.
    this.add.image(0, 112, "battle-box").setOrigin(0).setCrop(0, 0, 240, 48).setDepth(90);
    this.textbox = new TextBox(this, "battle", 100);
    const unsubscribe = this.registerInput();
    this.events.once("shutdown", unsubscribe);
    this.game.canvas.dataset.ready = "true";
    gameStore.setGameReady(true);
    void this.run();
  }

  private registerInput() {
    const onAction = (action: string) => {
      if (!this.sys.isActive()) return;
      if (this.ui.active) { this.ui.handle(action as never); return; }
      if (this.choose) { this.gridInput(action); return; }
      if (advance.includes(action)) this.textbox.advance();
    };
    const onPointer = (p: Phaser.Input.Pointer) => {
      if (!this.sys.isActive()) return;
      if (this.ui.active) { this.ui.pointer(p.x, p.y); return; }
      if (this.choose) { this.gridPointer(p.x, p.y); return; }
      this.textbox.advance();
    };
    const off = gameInput.subscribe(onAction);
    this.input.on("pointerup", onPointer);
    return () => { off(); this.input.off("pointerup", onPointer); };
  }

  update(time: number, delta: number) {
    this.textbox.update(time, delta);
    // Battle messages scroll on by themselves after a beat, like the original.
    if (this.textbox.pageDone && !this.ui.active) {
      if (!this.autoAt) this.autoAt = time + 900;
      else if (time >= this.autoAt) { this.autoAt = 0; this.textbox.advance(); }
    } else this.autoAt = 0;
  }

  private say(text: string) { return this.textbox.show(text); }

  // ——— 2×2 menus (actions and moves) ———
  private gridInput(action: string) {
    const c = this.cursor;
    if (action === "left" || action === "right") this.cursor = c ^ 1;
    else if (action === "up" || action === "down") this.cursor = c ^ 2;
    else if (action === "confirm") { chip.sfx("select"); this.pick(c); return; }
    else if (action === "cancel" || action === "menu") { chip.sfx("select"); this.pick(-1); return; }
    else return;
    if (this.cursor >= this.gridItems.count) this.cursor = c;
    chip.sfx("cursor"); this.placeCursor();
  }
  private gridPointer(x: number, y: number) {
    const i = this.gridItems.positions.findIndex(([gx, gy], index) => index < this.gridItems.count && x >= gx - 10 && x < gx + 60 && y >= gy - 2 && y < gy + 15);
    if (i >= 0) { this.cursor = i; this.placeCursor(); chip.sfx("select"); this.pick(i); } else if (y < 110) this.pick(-1);
  }
  private placeCursor() {
    const [x, y] = this.gridItems.positions[this.cursor];
    this.cursorText?.setPosition(x - 9, y);
    this.panel?.emit("cursor", this.cursor);
  }
  private pick(i: number) { const done = this.choose; this.choose = null; this.panel?.destroy(); this.panel = null; done?.(i); }

  private actionMenu(): Promise<number> {
    const name = active(this.battle, "player").info.name;
    this.textbox.close();
    const panel = this.panel = this.add.container(0, 0).setDepth(120);
    panel.add(this.add.image(0, 64, "battle-box").setOrigin(0).setCrop(0, 48, 240, 48));
    panel.add(label(this, 11, 121, "What will", "white"));
    panel.add(label(this, 11, 137, `${name} do?`, "white"));
    ["FIGHT", "BAG", "POKéMON", "RUN"].forEach((a, i) => panel.add(label(this, grid[i][0], grid[i][1], a)));
    this.cursorText = label(this, 0, 0, "▶"); panel.add(this.cursorText);
    this.gridItems = { positions: grid, count: 4 };
    this.cursor = Math.min(this.cursor, 3); this.placeCursor();
    gameStore.say(`What will ${name} do? Fight, Bag, Pokémon or Run.`);
    return new Promise((resolve) => { this.choose = resolve; });
  }

  private moveMenu(): Promise<number> {
    const mon = active(this.battle, "player");
    const panel = this.panel = this.add.container(0, 0).setDepth(120);
    panel.add(this.add.image(0, 16, "battle-box").setOrigin(0).setCrop(0, 96, 240, 48));
    // Long names drop to the native small font, and the second column starts
    // after the widest first-column name so the two never collide.
    const names = mon.moves.map((m) => moves[m.id].name);
    const ink = names.some((n) => measure(this, n) > 66) ? "small" : "gray";
    const firstWidth = Math.max(...names.filter((_, i) => i % 2 === 0).map((n) => measure(this, n, ink)));
    const secondX = Math.max(86, 14 + firstWidth + 8);
    this.movePositions = [[14, 121], [secondX, 121], [14, 137], [secondX, 137]];
    names.forEach((n, i) => panel.add(label(this, this.movePositions[i][0], this.movePositions[i][1] + (ink === "small" ? 1 : 0), n, ink)));
    const pp = label(this, 168, 121, ""), type = label(this, 168, 137, "");
    panel.add([pp, type]);
    panel.on("cursor", (i: number) => {
      const m = mon.moves[i], move = moves[m.id];
      pp.setText(`PP ${String(m.pp).padStart(2, " ")}/${move.pp}`);
      type.setText(`TYPE/${move.type === "ELECTRIC" ? "ELECTR" : move.type}`);
      gameStore.say(`${move.name}, ${move.type}, PP ${m.pp} of ${move.pp}`);
    });
    this.cursorText = label(this, 0, 0, "▶"); panel.add(this.cursorText);
    this.gridItems = { positions: this.movePositions, count: mon.moves.length };
    this.cursor = 0; this.placeCursor();
    return new Promise((resolve) => { this.choose = resolve; });
  }

  private listMenu(items: string[], x = 120, y = 8, width = 120): Promise<number> {
    return new Promise((resolve) => {
      let release = () => {};
      const done = (i: number) => { release(); menu.destroy(); resolve(i); };
      const menu = new Menu(this, { x, y, width, items, depth: 300, onSelect: done, onCancel: () => done(-1) });
      release = this.ui.push({ handle: (a) => menu.handle(a), pointer: (px, py) => { if (!menu.pointer(px, py)) done(-1); return true; } });
    });
  }

  private async partyMenu(forced: boolean): Promise<number> {
    const team = this.battle.player.team;
    const rows = team.map((m, i) => `${m.info.name} ${m.hp > 0 ? `${m.hp}/${m.maxHp}` : "FNT"}${i === this.battle.player.active ? " ★" : ""}`);
    for (;;) {
      await this.textbox.show(forced ? "Choose a POKéMON to send out." : "Choose a POKéMON.", { keepOpen: true });
      const i = await this.listMenu(forced ? rows : [...rows, "CANCEL"], 72, 8, 168);
      this.textbox.close();
      if (i < 0 || i >= team.length) { if (!forced) return -1; continue; }
      if (canSwitchTo(this.battle, i)) return i;
      chip.sfx("buzz");
      await this.say(team[i].hp <= 0 ? `${team[i].info.name} has no energy left to battle!` : `${team[i].info.name} is already in battle!`);
    }
  }

  // ——— Sprites and animation ———
  private placeMon(side: SideKey) {
    const mon = active(this.battle, side);
    this.sprites[side]?.destroy();
    const pos = side === "foe" ? FOE : PLAYER;
    const key = `${side === "foe" ? "front" : "back"}-${mon.info.key}`;
    // Like FRLG's per-species back-pic y offsets: a back sprite whose bottom is
    // a flat cut sits with that cut on the text box, not floating above it.
    const drop = side === "player" ? cutDrop(this, key) : 0;
    const sprite = this.add.image(pos.x, pos.y + drop, key).setOrigin(0.5, 1).setDepth(side === "foe" ? 10 : 20);
    this.sprites[side] = sprite;
    this.boxes[side]?.container.destroy();
    this.boxes[side] = new HealthBox(this, side === "foe" ? 13 : 126, side === "foe" ? 16 : 74, mon, side === "player");
    return sprite;
  }

  private async sendOut(side: SideKey, announce = true) {
    const mon = active(this.battle, side);
    if (announce) {
      if (side === "player") await this.say(`Go! ${mon.info.name}!`);
      else if (this.setup.kind === "trainer") await this.say(`THE BROKER sent out ${mon.info.name}!${mon.species === "Caterpie" ? " …Is that a joke?" : ""}`);
    }
    const sprite = this.placeMon(side);
    const box = this.boxes[side]!.container;
    box.setAlpha(0);
    const pos = side === "foe" ? FOE : PLAYER;
    // The ball pops open with a white flash and the POKéMON grows out of it.
    const ball = this.add.sprite(pos.x + (side === "foe" ? 0 : 20), pos.y - 28, "ball", 0).setDepth(40);
    chip.sfx("ballOpen");
    sprite.setScale(0.1).setAlpha(0.6);
    const burst = this.add.circle(pos.x, pos.y - 28, 4, 0xffffff).setDepth(41);
    ball.destroy();
    await Promise.all([
      tween(this, { targets: burst, radius: 26, alpha: 0, duration: 260 }),
      tween(this, { targets: sprite, scale: 1, alpha: 1, duration: 300, ease: "Back.easeOut" }),
    ]);
    burst.destroy();
    playCry(this, mon.info.key);
    await tween(this, { targets: box, alpha: 1, duration: 200 });
  }

  private async blink(sprite: GameObjects.Image | null) {
    if (!sprite) return;
    for (let i = 0; i < 4; i++) { sprite.setVisible(false); await wait(this, 60); sprite.setVisible(true); await wait(this, 60); }
  }

  private async animateMove(side: SideKey, id: MoveId) {
    const move = moves[id], user = this.sprites[side], target = this.sprites[side === "player" ? "foe" : "player"];
    const from = side === "player" ? { x: 96, y: 76 } : { x: 160, y: 40 }, to = side === "player" ? { x: 176, y: 44 } : { x: 72, y: 84 };
    const particles = (color: number, count: number, size = 4, spread = 10) =>
      Promise.all(Array.from({ length: count }, (_, i) => {
        const p = this.add.rectangle(from.x, from.y, size, size, color).setDepth(60);
        return tween(this, { targets: p, x: to.x + Phaser.Math.Between(-spread, spread), y: to.y + Phaser.Math.Between(-spread, spread), duration: 260, delay: i * 45, ease: "Quad.easeIn" }).then(() => p.destroy());
      }));
    if (move.power === 0) {
      if (move.effect === "rain") {
        const drops = Array.from({ length: 40 }, () => this.add.rectangle(Phaser.Math.Between(0, 240), Phaser.Math.Between(-60, 0), 1, 6, 0x6890f8).setDepth(70));
        await Promise.all(drops.map((d) => tween(this, { targets: d, y: d.y + 180, x: d.x - 20, duration: 700, delay: Phaser.Math.Between(0, 300) })));
        drops.forEach((d) => d.destroy());
      } else if (move.effect === "reflect") {
        const pane = this.add.rectangle(side === "player" ? 72 : 176, side === "player" ? 80 : 40, 56, 56, 0xf8f8f8, 0.4).setDepth(60).setStrokeStyle(1, 0xf8f8f8);
        await tween(this, { targets: pane, alpha: 0, duration: 600, delay: 200 }); pane.destroy();
      } else if (move.effect === "heal" || move.effect === "bulkUp") {
        const at = side === "player" ? { x: 72, y: 80 } : { x: 176, y: 40 };
        chip.sfx("sparkle");
        await Promise.all(Array.from({ length: 6 }, (_, i) => {
          const star = this.add.image(at.x + Phaser.Math.Between(-20, 20), at.y + 20, "stars", "small").setDepth(60);
          return tween(this, { targets: star, y: at.y - 24, alpha: 0, duration: 500, delay: i * 60 }).then(() => star.destroy());
        }));
      } else {
        await particles(move.type === "BUG" ? 0xf8f8f8 : 0xf8e030, 6, 2, 14);
      }
      return;
    }
    switch (move.type) {
      case "FIRE": chip.sfx("cut"); await particles(Phaser.Math.RND.pick([0xf86020, 0xf8b030]), 10, 5, 8); break;
      case "ELECTRIC":
        chip.sfx("flash");
        await flash(this, 1, 0xf8f8a0);
        for (let i = 0; i < 3; i++) {
          const bolt = this.add.graphics().setDepth(60).lineStyle(2, 0xf8e030);
          bolt.beginPath(); bolt.moveTo(to.x, to.y - 40);
          for (let k = 1; k <= 5; k++) bolt.lineTo(to.x + (k % 2 ? 8 : -8), to.y - 40 + k * 10);
          bolt.strokePath(); await wait(this, 90); bolt.destroy();
        }
        break;
      case "GRASS": chip.sfx("rustle"); await particles(0x58c040, 8, 4, 12); break;
      case "POISON": await particles(0xa048c8, 7, 5, 10); break;
      case "WATER": {
        chip.sfx("slide");
        const wave = this.add.rectangle(side === "player" ? -60 : 300, 70, 60, 90, 0x5890f8, 0.7).setDepth(60);
        await tween(this, { targets: wave, x: side === "player" ? 300 : -60, duration: 520 }); wave.destroy(); break;
      }
      case "DRAGON": await particles(0x7048e8, 8, 4, 10); break;
      default:
        if (user) await tween(this, { targets: user, x: user.x + (side === "player" ? 12 : -12), duration: 90, yoyo: true });
        chip.sfx("bump");
        if (target) {
          const star = this.add.image(target.x, target.y - 28, "stars", "big").setDepth(60).setScale(0.5);
          await tween(this, { targets: star, scale: 1.4, alpha: 0, duration: 200 }); star.destroy();
        }
    }
    await this.blink(target);
  }

  private async playEvents(events: BattleEvent[]) {
    for (const e of events) {
      switch (e.type) {
        case "text":
          if (e.text === "A critical hit!" && !reducedMotion()) this.cameras.main.shake(200, 0.01);
          await this.say(e.text); break;
        case "move": await this.animateMove(e.side, e.move); break;
        case "hp": await this.boxes[e.side]?.drain(e.to, e.max); break;
        case "faint": {
          const sprite = this.sprites[e.side];
          playCry(this, active(this.battle, e.side).info.key, 0.7);
          if (sprite) await tween(this, { targets: sprite, y: sprite.y + 40, alpha: 0, duration: 400, ease: "Quad.easeIn" });
          this.boxes[e.side]?.container.setVisible(false);
          break;
        }
        case "withdraw": {
          const sprite = this.sprites.player;
          if (sprite) await tween(this, { targets: sprite, scale: 0, duration: 220 });
          break;
        }
        case "sendOut": await this.sendOut(e.side, false); break;
        case "ball": await this.throwBall(e.shakes, e.caught); break;
        case "stat": chip.sfx(e.up ? "sparkle" : "bump"); break;
        case "status": chip.sfx("buzz"); await this.blink(this.sprites[e.side]); break;
        case "charge": chip.sfx("slide"); break;
        case "weather": break;
      }
    }
  }

  private async throwBall(shakes: number, caught: boolean) {
    await this.say(`${gameStore.getSnapshot().playerName} used POKé BALL!`);
    chip.sfx("throw");
    const ball = this.add.sprite(60, 90, "ball", 0).setDepth(60);
    const arc = { t: 0 };
    await tween(this, { targets: arc, t: 1, duration: 480, onUpdate: () => {
      ball.setPosition(Math.round(60 + 116 * arc.t), Math.round(90 - 54 * arc.t - Math.sin(arc.t * Math.PI) * 40)).setAngle(arc.t * 720);
    } });
    ball.setAngle(0);
    const foe = this.sprites.foe!;
    chip.sfx("ballOpen");
    await tween(this, { targets: foe, scale: 0, alpha: 0.3, y: FOE.y - 30, duration: 280, ease: "Quad.easeIn" });
    await tween(this, { targets: ball, y: 64, duration: 260, ease: "Bounce.easeOut" });
    await wait(this, 400);
    for (let i = 0; i < shakes; i++) {
      chip.sfx("wobble");
      await tween(this, { targets: ball, angle: i % 2 ? 22 : -22, duration: 110, yoyo: true });
      await wait(this, 480);
    }
    if (caught) {
      chip.sfx("click"); ball.setFrame(1);
      for (const [dx, dy] of [[-18, -14], [0, -20], [18, -14]]) {
        const star = this.add.image(176, 60, "stars", "small").setDepth(70);
        void tween(this, { targets: star, x: 176 + dx, y: 60 + dy, alpha: 0, duration: 500 }).then(() => star.destroy());
      }
      chip.play("caught");
      return;
    }
    chip.sfx("ballOpen");
    ball.destroy();
    await tween(this, { targets: foe, scale: 1, alpha: 1, y: FOE.y, duration: 220, ease: "Back.easeOut" });
  }

  // ——— Flow ———
  private async run() {
    const s = gameStore.getSnapshot(), b = this.battle;
    chip.play(this.setup.kind === "wild" ? "wild" : "auditor");
    this.cameras.main.fadeIn(300, 0, 0, 0);
    if (b.kind === "trainer") {
      const broker = this.add.image(-60, FOE.y, "broker-front").setOrigin(0.5, 1).setDepth(10);
      const red = this.add.sprite(300, PLAYER.y, "red-back", 0).setOrigin(0.5, 1).setDepth(20);
      await Promise.all([tween(this, { targets: broker, x: FOE.x, duration: 900 }), tween(this, { targets: red, x: PLAYER.x, duration: 900 })]);
      await this.say("THE BROKER would like to battle!");
      await tween(this, { targets: broker, x: 300, duration: 400 });
      broker.destroy();
      await this.sendOut("foe");
      for (const frame of [1, 2, 3, 4]) { red.setFrame(frame); await wait(this, 60); }
      await tween(this, { targets: red, x: -60, duration: 350 });
      red.destroy();
    } else {
      const mon = active(b, "foe");
      gameStore.markSeen(mon.species);
      const sprite = this.placeMon("foe");
      sprite.setX(-40);
      const box = this.boxes.foe!.container.setAlpha(0);
      const red = this.add.sprite(300, PLAYER.y, "red-back", 0).setOrigin(0.5, 1).setDepth(20);
      await Promise.all([tween(this, { targets: sprite, x: FOE.x, duration: reducedMotion() ? 1 : 900 }), tween(this, { targets: red, x: PLAYER.x, duration: reducedMotion() ? 1 : 900 })]);
      playCry(this, mon.info.key);
      void tween(this, { targets: box, alpha: 1, duration: 250 });
      await this.say(`Wild ${mon.info.name} appeared!`);
      for (const frame of [1, 2, 3, 4]) { red.setFrame(frame); await wait(this, 60); }
      await tween(this, { targets: red, x: -60, duration: 350 });
      red.destroy();
    }
    await this.sendOut("player");
    if (b.guaranteedCrit) await this.say(`${s.party.includes("Pikachu") ? "PIKACHU" : active(b, "player").info.name}’s eyes are glowing. Every hit will land critically!`);
    await this.loop();
  }

  private async loop() {
    const b = this.battle, name = gameStore.getSnapshot().playerName;
    while (!b.over) {
      let action: Action | null = null;
      while (!action) {
        const choice = await this.actionMenu();
        if (choice === 0) {
          const slot = await this.moveMenu();
          if (slot < 0) continue;
          if (active(b, "player").moves[slot].pp <= 0) { await this.say("There’s no PP left for this move!"); continue; }
          action = { kind: "move", slot };
        } else if (choice === 1) {
          const bag = gameStore.getSnapshot().bag;
          const i = await this.listMenu([`POTION ×${bag.POTION ?? 0}`, `POKé BALL ×${bag.POKE_BALL ?? 0}`, "CANCEL"], 120, 40, 120);
          if (i === 0) {
            const mon = active(b, "player");
            if (!(bag.POTION ?? 0)) { await this.say("You don’t have any POTIONS left."); continue; }
            if (mon.hp >= mon.maxHp) { await this.say("It won’t have any effect."); continue; }
            gameStore.useItem("POTION"); action = { kind: "potion", target: b.player.active };
          } else if (i === 1) {
            if (b.kind === "trainer") { await this.say("THE BROKER blocked the BALL! Don’t be a thief!"); continue; }
            if (!(bag.POKE_BALL ?? 0)) gameStore.addItem("POKE_BALL", 1);
            gameStore.useItem("POKE_BALL"); action = { kind: "ball" };
          }
        } else if (choice === 2) {
          const to = await this.partyMenu(false);
          if (to >= 0) action = { kind: "switch", to };
        } else if (choice === 3) action = { kind: "run" };
      }
      await this.playEvents(runTurn(b, action, this.rng));
      if (b.over) break;
      // Replace fainted POKéMON: the player's first, then THE BROKER's next.
      if (active(b, "player").hp <= 0) {
        await this.playEvents(switchPlayer(b, await this.partyMenu(true), false));
      }
      if (active(b, "foe").hp <= 0 && b.kind === "trainer") {
        await this.gainExp(active(b, "foe"));
        const next = nextFoe(b);
        if (next < 0) { b.over = "win"; break; }
        const upcoming = b.foe.team[next];
        await this.textbox.show(`THE BROKER is about to use ${upcoming.info.name}. Will ${name} change POKéMON?`, { keepOpen: true });
        const yes = await askYesNo(this, (h) => this.ui.push(h), 184, 64);
        this.textbox.close();
        if (yes) {
          const to = await this.partyMenu(false);
          if (to >= 0) await this.playEvents(switchPlayer(b, to));
        }
        await this.say(`THE BROKER sent out ${upcoming.info.name}!`);
        await this.playEvents(sendOutFoe(b, next));
        if (upcoming.species === "Blastoise") {
          chip.play("spotted");
          await this.say("THE BROKER: Time to close the deal.");
        }
      }
    }
    await this.finish(b.over!);
  }

  private async gainExp(fainted: Battler) {
    const mon = active(this.battle, "player");
    if (mon.hp > 0) await this.say(`${mon.info.name} gained ${expYield(this.battle, fainted)} EXP. Points!`);
  }

  private async finish(result: NonNullable<Battle["over"]>) {
    const s = gameStore.getSnapshot(), b = this.battle;
    if (result === "caught") {
      const mon = active(b, "foe");
      await wait(this, 600);
      await this.say(`${mon.info.name}’s data was added to the POKéDEX.`);
      gameStore.addToParty(mon.species as Species);
      await this.say(`${mon.info.name} joined your team! Welcome aboard, junior associate.`);
    } else if (result === "win" && b.kind === "trainer") {
      await this.gainExp(active(b, "foe"));
      chip.play("caught");
      const broker = this.add.image(300, FOE.y, "broker-front").setOrigin(0.5, 1).setDepth(10);
      await tween(this, { targets: broker, x: FOE.x, duration: 600 });
      await this.say(`${s.playerName} defeated THE BROKER!`);
      await this.say("THE BROKER: Impossible… My portfolio was perfectly diversified!");
      await this.say(`${s.playerName} got ¥5,000 for winning! (Taxable.)`);
      await this.say("THE BROKER: Your books… are flawless. But this world was never the real market…");
      gameStore.setFlag("bossBeaten");
    } else if (result === "lose") {
      await this.say(`${s.playerName} is out of usable POKéMON!`);
      await this.say(`${s.playerName} whited out!`);
      if (b.kind === "trainer") gameStore.recordLoss();
      await fadeOut(this, 500, 0xffffff);
      await wait(this, 300);
      this.children.removeAll(true);
      this.cameras.main.resetFX(); this.cameras.main.setBackgroundColor("#e8f0e8");
      this.add.image(0, 0, "oak-bg").setOrigin(0);
      this.add.image(120, 100, "prof").setOrigin(0.5, 1);
      this.textbox = new TextBox(this, "field", 100);
      await this.textbox.show("PROF. LEDGER: Don’t worry, even the best accountants make mistakes.");
      await this.textbox.show("I patched up your POKéMON. Their health insurance covers everything. Try again!");
      if (b.kind === "trainer" && gameStore.getSnapshot().flags.brokerLosses >= 2 && !this.registry.get("pikachuAssist")) {
        const helper = s.party.includes("Pikachu") ? "PIKACHU" : active(b, "player").info.name;
        await this.textbox.show(`Shall I let ${helper} handle it? It promises critical hits only.`, { keepOpen: true });
        const yes = await askYesNo(this, (h) => this.ui.push(h));
        this.textbox.close();
        if (yes) this.registry.set("pikachuAssist", true);
      }
    }
    this.done(result);
  }

  private done(result: BattleResult) {
    chip.stopMusic();
    this.cameras.main.fadeOut(400, 0, 0, 0);
    this.cameras.main.once("camerafadeoutcomplete", () => {
      this.game.events.emit("battle-done", result);
      if (this.scene.isPaused("Overworld")) this.scene.resume("Overworld");
      else if (!this.scene.isActive("Overworld")) { this.scene.start("Overworld"); return; }
      this.scene.stop();
    });
  }
}
