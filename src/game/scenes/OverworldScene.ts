import Phaser from "phaser";
import { Scene, GameObjects, Tilemaps } from "phaser";
import { gameInput, type InputAction } from "../input/router";
import { gameStore, type Species } from "../state/store";
import { FRLG } from "../style/frlg";
import { OverworldMovement } from "../overworld/movement";
import { destination, directionTo, findPath, sameTile, tileKey, vectors, walkable, type Direction, type Grid, type Tile } from "../overworld/navigation";
import { Npc } from "../overworld/npc";
import { species as speciesData } from "../data/species";
import { chip } from "../audio/chip";
import { TextBox } from "../ui/TextBox";
import { Menu, UiStack, askYesNo } from "../ui/Menu";
import { Window } from "../ui/Window";
import { label, type Ink } from "../ui/text";
import { flash, playCry, reducedMotion, snapshotTexture, tween, wait } from "./helpers";

type TalkTarget = { tile: Tile; message: string };
type Hidden = { species: Species; tile: Tile; armed: boolean };
const advanceActions: InputAction[] = ["confirm", "cancel", "start", "interact"];
const startItems = ["POKéDEX", "POKéMON", "BAG", "", "SAVE", "OPTION", "EXIT"];
const startHelp = [
  "A device that records POKéMON secrets and their tax brackets.",
  "Check and organize the POKéMON traveling with you.",
  "Equipment, receipts and other questionable paperwork.",
  "Your TRAINER CARD. Strictly business.",
  "Save your game, and your progress, and your receipts.",
  "Adjust the text speed, sound and CRT screen.",
  "Close this menu window.",
];

export class OverworldScene extends Scene {
  private movement!: OverworldMovement;
  private player!: GameObjects.Sprite;
  private follower!: GameObjects.Sprite;
  private shadows!: GameObjects.Ellipse[];
  private grassEffects = new Map<string, GameObjects.Sprite>();
  private textbox!: TextBox;
  private ui = new UiStack();
  private path: Tile[] = [];
  private targets: TalkTarget[] = [];
  private hidden: Hidden[] = [];
  private npcs = new Map<string, Npc>();
  private structures!: Tilemaps.TilemapLayer | Tilemaps.TilemapGPULayer;
  private grass!: Set<string>;
  private pendingTalk: Tile | null = null;
  private debug!: GameObjects.Graphics;
  private interactedHop = 0;
  private lastTelemetry = 0;
  private lastStep = 0;
  private locked = false;
  private menuIndex = 0;
  private lead: Species = "Charizard";
  constructor() { super("Overworld"); }

