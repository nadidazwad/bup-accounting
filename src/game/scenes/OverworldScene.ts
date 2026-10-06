import Phaser from "phaser";
import { Scene, GameObjects, Tilemaps } from "phaser";
import { gameInput, type InputAction } from "../input/router";
import { gameStore, type Species } from "../state/store";
import { FRLG } from "../style/frlg";
import { OverworldMovement } from "../overworld/movement";
import { destination, directionTo, findPath, sameTile, tileKey, vectors, walkable, type Direction, type Grid, type Tile } from "../overworld/navigation";
import { Npc } from "../overworld/npc";
import { parseOpened, pushTarget, spotRewards } from "../overworld/spots";
import { species as speciesData } from "../data/species";
import { items } from "../data/items";
import { chip } from "../audio/chip";
import { TextBox } from "../ui/TextBox";
import { Menu, UiStack, askYesNo } from "../ui/Menu";
import { Window } from "../ui/Window";
import { label, type Ink } from "../ui/text";
import { flash, playCry, reducedMotion, tween, wait } from "./helpers";

type TalkTarget = { tile: Tile; message: string };
type Spot = { id: string; tile: Tile; cover: "tree" | "bush" };
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
  private spots: Spot[] = [];
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
    this.path = []; this.targets = []; this.spots = []; this.npcs = new Map(); this.ui = new UiStack();
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
      if (object.type === "spot") this.spots.push({ id: object.name, tile, cover: props.cover === "tree" ? "tree" : "bush" });
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
    // Tiles of the shared tileset double as sprite frames for cut/push effects.
    const texture = this.textures.get("town-tiles");
    for (const spot of this.spots) {
      const index = this.structures.getTileAt(spot.tile.x, spot.tile.y)?.index ?? 0;
      if (index > 0 && !texture.has(`t${index}`)) texture.add(`t${index}`, 0, ((index - 1) % 16) * 16, Math.floor((index - 1) / 16) * 16, 16, 16);
    }
    // Restore opened spots: cut trees are gone, pushed bushes sit where they slid.
    const opened = parseOpened(state.flags.bushesCut);
    for (const spot of this.spots) {
      if (!opened.has(spot.id)) continue;
      const tileIndex = this.structures.getTileAt(spot.tile.x, spot.tile.y)?.index ?? 0;
      this.structures.removeTileAt(spot.tile.x, spot.tile.y); grid.blocked.delete(tileKey(spot.tile));
      const moved = opened.get(spot.id);
      if (moved && spot.cover === "bush") { this.structures.putTileAt(tileIndex, moved.x, moved.y); grid.blocked.add(tileKey(moved)); this.targets.push({ tile: moved, message: "Just a bush now. Its secrets have been audited." }); }
    }
    for (const def of npcDefs) {
      if (def.name === "auditor" && state.flags.bossBeaten) continue;
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
    this.follower = this.add.sprite(0, 0, "follow-charizard", 0).setOrigin(0.5, 1).setDisplaySize(16, 16);
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
    this.events.on("resume", () => { this.refreshLead(); gameInput.clear(); });
    this.events.once("shutdown", () => {
      unsubscribe(); this.input.off("pointerup", pointer); gameInput.clear(); this.grassEffects.clear(); this.events.off("resume");
      for (const key of ["player", "follower", "moving", "worldX", "worldY", "cameraX", "cameraY", "hop", "party", "locked"]) delete this.game.canvas.dataset[key];
    });
    chip.play("route");
    this.cameras.main.fadeIn(300, 0, 0, 0);
    this.drawActors(0);
    this.game.canvas.dataset.ready = "true";
    gameStore.setGameReady(true);
    if (!state.flags.fieldHintSeen) {
      void this.run(async () => {
        await this.say("Arrows or WASD walk; hold B to run. A talks. ENTER or START opens the menu. You can also tap where to go.");
        await this.say("PROF. LEDGER’s note: Two POKéMON are hiding behind bushes and trees. Find them, then challenge THE AUDITOR up north.");
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
    if ((action === "start" || action === "menu") && !this.movement.busy) { this.path = []; this.openStartMenu(); }
    if (action === "select" && !this.movement.busy) void this.run(() => this.say("Hold B to run. Tap a bush or tree to walk over and inspect it. START opens the menu: SAVE often!"));
  }

  private tryMove(direction: Direction) {
    const moved = this.movement.move(direction, gameInput.isHeld("cancel"));
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
    return this.targets.some(t => sameTile(t.tile, tile)) || this.spotAt(tile) || [...this.npcs.values()].some(n => sameTile(n.tile, tile));
  }
  private spotAt(tile: Tile) {
    const opened = parseOpened(gameStore.getSnapshot().flags.bushesCut);
    return this.spots.find(s => !opened.has(s.id) && sameTile(s.tile, tile));
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
    const spot = this.spotAt(ahead);
    if (spot) { void this.run(() => this.openSpot(spot)); return; }
    const target = this.targets.find(t => sameTile(t.tile, ahead));
    if (target) void this.run(() => this.say(target.message === "@counter" ? this.counterText() : target.message));
  }
  private counterText() {
    const n = gameStore.getSnapshot().party.length;
    return n >= 3 ? "POKéMON FOUND: 3/3. Records complete. THE AUDITOR awaits beyond the gate." : `POKéMON FOUND: ${n}/3. THE AUDITOR only accepts complete records.`;
  }

  private async talkTo(npc: Npc) {
    npc.faceTile(this.movement.player);
    const party = gameStore.getSnapshot().party.length;
    if (npc.name === "guard") {
      if (gameStore.getSnapshot().flags.guardMoved) { await this.say("THE AUDITOR is waiting. Don’t forget to SAVE first!", "blue"); return; }
      if (party < 3) {
        await this.say(`Only trainers with 3 POKéMON may challenge THE AUDITOR. Your party has ${party}.`, "blue");
        await this.say("Rumor has it a couple of POKéMON are hiding behind the bushes and trees around here.", "blue");
        return;
      }
      await this.say("Oh! Three POKéMON. Your books look in order.", "blue");
      await this.say("THE AUDITOR will see you now. Good luck… you’ll need it.", "blue");
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
    if (npc.name === "auditor") { await this.auditorBattle(npc); return; }
    await this.say(npc.message, npc.name === "lass" ? "red" : "blue");
  }

  // ——— Hiding spots (PLAN.md §4.4) ———
  private user(move: "cut" | "strength") {
    const party = gameStore.getSnapshot().party;
    return party.find(s => speciesData[s].hm[move]) ?? "Charizard";
  }

  private async openSpot(spot: Spot) {
    const name = gameStore.getSnapshot().playerName;
    let entry = spot.id;
    if (spot.cover === "tree") {
      if (!(await this.ask("This tree looks like it can be CUT! Would you like to use CUT?"))) return;
      const user = this.user("cut");
      await this.say(`${speciesData[user].name} used CUT!`);
      await this.fieldMoveCutIn(user);
      await this.cutTree(spot);
    } else {
      await this.say("The bush is rustling…");
      if (!(await this.ask("Push it aside?"))) return;
      const npcTiles = [...this.npcs.values()].map(n => n.tile);
      const to = pushTarget(this.movement.grid, spot.tile, this.movement.facing, [...this.movement.occupied(), ...npcTiles]);
      if (!to) { await this.say("The bush won’t budge. Something heavy is wedged behind it."); return; }
      const user = this.user("strength");
      await this.say(`${speciesData[user].name} used STRENGTH!`);
      await this.fieldMoveCutIn(user);
      await this.slideBush(spot, to);
      entry = `${spot.id}:${to.x},${to.y}`;
    }
    gameStore.openSpot(entry);
    const reward = spotRewards[spot.id];
    if (!reward) return;
    if (reward.kind === "species") await this.reveal(spot.tile, reward.species);
    else if (reward.kind === "item") {
      const item = items[reward.item];
      gameStore.addItem(reward.item);
      chip.play("itemGet");
      await this.say(`${name} found a ${item.name}!`);
      await wait(this, 300);
      await this.say(`${name} put the ${item.name} away in the BAG.`);
      for (const line of reward.lines) await this.say(line);
    } else if (reward.kind === "spreadsheet") await this.spreadsheet(spot.tile);
    else for (const line of reward.lines) await this.say(line);
  }

  /** FRLG field-move cut-in: the POKéMON's portrait sweeps across a streaked band. */
  private async fieldMoveCutIn(user: Species) {
    const key = speciesData[user].key;
    const band = this.add.container(0, 0).setScrollFactor(0).setDepth(15000);
    const bg = this.add.rectangle(0, 80, 240, 0, 0x284868).setOrigin(0, 0.5);
    band.add(bg);
    const streaks: GameObjects.Rectangle[] = [];
    for (let i = 0; i < 9; i++) {
      const s = this.add.rectangle(Phaser.Math.Between(0, 240), 52 + i * 7, Phaser.Math.Between(16, 60), 1, 0x88b8e0, 0.8).setOrigin(0, 0.5).setVisible(false);
      streaks.push(s); band.add(s);
    }
    const mon = this.add.image(300, 80, `front-${key}`).setOrigin(0.5);
    band.add(mon);
    const fast = reducedMotion();
    await tween(this, { targets: bg, height: 64, duration: fast ? 1 : 160 });
    streaks.forEach(s => s.setVisible(true));
    const drift = this.time.addEvent({ delay: 16, loop: true, callback: () => streaks.forEach(s => { s.x -= 6; if (s.x + s.width < 0) s.x = 240; }) });
    await tween(this, { targets: mon, x: 120, duration: fast ? 1 : 260, ease: "Cubic.easeOut" });
    playCry(this, key);
    await wait(this, 700);
    await tween(this, { targets: mon, x: -60, duration: fast ? 1 : 220, ease: "Cubic.easeIn" });
    drift.remove();
    streaks.forEach(s => s.setVisible(false));
    await tween(this, { targets: bg, height: 0, duration: fast ? 1 : 140 });
    band.destroy();
  }

  private async cutTree(spot: Spot) {
    const index = this.structures.getTileAt(spot.tile.x, spot.tile.y)?.index ?? 0;
    this.structures.removeTileAt(spot.tile.x, spot.tile.y);
    const x = spot.tile.x * 16, y = spot.tile.y * 16;
    const left = this.add.image(x, y, "town-tiles", `t${index}`).setOrigin(0).setCrop(0, 0, 8, 16).setDepth(y + 16);
    const right = this.add.image(x, y, "town-tiles", `t${index}`).setOrigin(0).setCrop(8, 0, 8, 16).setDepth(y + 16);
    chip.sfx("cut");
    // Four quick frames: shake, split, fall apart, gone.
    for (const dx of [-1, 1]) { left.x = x + dx; right.x = x + dx; await wait(this, 67); }
    left.x = x; right.x = x;
    const leaves = Array.from({ length: 8 }, () => this.add.rectangle(x + 8, y + 6, 2, 2, Phaser.Math.RND.pick([0x58a830, 0x80c848, 0x386820])).setDepth(y + 17));
    leaves.forEach(l => this.tweens.add({ targets: l, x: l.x + Phaser.Math.Between(-14, 14), y: l.y + Phaser.Math.Between(-10, 8), alpha: 0, duration: 420 }));
    await Promise.all([
      tween(this, { targets: left, x: x - 5, angle: -25, alpha: 0, duration: 260 }),
      tween(this, { targets: right, x: x + 5, angle: 25, alpha: 0, duration: 260 }),
    ]);
    left.destroy(); right.destroy(); leaves.forEach(l => l.destroy());
    this.movement.grid.blocked.delete(tileKey(spot.tile));
  }

  private async slideBush(spot: Spot, to: Tile) {
    const index = this.structures.getTileAt(spot.tile.x, spot.tile.y)?.index ?? 0;
    this.structures.removeTileAt(spot.tile.x, spot.tile.y);
    const bush = this.add.image(spot.tile.x * 16, spot.tile.y * 16, "town-tiles", `t${index}`).setOrigin(0).setDepth(spot.tile.y * 16 + 16);
    this.movement.grid.blocked.add(tileKey(to));
    chip.sfx("push");
    // A Strength-boulder slide: one tile in 16 frames, with a little rustle.
    await tween(this, { targets: bush, x: to.x * 16, y: to.y * 16, duration: FRLG.walkTileMs, onUpdate: () => { bush.setAngle(Math.sin(this.time.now / 30) * 3); } });
    bush.destroy();
    this.structures.putTileAt(index, to.x, to.y);
    this.movement.grid.blocked.delete(tileKey(spot.tile));
    this.targets.push({ tile: to, message: "Just a bush now. Its secrets have been audited." });
    chip.sfx("rustle");
  }

  private emote(x: number, y: number, frame = 0) {
    chip.sfx("exclaim");
    const bubble = this.add.image(x, y, "emotes", frame).setOrigin(0.5, 1).setDepth(12000);
    return wait(this, 700).then(() => bubble.destroy());
  }

  private async reveal(tile: Tile, mon: Species) {
    const info = speciesData[mon];
    const px = tile.x * 16 + 8, py = tile.y * 16 + 16;
    const row: Record<Direction, number> = { down: 0, left: 1, right: 2, up: 3 };
    const sprite = this.add.sprite(px, py + 1, `follow-${info.key}`, row[directionTo(tile, this.movement.player)] * 4).setOrigin(0.5, 1).setDepth(py);
    playCry(this, info.key);
    await tween(this, { targets: sprite, y: py - 7, duration: 140, yoyo: true, ease: "Quad.easeOut" });
    const visual = this.movement.visual().player;
    await this.emote(visual.x, visual.y - 30);
    // Wild encounter: two flashes, then the FRLG slice wipe into the battle screen.
    chip.play("wild");
    chip.sfx("encounter");
    await flash(this, 2);
    const bars = await this.sliceWipe();
    const caught = new Promise<void>((resolve) => this.game.events.once("catch-done", () => resolve()));
    this.scene.launch("Catch", { species: mon });
    this.scene.pause();
    await caught;
    sprite.destroy(); bars.destroy();
    gameStore.addToParty(mon);
    chip.play("route");
    this.cameras.main.fadeIn(400, 0, 0, 0);
    await wait(this, 400);
    if (gameStore.getSnapshot().party.length >= 3) {
      await this.say("Your party is complete! The guard by THE AUDITOR’s gate up north should let you through now.");
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

  private async spreadsheet(tile: Tile) {
    // A tiny original sprite: a spreadsheet with eyes, fleeing the scene.
    const x = tile.x * 16 + 8, y = tile.y * 16 + 8;
    const sheet = this.add.container(x, y).setDepth(y + 20);
    sheet.add(this.add.rectangle(0, 0, 14, 12, 0xf8f8f8).setStrokeStyle(1, 0x206838));
    for (const gx of [-2, 3]) sheet.add(this.add.rectangle(gx, 0, 1, 10, 0x58b060));
    for (const gy of [-2, 2]) sheet.add(this.add.rectangle(0, gy, 12, 1, 0x58b060));
    sheet.add(this.add.rectangle(-3, -4, 2, 2, 0x202020)); sheet.add(this.add.rectangle(2, -4, 2, 2, 0x202020));
    await tween(this, { targets: sheet, y: y - 8, duration: 120, yoyo: true });
    const visual = this.movement.visual().player;
    await this.emote(visual.x, visual.y - 30);
    chip.sfx("encounter");
    await this.say("A wild SPREADSHEET appeared!");
    const away = directionTo(this.movement.player, tile);
    chip.sfx("slide");
    await tween(this, { targets: sheet, x: x + vectors[away].x * 200, y: y + vectors[away].y * 200, angle: 360, duration: 700, ease: "Quad.easeIn" });
    sheet.destroy();
    await this.say("…It fled. Probably to a shared drive nobody can find.");
  }

  // ——— THE AUDITOR (the battle itself is M4) ———
  private checkSpotted() {
    const auditor = this.npcs.get("auditor");
    const s = gameStore.getSnapshot();
    if (!auditor || this.locked || s.flags.bossBeaten || !s.flags.guardMoved) return;
    const p = this.movement.player;
    // Line of sight: the Auditor faces down and spots anyone in the next two tiles.
    if (p.x === auditor.tile.x && p.y > auditor.tile.y && p.y - auditor.tile.y <= 2) void this.run(() => this.auditorBattle(auditor));
  }

  private async auditorBattle(auditor: Npc) {
    this.path = [];
    chip.play("spotted");
    await this.emote(auditor.sprite.x, auditor.sprite.y - 30);
    chip.play("auditor");
    while (Math.abs(auditor.tile.y - this.movement.player.y) + Math.abs(auditor.tile.x - this.movement.player.x) > 1) {
      if (!(await auditor.step(directionTo(auditor.tile, this.movement.player), this.movement.occupied()))) break;
    }
    auditor.faceTile(this.movement.player);
    this.movement.facing = directionTo(this.movement.player, auditor.tile);
    await this.say("THE AUDITOR: So you’re the one who’s been CUTTING corners around here.", "blue");
    await this.say("THE AUDITOR: Let’s see your books!", "blue");
    gameStore.setPosition({ ...this.movement.player, facing: this.movement.facing });
    await this.trainerWipe();
    this.scene.start("Battle");
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
    chip.stopMusic();
  }

  // ——— Start menu ———
  private openStartMenu() {
    if (this.locked || this.ui.active) return;
    this.locked = true;
    chip.sfx("menu");
    const s = gameStore.getSnapshot();
    const labels = startItems.map((item, i) => (i === 3 ? s.playerName : item));
    const help = new Window(this, 0, 120, 240, 40).setScrollFactor(0).setDepth(10005);
    const helpText = label(this, 10, 128, "").setMaxWidth(220);
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
      actor.setPosition(p.x, p.y - p.hop - happyHop + (i === 1 ? 1 : 0)).setDepth(p.y);
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