  create() {
    gameStore.setScene("Overworld");
    this.scale.setGameSize(FRLG.width, FRLG.height);
    this.path = []; this.targets = []; this.hidden = []; this.npcs = new Map(); this.ui = new UiStack();
    this.pendingTalk = null; this.lastTelemetry = 0; this.locked = false; this.grassEffects = new Map();
    const state = gameStore.getSnapshot();
    const map = this.make.tilemap({ key: "town" });
    const tiles = map.addTilesetImage("town", "town-tiles")!;
    map.createLayer("Ground", tiles)!.setDepth(-10);
    this.structures = map.createLayer("Structures", tiles)!.setDepth(-5);
    const grid: Grid = { width: map.width, height: map.height, blocked: new Set(), ledges: new Set() };
    this.grass = new Set();
    map.getLayer("Collision")!.data.forEach((row, y) => row.forEach((tile, x) => { if (tile.index > 0) grid.blocked.add(`${x},${y}`); }));
    map.getLayer("Grass")!.data.forEach((row, y) => row.forEach((tile, x) => { if (tile.index > 0) this.grass.add(`${x},${y}`); }));
    let spawn: Tile = { x: 9, y: 24 }, followerSpawn: Tile = { x: 9, y: 25 };
    const npcDefs: { name: string; tile: Tile; props: Record<string, unknown> }[] = [];
    for (const object of map.getObjectLayer("Objects")!.objects) {
      const tile = { x: Math.round((object.x ?? 0) / 16), y: Math.round((object.y ?? 0) / 16) };
      const props = Object.fromEntries((object.properties ?? []).map((p: { name: string; value: unknown }) => [p.name, p.value]));
      if (object.type === "spawn") { if (object.name === "spawn") spawn = tile; else followerSpawn = tile; }
      if (object.type === "ledge") grid.ledges.add(tileKey(tile));
      if (object.type === "talk") this.targets.push({ tile, message: String(props.message) });
      if (object.type === "npc") npcDefs.push({ name: object.name, tile, props });
      if (object.type === "hidden" && !state.party.includes(props.species as Species)) this.hidden.push({ species: props.species as Species, tile, armed: true });
      if (object.type === "tree") {
        // The taller crown extends above the footprint. Trees and actors sort
        // by their feet, so a nearer crown covers the row behind it.
        const bottom = (object.y ?? 0) + (object.height ?? 48);
        this.add.image(tile.x * 16, bottom, "tree").setOrigin(0, 1).setDepth(bottom - 8);
      }
      if (object.type === "flower" || object.type === "water") {
        const key = object.type;
        if (!this.anims.exists(key)) this.anims.create({ key, frames: this.anims.generateFrameNumbers(key), frameRate: 60 / 16, repeat: -1 });
        this.add.sprite(tile.x * 16, tile.y * 16, key).setOrigin(0).setDepth(key === "flower" ? (tile.y + 1) * 16 - 2 : -8).play(key);
      }
    }
    for (const def of npcDefs) {
      if (def.name === "broker" && state.flags.bossBeaten) continue;
      const moved = def.name === "guard" && state.flags.guardMoved;
      const tile = moved ? { x: 21, y: 4 } : def.tile;
      const npc = new Npc(this, def.name, String(def.props.sprite), tile, moved ? "right" : (def.props.facing as Direction) ?? "down", grid,
        Number(def.props.wander ?? 0), String(def.props.message ?? ""));
      this.npcs.set(def.name, npc);
    }
    // A saved game resumes on its tile, with the follower one step behind.
    let facing: Direction = "down";
    if (state.position && walkable(grid, state.position)) {
      spawn = { x: state.position.x, y: state.position.y }; facing = state.position.facing;
      const behind = [vectors[facing], ...Object.values(vectors)].map((v) => ({ x: spawn.x - v.x, y: spawn.y - v.y })).find((t) => walkable(grid, t));
      if (behind) followerSpawn = behind;
    }
    this.movement = new OverworldMovement(grid, spawn, followerSpawn);
    this.movement.teleport(spawn, followerSpawn, facing);
    this.lastStep = 0;
    this.shadows = [this.add.ellipse(0, 0, 12, 5, 0x395a10, 0.35), this.add.ellipse(0, 0, 16, 6, 0x395a10, 0.35)];
    this.player = this.add.sprite(0, 0, "player", 0).setOrigin(0.5, 1);
    // HGSS followers keep their native 32×32 size.
    this.follower = this.add.sprite(0, 0, "follow-charizard", 0).setOrigin(0.5, 1);
    this.refreshLead();
    if (!this.anims.exists("grass-rustle")) this.anims.create({
      key: "grass-rustle", frames: [1, 2, 3, 4, 0].map(frame => ({ key: "grass-effect", frame })), frameRate: 6,
    });
    this.cameras.main.setBounds(0, 0, map.widthInPixels, map.heightInPixels).setRoundPixels(true);
    this.textbox = new TextBox(this);
    this.debug = this.add.graphics().setDepth(9999).setVisible(false);
    this.debug.lineStyle(1, 0xff4040, 0.6);
    for (const key of grid.blocked) { const [x, y] = key.split(",").map(Number); this.debug.strokeRect(x * 16, y * 16, 16, 16); }
    const unsubscribe = gameInput.subscribe(action => { if (this.sys.isActive()) this.onAction(action); });
    const pointer = (p: Phaser.Input.Pointer) => {
      this.game.canvas.focus({ preventScroll: true });
      if (!this.sys.isActive()) return;
      if (this.ui.active) { this.ui.pointer(p.x, p.y); return; }
      if (this.locked) return;
      const world = this.cameras.main.getWorldPoint(p.x, p.y);
      const tile = { x: Math.floor(world.x / 16), y: Math.floor(world.y / 16) };
      if (sameTile(tile, this.movement.player)) { this.openStartMenu(); return; }
      if (this.interactable(tile)) this.walkToTalk(tile);
      else { this.pendingTalk = null; this.path = findPath(grid, this.movement.player, tile) ?? []; }
    };
    this.input.on("pointerup", pointer);
    this.events.on("resume", () => { gameStore.setScene("Overworld"); this.refreshLead(); gameInput.clear(); });
    this.events.once("shutdown", () => {
      unsubscribe(); this.input.off("pointerup", pointer); gameInput.clear(); this.grassEffects.clear(); this.events.off("resume");
      for (const key of ["player", "follower", "moving", "worldX", "worldY", "cameraX", "cameraY", "hop", "party", "locked"]) delete this.game.canvas.dataset[key];
    });
    // The downloaded Pokémon theme is the Level 1 song.
    chip.play("opening");
    this.time.addEvent({ delay: 2600, loop: true, callback: () => { if (!this.locked) this.rustleHidden(); } });
    this.cameras.main.fadeIn(300, 0, 0, 0);
    this.drawActors(0);
    this.game.canvas.dataset.ready = "true";
    gameStore.setGameReady(true);
    if (!state.flags.fieldHintSeen) {
      void this.run(async () => {
        const touch = typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches;
        await this.say(touch ? "Tap where you want to go. Tap people and signs to talk. Tap yourself to open the menu."
          : "WASD to walk, hold SHIFT to run, E to talk, M for the menu. You can also click where to go.");
        await this.say("PROF. LEDGER’s note: Two POKéMON are hiding in the tall grass. Get close, battle them and catch them. Then challenge THE BROKER up north.");
        gameStore.setFlag("fieldHintSeen");
      });
    }
  }

  // ——— Input ———
  private onAction(action: InputAction) {
    if (action === "debug" && process.env.NODE_ENV === "development") { this.debug.setVisible(!this.debug.visible); return; }
    if (this.ui.active) { this.ui.handle(action); return; }
    if (this.locked) return;
    if (action in vectors) {
      this.path = []; this.pendingTalk = null;
      if (!this.movement.busy) this.tryMove(action as Direction);
    }
    if ((action === "confirm" || action === "interact") && !this.movement.busy) this.interact();
    if (action === "menu" && !this.movement.busy) { this.path = []; this.openStartMenu(); }
    if (action === "select" && !this.movement.busy) void this.run(() => this.say("Hold SHIFT to run. POKéMON hide in tall grass. M opens the menu: SAVE often!"));
  }

  private tryMove(direction: Direction) {
    const moved = this.movement.move(direction, gameInput.isHeld("run"));
    if (moved && this.movement.visual().player.hop === 0) {
      const step = this.movement.occupied().at(-1);
      if (step && Math.abs(step.y - this.movement.player.y) === 2) chip.sfx("hop");
    }
    return moved;
  }

  /** Runs a scripted sequence with free movement locked. */
  private async run(script: () => Promise<void>) {
    if (this.locked) return;
    this.locked = true; this.path = []; this.pendingTalk = null;
    try { await script(); } finally { this.locked = false; gameInput.clear(); }
  }

  private say(text: string, ink: Ink = "gray") {
    return new Promise<void>((resolve) => {
      const release = this.ui.push({
        handle: (a) => { if (advanceActions.includes(a)) this.textbox.advance(); return true; },
        pointer: () => { this.textbox.advance(); return true; },
      });
      void this.textbox.show(text, { ink, onClose: () => { release(); resolve(); } });
    });
  }

  private async ask(text: string, ink: Ink = "gray") {
    let release = () => {};
    const shown = this.textbox.show(text, { ink, keepOpen: true, onClose: () => release() });
    release = this.ui.push({ handle: (a) => { if (advanceActions.includes(a)) this.textbox.advance(); return true; }, pointer: () => { this.textbox.advance(); return true; } });
    await shown;
    const yes = await askYesNo(this, (h) => this.ui.push(h));
    this.textbox.close();
    return yes;
  }

  // ——— Interaction ———
  private interactable(tile: Tile) {
    return this.targets.some(t => sameTile(t.tile, tile)) || [...this.npcs.values()].some(n => sameTile(n.tile, tile));
  }
  private walkToTalk(target: Tile) {
    let best: Tile[] | null = null;
    for (const v of Object.values(vectors)) {
      const goal = { x: target.x + v.x, y: target.y + v.y };
      if (sameTile(goal, this.movement.player)) { best = []; break; }
      const path = findPath(this.movement.grid, this.movement.player, goal);
      if (path && (!best || path.length < best.length)) best = path;
    }
    this.path = best ?? []; this.pendingTalk = best ? target : null;
  }
  private interact() {
    const v = vectors[this.movement.facing], p = this.movement.player;
    const ahead = { x: p.x + v.x, y: p.y + v.y };
    if (sameTile(ahead, this.movement.follower)) {
      this.interactedHop = this.time.now + 350;
      playCry(this, speciesData[this.lead].key);
      void this.run(() => this.say(speciesData[this.lead].happy));
      return;
    }
    const npc = [...this.npcs.values()].find(n => sameTile(n.tile, ahead) && !n.moving);
    if (npc) { void this.run(() => this.talkTo(npc)); return; }
    const target = this.targets.find(t => sameTile(t.tile, ahead));
    if (target) void this.run(() => this.say(target.message === "@counter" ? this.counterText() : target.message));
  }
  private counterText() {
    const n = gameStore.getSnapshot().party.length;
    return n >= 3 ? "POKéMON FOUND: 3/3. Records complete. THE BROKER awaits beyond the gate." : `POKéMON FOUND: ${n}/3. THE BROKER only deals with complete portfolios.`;
  }

  private async talkTo(npc: Npc) {
    npc.faceTile(this.movement.player);
    const party = gameStore.getSnapshot().party.length;
    if (npc.name === "guard") {
      if (gameStore.getSnapshot().flags.guardMoved) { await this.say("THE BROKER is waiting. Don’t forget to SAVE first!", "blue"); return; }
      if (party < 3) {
        await this.say(`Only trainers with 3 POKéMON may challenge THE BROKER. Your party has ${party}.`, "blue");
        await this.say("Rumor has it a couple of POKéMON are hiding in the tall grass around here.", "blue");
        return;
      }
      await this.say("Oh! Three POKéMON. Your books look in order.", "blue");
      await this.say("THE BROKER will see you now. Good luck… you’ll need it.", "blue");
      // The guard steps aside: up into the clearing, then left out of the gap.
      if (!(await npc.step("up", this.movement.occupied()))) return;
      if (!(await npc.step("left", this.movement.occupied()))) {
        await npc.step("down", this.movement.occupied());
        return;
      }
      npc.face("right");
      gameStore.setFlag("guardMoved");
      return;
    }
    if (npc.name === "broker") { await this.brokerBattle(npc); return; }
    await this.say(npc.message, npc.name === "lass" ? "red" : "blue");
  }

  // ——— POKéMON hiding in the tall grass (PLAN.md Revision 2) ———
  /** Walking within two tiles of a hidden POKéMON makes it pop out and battle. */
  private checkHidden() {
    const p = this.movement.player;
    for (const h of this.hidden) {
      const distance = Math.abs(h.tile.x - p.x) + Math.abs(h.tile.y - p.y);
      if (!h.armed) { if (distance > 3) h.armed = true; continue; }
      if (distance <= 2) { void this.run(() => this.wildEncounter(h)); return; }
    }
  }

  /** The grass over a hidden POKéMON twitches now and then: a hint, not a spoiler. */
  private rustleHidden() {
    for (const h of this.hidden) {
      if (this.grassEffects.has(tileKey(h.tile))) continue;
      const fx = this.add.sprite(h.tile.x * 16, h.tile.y * 16, "grass-effect", 1).setOrigin(0).setDepth((h.tile.y + 1) * 16 + 1).play("grass-rustle");
      fx.once("animationcomplete", () => fx.destroy());
    }
  }

  private emote(x: number, y: number, frame = 0) {
    chip.sfx("exclaim");
    const bubble = this.add.image(x, y, "emotes", frame).setOrigin(0.5, 1).setDepth(12000);
    return wait(this, 700).then(() => bubble.destroy());
  }

  private battle(kind: "wild" | "trainer", foe: string[]) {
    const done = new Promise<string>((resolve) => this.game.events.once("battle-done", (result: string) => resolve(result)));
    this.scene.launch("Battle", { kind, foe });
    this.scene.pause();
    return done;
  }

  private async wildEncounter(h: Hidden) {
    this.path = [];
    const info = speciesData[h.species];
    const px = h.tile.x * 16 + 8, py = h.tile.y * 16 + 16;
    const row: Record<Direction, number> = { down: 0, left: 1, right: 2, up: 3 };
    const sprite = this.add.sprite(px, py + 1, `follow-${info.key}`, row[directionTo(h.tile, this.movement.player)] * 4).setOrigin(0.5, 1).setDepth(py);
    chip.sfx("rustle");
    playCry(this, info.key);
    await tween(this, { targets: sprite, y: py - 9, duration: 150, yoyo: true, ease: "Quad.easeOut" });
    const visual = this.movement.visual().player;
    this.movement.facing = directionTo(this.movement.player, h.tile);
    await this.emote(visual.x, visual.y - 30);
    chip.play("wild");
    chip.sfx("encounter");
    await flash(this, 2);
    const bars = await this.sliceWipe();
    const result = await this.battle("wild", [h.species]);
    bars.destroy(); sprite.destroy();
    h.armed = false;
    if (result === "caught") this.hidden = this.hidden.filter((x) => x !== h);
    this.refreshLead();
    chip.play("opening");
    this.cameras.main.fadeIn(400, 0, 0, 0);
    await wait(this, 400);
    if (result === "run") await this.say(`${info.name} dove back into the grass. It’s still around here somewhere…`);
    if (result === "lose") await this.say(`${info.name} is still hiding in the grass. Catch your breath and try again.`);
    if (result === "caught" && gameStore.getSnapshot().party.length >= 3) {
      await this.say("Your party is complete! The guard by THE BROKER’s gate up north should let you through now.");
    }
  }

  private async sliceWipe() {
    const bars = this.add.container(0, 0).setScrollFactor(0).setDepth(16000);
    const rows = 16, h = 160 / rows, duration = reducedMotion() ? 1 : 420;
    const tweens: Promise<void>[] = [];
    for (let i = 0; i < rows; i++) {
      const fromLeft = i % 2 === 0;
      const bar = this.add.rectangle(fromLeft ? -240 : 240, i * h, 240, h, 0x000000).setOrigin(0);
      bars.add(bar);
      tweens.push(tween(this, { targets: bar, x: 0, duration, delay: i * 12, ease: "Quad.easeIn" }));
    }
    await Promise.all(tweens);
    return bars;
  }

  // ——— THE BROKER ———
  private checkSpotted() {
    const broker = this.npcs.get("broker");
    const s = gameStore.getSnapshot();
    if (!broker || this.locked || s.flags.bossBeaten || !s.flags.guardMoved) return;
    const p = this.movement.player;
    // Line of sight: THE BROKER faces down and spots anyone in the next two tiles.
    if (p.x === broker.tile.x && p.y > broker.tile.y && p.y - broker.tile.y <= 2) void this.run(() => this.brokerBattle(broker));
  }

  private async brokerBattle(broker: Npc) {
    this.path = [];
    chip.play("spotted");
    await this.emote(broker.sprite.x, broker.sprite.y - 30);
    chip.play("auditor");
    while (Math.abs(broker.tile.y - this.movement.player.y) + Math.abs(broker.tile.x - this.movement.player.x) > 1) {
      if (!(await broker.step(directionTo(broker.tile, this.movement.player), this.movement.occupied()))) break;
    }
    broker.faceTile(this.movement.player);
    this.movement.facing = directionTo(this.movement.player, broker.tile);
    const losses = gameStore.getSnapshot().flags.brokerLosses;
    if (losses) await this.say("THE BROKER: Back for another margin call? Fine. Let’s trade.", "blue");
    else {
      await this.say("THE BROKER: So you’re the one who’s been cornering the market around here.", "blue");
      await this.say("THE BROKER: Let’s see if your portfolio can take a crash!", "blue");
    }
    gameStore.setPosition({ ...this.movement.player, facing: this.movement.facing });
    const wipe = await this.trainerWipe();
    const result = await this.battle("trainer", ["Caterpie", "Bayleef", "Blastoise"]);
    wipe.destroy();
    if (result === "win") {
      // Level 1 is done. THE BROKER has one more thing to say, then the
      // music sags, the frame is captured and the cartridge breaks (PLAN.md §6).
      this.locked = true;
      chip.play("opening");
      this.cameras.main.fadeIn(400, 0, 0, 0);
      await wait(this, 400);
      await this.say("THE BROKER: Heh. Not bad, kid. But this little town? This was the tutorial.", "blue");
      await this.say("THE BROKER: Let me show you how we do business in MY city.", "blue");
      await snapshotTexture(this, "glitch-snap");
      this.scene.start("Glitch", { snapshot: true });
      return;
    }
    chip.play("opening");
    this.cameras.main.fadeIn(400, 0, 0, 0);
    await wait(this, 400);
    await this.say("THE BROKER: Come back when your numbers add up.", "blue");
  }

  private async trainerWipe() {
    // FRLG trainer transition: a black clock-wipe sweeps the field away.
    const g = this.add.graphics().setScrollFactor(0).setDepth(16000);
    const state = { angle: 0 };
    await flash(this, 1);
    await tween(this, {
      targets: state, angle: 360, duration: reducedMotion() ? 1 : 700, ease: "Sine.easeIn",
      onUpdate: () => { g.clear().fillStyle(0x000000).slice(120, 80, 160, Phaser.Math.DegToRad(-90), Phaser.Math.DegToRad(-90 + state.angle), false).fillPath(); },
    });
    return g;
  }

  // ——— Start menu ———
  private openStartMenu() {
    if (this.locked || this.ui.active) return;
    this.locked = true;
    chip.sfx("menu");
    const s = gameStore.getSnapshot();
    const labels = startItems.map((item, i) => (i === 3 ? s.playerName : item));
    const help = new Window(this, 0, 120, 240, 40).setScrollFactor(0).setDepth(10005);
    const helpText = label(this, 10, 6, "", "small").setMaxWidth(220);
    help.add(helpText);
    let release = () => {};
    const close = () => { release(); menu.destroy(); help.destroy(); this.locked = false; gameInput.clear(); };
    const describe = (i: number) => helpText.setText(startHelp[i]);
    const menu: Menu = new Menu(this, {
      x: 152, y: 0, width: 88, items: labels, cursor: this.menuIndex,
      onMove: (i) => { this.menuIndex = i; describe(i); },
      onCancel: close,
      onSelect: (i) => {
        this.menuIndex = i;
        if (i === 6) { close(); return; }
        if (i === 4) { void this.saveDialog(close); return; }
        this.scene.launch(["Dex", "Party", "Bag", "Card", "", "Option"][i], { from: "Overworld" });
        this.scene.pause();
      },
    });
    describe(menu.index);
    release = this.ui.push({ handle: (a) => menu.handle(a), pointer: (x, y) => { if (!menu.pointer(x, y)) close(); return true; } });
  }

  private async saveDialog(closeMenu: () => void) {
    const s = gameStore.getSnapshot();
    const info = new Window(this, 0, 0, 128, 88).setScrollFactor(0).setDepth(10020);
    const rows: [string, string][] = [["PLAYER", s.playerName], ["BADGES", "0"], ["POKéDEX", String(s.seen.length)], ["TIME", formatTime(s.playMs)]];
    info.add(label(this, 10, 6, "PALLET OFFICE", "blue"));
    rows.forEach(([k, v], i) => { info.add(label(this, 10, 22 + i * 15, k)); info.add(label(this, 118, 22 + i * 15, v).setOrigin(1, 0)); });
    const yes = await this.ask("Would you like to save the game?");
    if (yes) {
      gameStore.setPosition({ ...this.movement.player, facing: this.movement.facing });
      const done = this.say("SAVING… DON’T TURN OFF THE POWER.");
      await wait(this, 900);
      const ok = gameStore.save();
      this.textbox.close();
      await done;
      chip.play("save");
      await this.say(ok ? `${s.playerName} saved the game.` : "The save failed. This browser isn’t storing data right now.");
    }
    info.destroy();
    closeMenu();
  }

  private refreshLead() {
    const lead = gameStore.getSnapshot().party[0] ?? "Charizard";
    if (lead !== this.lead || this.follower.texture.key !== `follow-${speciesData[lead].key}`) {
      this.lead = lead;
      this.follower.setTexture(`follow-${speciesData[lead].key}`, 0);
    }
  }

  // ——— Frame update ———
  update(time: number, delta: number) {
    this.textbox?.update(time, delta);
    if (!this.movement) return;
    gameStore.tick(delta);
    this.movement.update(delta);
    const idle = !this.locked && !this.ui.active;
    for (const npc of this.npcs.values()) npc.update(delta, idle, () => this.movement.occupied());
    if (!this.movement.busy && idle) {
      const held = (Object.keys(vectors) as Direction[]).find(d => gameInput.isHeld(d));
      const next = this.path[0];
      if (held) this.tryMove(held);
      else if (next) {
        const direction = directionTo(this.movement.player, next);
        // Recompute if a click arrived while the preceding step was finishing.
        if (!sameTile(destination(this.movement.grid, this.movement.player, direction) ?? this.movement.player, next)) this.path = findPath(this.movement.grid, this.movement.player, this.path.at(-1)!) ?? [];
        else if (this.tryMove(direction)) this.path.shift();
        else this.path = [];
      } else if (this.pendingTalk) {
        this.movement.facing = directionTo(this.movement.player, this.pendingTalk);
        this.pendingTalk = null; this.interact();
      }
    }
    if (this.lastStep !== this.movement.completedSteps) {
      this.lastStep = this.movement.completedSteps;
      gameStore.setPosition({ ...this.movement.player, facing: this.movement.facing });
      this.checkSpotted();
      this.checkHidden();
    }
    this.drawActors(time);
  }

  private updateGrassEffects(positions: readonly { x: number; y: number }[]) {
    const touching = new Set<string>();
    for (const p of positions) {
      // Include both tiles while feet straddle an edge. Art stays on the map,
      // rather than moving with the actor or spilling over the path boundary.
      for (let y = Math.floor((p.y - 6) / 16); y <= Math.floor((p.y - 1) / 16); y++) {
        for (let x = Math.floor((p.x - 6) / 16); x <= Math.floor((p.x + 5) / 16); x++) {
          const key = `${x},${y}`;
          if (!this.grass.has(key)) continue;
          touching.add(key);
          if (!this.grassEffects.has(key)) {
            const effect = this.add.sprite(x * 16, y * 16, "grass-effect", 0)
              .setOrigin(0).setDepth((y + 1) * 16 + 1).play("grass-rustle");
            this.grassEffects.set(key, effect);
          }
        }
      }
    }
    for (const [key, effect] of this.grassEffects) {
      if (!touching.has(key) && !effect.anims.isPlaying) {
        effect.destroy(); this.grassEffects.delete(key);
      }
    }
  }

  private drawActors(time: number) {
    const m = this.movement, visual = m.visual();
    const actors = [this.player, this.follower]; const positions = [visual.player, visual.follower];
    actors.forEach((actor, i) => {
      const p = positions[i]; const happyHop = i === 1 && time < this.interactedHop ? Math.round(Math.sin((1 - (this.interactedHop - time) / 350) * Math.PI) * 4) : 0;
      // HGSS followers are 32×32 with their feet on the tile's bottom row.
      // A 32×32 follower never hides the player: when the sprites overlap it sorts behind.
      const overlapping = i === 1 && Math.abs(p.x - visual.player.x) < 16 && Math.abs(p.y - visual.player.y) < 24;
      actor.setPosition(p.x, p.y - p.hop - happyHop + (i === 1 ? 1 : 0)).setDepth(overlapping ? Math.min(p.y, visual.player.y - 1) : p.y);
      this.shadows[i].setPosition(p.x, p.y - 2).setDepth(p.y - 1).setVisible(p.hop > 0 || happyHop > 0);
    });
    this.updateGrassEffects(positions.filter((p, i) => p.hop === 0 && (i !== 1 || time >= this.interactedHop)));
    const walk = visual.playerMoving, half = visual.progress < 0.5 ? 0 : 1;
    const playerFrames: Record<Direction, number[]> = { down: [0, 3, 4], up: [1, 5, 6], left: [2, 7, 8], right: [2, 7, 8] };
    // Native walking alternates a foot frame and idle, then the other foot and idle.
    const runBase = { down: 9, up: 12, left: 15, right: 15 }[m.facing];
    const frame = visual.running
      ? runBase + (visual.progress < 5 / 8 ? 0 : 1 + m.completedSteps % 2)
      : playerFrames[m.facing][walk && half === 0 ? 1 + m.completedSteps % 2 : 0];
    this.player.setFrame(frame).setFlipX(m.facing === "right");
    const row: Record<Direction, number> = { down: 0, left: 1, right: 2, up: 3 };
    this.follower.setFrame(row[m.followerFacing] * 4 + (visual.moving ? half + 1 : Math.floor(time / 250) % 2 * 3));
    // Explicit integer scroll avoids fractional camera interpolation.
    this.cameras.main.setScroll(
      Math.max(0, Math.min(m.grid.width * 16 - 240, Math.round(visual.player.x - 120))),
      Math.max(0, Math.min(m.grid.height * 16 - 160, Math.round(visual.player.y - 88))),
    );
    if (process.env.NODE_ENV === "development" && time - this.lastTelemetry >= 80) {
      this.lastTelemetry = time;
      Object.assign(this.game.canvas.dataset, { player: tileKey(m.player), follower: tileKey(m.follower), moving: String(m.busy), worldX: String(visual.player.x), worldY: String(visual.player.y), cameraX: String(Math.round(this.cameras.main.scrollX)), cameraY: String(Math.round(this.cameras.main.scrollY)), hop: String(visual.player.hop), party: gameStore.getSnapshot().party.join(","), locked: String(this.locked || this.ui.active) });
    }
  }
}

function formatTime(ms: number) {
  const minutes = Math.floor(ms / 60000);
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`;
}
