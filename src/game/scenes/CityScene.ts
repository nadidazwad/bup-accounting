import Phaser from "phaser";
import { gameStore } from "../state/store";
import { gameInput, type InputAction } from "../input/router";
import { chip, type MusicName } from "../audio/chip";
import { RadioPlaylist } from "../audio/radio";
import { GTA2, loadGtaFont } from "../style/gta2";
import { bindInput, reducedMotion, wait } from "./helpers";
import type { CityHudScene } from "./CityHudScene";
import { generateCity, SIZE, WORLD, type CityLayout } from "../city/layout";
import { carVariants, ensureCityTextures, PED_PLAYER, TEX, TILESET } from "../city/textures";
import { BuildingRenderer } from "../city/Buildings";
import { Effects } from "../city/Effects";
import { Vehicles, type Car } from "../city/Vehicles";
import { Peds, PED_RADIUS, stepAnim, type Ped } from "../city/Peds";
import { CopDirector, type Suspect } from "../city/Cops";
import { circleVsGrid, type Contact } from "../city/collide";
import { forwardSpeed, speedOf, damageState } from "../city/car";
import { steerTowards } from "../city/chase";
import { afterPenalty, FRENZY_TARGET, levelWon, multiplier, objective, pointsForHit, wantedLevel } from "../city/rules";

// Level 2 (PLAN.md §7): BROKER CITY. Steal a car, run up 20 victims, get five
// cops on your tail, then drive to THE BROKER's tower.
type Mode = "foot" | "car";
const stations: { name: string; track: MusicName | null; label: string }[] = [
  { name: "BUP FM", track: "bupfm", label: "BUP FM 101.5 · SYNTHS & SPREADSHEETS" },
  { name: "KRUD", track: "krud", label: "KRUD 99.9 · TALK RADIO FOR AUDITORS" },
  { name: "BROKER FM", track: "brokerfm", label: "BROKER FM · GTA RADIO TRACK 3" },
  { name: "OFF", track: null, label: "RADIO OFF" },
];
const radioOff = stations.length - 1;
const krudAds = [
  "KRUD: TIRED OF YOUR BOOKS? BURN THEM. LEGALLY. CONSULT YOUR ACCOUNTANT.",
  "KRUD: THIS HOUR OF TALK RADIO IS FULLY TAX DEDUCTIBLE. PROBABLY.",
  "KRUD: BROKER & SONS. WE LOSE IT SO YOU DON'T HAVE TO.",
];
const dev = process.env.NODE_ENV === "development";
const briefing = [
  "Welcome to Broker City, kid. Out here we settle accounts the old-fashioned way.",
  "1. Steal a car. The orange one at the kerb is unlocked.",
  `2. Run up ${FRENZY_TARGET} victims. Pedestrians. Write them off.`,
  "3. Get 5 cops on your tail at the same time. Make some noise.",
  "4. Then come see me at my tower. Don't keep me waiting.",
];

export class CityScene extends Phaser.Scene {
  private layout!: CityLayout;
  private hud!: CityHudScene;
  private buildings!: BuildingRenderer;
  private fx!: Effects;
  private vehicles!: Vehicles;
  private peds!: Peds;
  private cops!: CopDirector;
  private player!: Ped;
  private mode: Mode = "foot";
  private car: Car | null = null;
  private ready = false;
  private locked = true;
  private paused = false;
  private ended = false;
  private victims = 0;
  private score = 0;
  private fiveCopsSeen = false;
  private won = false;
  private stillT = 0;
  private station = 0;
  private radio = new RadioPlaylist(radioOff);
  private lastRadioCar: Car | null = null;
  private krudT = 0;
  private copsMessageT = 0;
  private everDriven = false;
  private startCar: Car | null = null;
  private camX = 0; private camY = 0; private zoom = 1; private shake = 0;
  private pointer: { x: number; y: number } | null = null;
  private arrow!: Phaser.GameObjects.Image;
  private goalRing!: Phaser.GameObjects.Image;
  private goalGlow!: Phaser.GameObjects.Image;
  private readonly contact: Contact = { hit: false, nx: 0, ny: 0, depth: 0 };
  private readonly suspect: Suspect = { x: 0, y: 0, vx: 0, vy: 0, inCar: false, car: null };
  private telemetry = "";
  private intro = false;

  constructor() { super("City"); }

  init(setup?: { intro?: boolean }) {
    this.intro = !!setup?.intro;
    this.ready = false; this.locked = true; this.paused = false; this.ended = false;
    this.victims = 0; this.score = 0; this.fiveCopsSeen = false; this.won = false; this.mode = "foot"; this.car = null;
    this.stillT = 0; this.everDriven = false; this.telemetry = "";
    this.station = 0; this.radio = new RadioPlaylist(radioOff); this.lastRadioCar = null;
  }

  create() {
    gameStore.setScene("City");
    this.scale.setGameSize(GTA2.width * GTA2.render, GTA2.height * GTA2.render);
    this.cameras.main.setBackgroundColor("#000000");
    void loadGtaFont().then(() => { if (this.sys.isActive() || this.sys.isPaused()) this.build(); });
    this.events.once("shutdown", () => this.teardown());
  }

  private build() {
    const layout = this.layout = generateCity();
    ensureCityTextures(this);
    const solid = (cx: number, cy: number) => cx < 0 || cy < 0 || cx >= SIZE || cy >= SIZE || layout.solid[cy * SIZE + cx] === 1;

    // Ground: a tilemap built from procedurally drawn 2× tiles.
    const map = this.make.tilemap({ data: layout.tiles, tileWidth: TILESET.size, tileHeight: TILESET.size });
    const tiles = map.addTilesetImage(TILESET.key, TILESET.key, TILESET.size, TILESET.size, TILESET.margin, TILESET.spacing)!;
    map.createLayer(0, tiles, 0, 0)!.setScale(1 / TEX).setDepth(0);
    for (const l of layout.lamps) this.add.image(l.x, l.y, "fx-lamp").setBlendMode(Phaser.BlendModes.ADD).setScale(1 / TEX).setDepth(5);
    this.goalGlow = this.add.image(layout.goal.x + layout.goal.w / 2, layout.goal.y + layout.goal.h / 2, "fx-glow").setBlendMode(Phaser.BlendModes.ADD).setDepth(9).setVisible(false).setTint(0xffd040);
    this.goalRing = this.add.image(this.goalGlow.x, this.goalGlow.y, "fx-ring").setDepth(10).setTint(0xf5c518).setVisible(false);

    this.fx = new Effects(this);
    this.vehicles = new Vehicles(this, layout, solid, this.fx);
    const start = layout.spawnCar;
    this.startCar = this.vehicles.add("parked", carVariants.find((v) => v.name === "sport-orange")!, start.x, start.y, start.angle);
    this.peds = new Peds(this, layout, solid);
    this.cops = new CopDirector(this, layout, solid, this.vehicles);
    this.buildings = new BuildingRenderer(this, layout);
    this.player = Peds.make(this, PED_PLAYER);
    this.player.x = layout.spawn.x; this.player.y = layout.spawn.y; this.player.angle = 0;
    this.player.sprite.setDepth(40);
    this.arrow = this.add.image(0, 0, "city-arrow").setScale(2).setDepth(80).setRotation(Math.PI / 2);

    this.vehicles.onCrash = (car, impact, x, y) => this.crash(car, impact, x, y);
    this.vehicles.onExplode = (car) => this.exploded(car);
    this.peds.onHit = (ped, car) => this.pedHit(ped, car);

    this.scene.launch("CityHud");
    this.hud = this.scene.get("CityHud") as CityHudScene;

    bindInput(this, (action, source) => this.onAction(action, source), (x, y) => this.onTap(x, y));
    this.input.on("pointerdown", this.pointerDown, this);
    this.input.on("pointermove", this.pointerMove, this);
    this.input.on("pointerup", this.pointerUp, this);
    this.events.on("pause", () => { chip.engine(null); chip.siren(null); });
    this.events.on("resume", () => { gameStore.setScene("City"); gameInput.clear(); });

    // Initial crowd, on screen and off.
    for (let i = 0; i < 60; i++) this.peds.spawnAround(this.player.x, this.player.y, 0, 900, 20);
    for (let i = 0; i < 8; i++) this.vehicles.spawnTraffic(this.player.x, this.player.y, 200, 1100);

    this.camX = this.player.x; this.camY = this.player.y;
    this.zoom = this.intro && !reducedMotion() ? 0.1 : 0.5;
    this.ready = true;
    this.devHooks();
    void this.opening();
  }

  private async opening() {
    // The camera drops from max zoom-out onto the player on the pavement.
    const zoom = { z: this.zoom };
    await new Promise<void>((resolve) => this.tweens.add({ targets: zoom, z: 1, duration: this.intro && !reducedMotion() ? 3000 : 700, ease: this.intro ? "Sine.easeInOut" : "Cubic.easeOut", onUpdate: () => { this.zoom = zoom.z; }, onComplete: () => resolve() }));
    chip.sfx("pager");
    this.markReady();
    // The phone rings: a proper briefing before the job starts.
    const touch = typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches;
    gameStore.say(`THE BROKER: ${briefing.join(" ")}`);
    this.game.canvas.dataset.cityBriefing = "true";
    await this.hud.brief("INCOMING CALL  ·  BROKER-COM", "JOB 1: HOSTILE TAKEOVER", briefing,
      touch ? "TAP TO ACCEPT THE JOB" : "PRESS E TO ACCEPT THE JOB");
    delete this.game.canvas.dataset.cityBriefing;
    this.locked = false;
    this.hud.pager(touch ? "TAP A CAR TO GET IN. HOLD WHERE YOU WANT TO DRIVE. TAP YOUR CAR TO GET OUT."
      : "E: GET IN/OUT. WASD: DRIVE. SPACE: HANDBRAKE. R: RADIO. H: HORN. ESC: PAUSE.");
  }

  private markReady() {
    this.game.canvas.dataset.ready = "true";
    gameStore.setGameReady(true);
  }

  private teardown() {
    chip.engine(null); chip.siren(null);
    this.input.off("pointerdown", this.pointerDown, this);
    this.input.off("pointermove", this.pointerMove, this);
    this.input.off("pointerup", this.pointerUp, this);
    this.events.off("pause"); this.events.off("resume");
    for (const key of Object.keys(this.game.canvas.dataset)) if (key.startsWith("city")) delete this.game.canvas.dataset[key];
    if (dev) delete (window as unknown as { __bupCity?: unknown }).__bupCity;
    this.scene.stop("CityHud");
  }

  // ——— Input ———
  private onAction(action: InputAction, source: string) {
    if (!this.ready || this.ended) return;
    if (this.hud?.briefingOpen) { if (action === "confirm" || action === "interact") this.hud.briefingInput(); return; }
    if (action === "menu") { this.togglePause(); return; }
    if (this.paused || this.locked) return;
    if (action === "confirm" || action === "interact") {
      // In a car Space is the handbrake, not the door.
      if (this.mode === "car" && source === "Space") return;
      if (this.mode === "car") this.exitCar(); else this.tryEnter();
    } else if (action === "radio" && this.mode === "car") this.cycleRadio();
    else if (action === "horn" && this.mode === "car") { chip.sfx("horn"); this.peds.scare(this.player.x, this.player.y, 140); }
  }

  private pointerDown(p: Phaser.Input.Pointer) { if (this.sys.isActive()) this.pointer = this.worldPoint(p); }
  private pointerMove(p: Phaser.Input.Pointer) { if (this.pointer && p.isDown) this.pointer = this.worldPoint(p); }
  private pointerUp() { this.pointer = null; }
  private worldPoint(p: Phaser.Input.Pointer) { const w = this.cameras.main.getWorldPoint(p.x, p.y); return { x: w.x, y: w.y }; }

  private onTap(x: number, y: number) {
    if (this.hud?.briefingOpen) { this.hud.briefingInput(); return; }
    if (!this.ready || this.locked || this.paused || this.ended) return;
    const w = this.cameras.main.getWorldPoint(x, y);
    // A tap on your own car gets out; a tap on a nearby car gets in.
    if (this.mode === "car" && this.car && Math.hypot(w.x - this.car.x, w.y - this.car.y) < 40 && speedOf(this.car.body) < 80) { this.exitCar(); return; }
    if (this.mode === "foot") {
      const car = this.vehicles.nearestEnterable(w.x, w.y, 40);
      if (car && Math.hypot(car.x - this.player.x, car.y - this.player.y) < 90) this.tryEnter(car);
    }
  }

  private togglePause() {
    this.paused = !this.paused;
    this.hud.pause(this.paused);
    if (this.paused) { chip.engine(null); chip.siren(null); this.tweens.pauseAll(); this.time.paused = true; }
    else { this.tweens.resumeAll(); this.time.paused = false; }
  }

  // ——— Getting in and out ———
  private tryEnter(target?: Car) {
    const car = target ?? this.vehicles.nearestEnterable(this.player.x, this.player.y, 72);
    if (!car) return;
    if (car.hadDriver && car.kind !== "parked") {
      // Carjacking: the driver is dragged out and legs it.
      const side = car.body.angle - Math.PI / 2;
      this.peds.spawnPanicking(car.x + Math.cos(side) * 22, car.y + Math.sin(side) * 22, this.player.x, this.player.y);
      this.hud.pager(car.kind === "cop" ? "YOU STOLE A COP CAR. BOLD." : "GRAND THEFT AUDIT!");
    }
    car.kind = "player"; car.hadDriver = false;
    car.input.throttle = 0; car.input.steer = 0; car.input.handbrake = false;
    this.car = car; this.mode = "car";
    this.player.sprite.setVisible(false);
    chip.sfx("carDoor");
    if (!this.everDriven) this.everDriven = true;
    if (car !== this.lastRadioCar) {
      this.station = this.radio.next();
      this.lastRadioCar = car;
    }
    const station = stations[this.station];
    this.playRadio();
    this.hud.radio(station.label);
  }

  private exitCar() {
    const car = this.car;
    if (!car || speedOf(car.body) > 140) return;
    for (const side of [-1, 1]) {
      const a = car.body.angle + (Math.PI / 2) * side;
      const x = car.x + Math.cos(a) * (car.body.model.width / 2 + 10), y = car.y + Math.sin(a) * (car.body.model.width / 2 + 10);
      circleVsGrid(this.solidFn, x, y, PED_RADIUS, this.contact);
      if (this.contact.hit && side === -1) continue;
      this.player.x = x; this.player.y = y;
      break;
    }
    car.kind = damageState(car.body) === "wrecked" ? "wreck" : "parked";
    car.input.throttle = 0; car.input.steer = 0;
    this.car = null; this.mode = "foot";
    this.player.angle = car.body.angle; this.player.sprite.setVisible(true);
    chip.sfx("carDoor"); chip.engine(null); chip.stopMusic();
  }

  private cycleRadio() {
    this.station = this.radio.cycle() ?? radioOff;
    const s = stations[this.station];
    chip.sfx("static");
    this.playRadio();
    this.hud.radio(s.label);
    if (s.name === "KRUD") { this.hud.pager(krudAds[Math.floor(Math.random() * krudAds.length)]); this.krudT = 25; }
  }

  private playRadio() {
    const station = stations[this.station];
    if (!station.track) { chip.stopMusic(); return; }
    chip.play(station.track, { resume: true, onEnded: () => {
      if (this.mode !== "car" || this.ended || (!this.sys.isActive() && !this.sys.isPaused())) return;
      this.station = this.radio.next();
      this.playRadio();
      this.hud.radio(stations[this.station].label);
    } });
  }

  private readonly solidFn = (cx: number, cy: number) => cx < 0 || cy < 0 || cx >= SIZE || cy >= SIZE || this.layout.solid[cy * SIZE + cx] === 1;

  // ——— Frame ———
  private updateMs = 0;
  update(time: number, delta: number) {
    if (!this.ready || this.paused) return;
    const t0 = performance.now();
    this.frame(time, delta);
    this.updateMs = this.updateMs * 0.95 + (performance.now() - t0) * 0.05;
  }

  private frame(time: number, delta: number) {
    const dt = Math.min(delta / 1000, 1 / 30);
    this.control(dt);
    this.vehicles.step(dt, time / 1000, this.blockedAhead);
    if (this.car) {
      if (this.car.kind !== "player" && this.car.kind !== "wreck") this.car.kind = "player";
      this.player.x = this.car.x; this.player.y = this.car.y;
    }
    const b = this.car?.body;
    const s = this.suspect;
    s.x = this.player.x; s.y = this.player.y; s.vx = b ? b.vx : 0; s.vy = b ? b.vy : 0; s.inCar = this.mode === "car"; s.car = this.car;
    const halfW = GTA2.width / 2 / this.zoom, halfH = GTA2.height / 2 / this.zoom;
    const viewR = Math.hypot(halfW, halfH);
    const level = wantedLevel(this.victims);
    if (!this.ended) this.cops.update(dt, level, s, viewR);
    this.peds.update(dt, this.camX, this.camY, viewR, this.vehicles.cars);
    this.peds.collide(this.vehicles.cars);
    this.cops.collideOfficers(this.vehicles.cars, (o, car) => this.pedHit(o, car));
    this.maintainTraffic(viewR);
    if (!this.ended && !this.locked) this.rules(dt, s);
    this.updateCamera(dt);
    this.buildings.draw(this.camX, this.camY, this.zoom, halfW, halfH, time);
    this.updateArrows(time);
    this.peds.draw(this.player);
    this.audio(s);
    this.hudTick(level);
    this.writeTelemetry(level);
  }

  private control(dt: number) {
    const held = (a: InputAction) => gameInput.isHeld(a);
    if (this.locked || this.ended) {
      if (this.car) { this.car.input.throttle = 0; this.car.input.steer = 0; this.car.input.handbrake = true; }
      return;
    }
    if (this.mode === "car" && this.car) {
      const input = this.car.input;
      input.throttle = (held("up") ? 1 : 0) - (held("down") ? 1 : 0);
      input.steer = (held("right") ? 1 : 0) - (held("left") ? 1 : 0);
      input.handbrake = gameInput.isKeyHeld("Space") || held("run");
      if (this.pointer && !held("up") && !held("down")) {
        // Touch: hold where you want to go; behind you means reverse.
        const b = this.car.body;
        const ahead = Math.cos(Math.atan2(this.pointer.y - b.y, this.pointer.x - b.x) - b.angle);
        input.throttle = ahead > -0.35 ? 1 : -1;
        input.steer = steerTowards(b.x, b.y, b.angle, this.pointer.x, this.pointer.y) * (input.throttle < 0 ? -1 : 1);
      }
      return;
    }
    // On foot.
    let mx = (held("right") ? 1 : 0) - (held("left") ? 1 : 0);
    let my = (held("down") ? 1 : 0) - (held("up") ? 1 : 0);
    if (!mx && !my && this.pointer) {
      const dx = this.pointer.x - this.player.x, dy = this.pointer.y - this.player.y, d = Math.hypot(dx, dy);
      if (d > 8) { mx = dx / d; my = dy / d; }
    }
    const len = Math.hypot(mx, my);
    if (len > 0) {
      this.player.running = held("run") || !!this.pointer;
      const speed = this.player.running ? 150 : 85;
      this.player.x += (mx / len) * speed * dt; this.player.y += (my / len) * speed * dt;
      this.player.angle = Math.atan2(my, mx);
      stepAnim(this.player, speed * dt);
    } else { this.player.anim = 0; this.player.running = false; } // neutral standing pose
    circleVsGrid(this.solidFn, this.player.x, this.player.y, PED_RADIUS, this.contact);
    if (this.contact.hit) { this.player.x += this.contact.nx * this.contact.depth; this.player.y += this.contact.ny * this.contact.depth; }
    // Cars are solid to pedestrians; fast ones are fatal.
    for (const car of this.vehicles.cars) {
      if (!Peds.hits(car, this.player.x, this.player.y)) continue;
      const v = speedOf(car.body);
      if (v > 230 && car.kind !== "parked" && car.kind !== "wreck") { void this.fail("wasted"); return; }
      const dx = this.player.x - car.x, dy = this.player.y - car.y, d = Math.hypot(dx, dy) || 1;
      this.player.x += (dx / d) * 2.5; this.player.y += (dy / d) * 2.5;
    }
  }

  private readonly blockedAhead = (car: Car, ax: number, ay: number) => {
    // Traffic brakes for anything in its path, including you.
    const r = 30;
    if (Math.abs(this.player.x - ax) < r && Math.abs(this.player.y - ay) < r) {
      if (this.mode === "foot" || (this.car && this.car !== car)) { if (Math.random() < 0.004) chip.sfx("horn"); return true; }
    }
    for (const other of this.vehicles.cars) {
      if (other === car) continue;
      if (Math.abs(other.x - ax) < r && Math.abs(other.y - ay) < r) return true;
    }
    for (const p of this.peds.pool.active) {
      if (p.state !== "walk" && p.state !== "panic") continue;
      if (Math.abs(p.x - ax) < 16 && Math.abs(p.y - ay) < 16) return true;
    }
    return false;
  };

  private maintainTraffic(viewR: number) {
    let traffic = 0;
    for (const car of this.vehicles.cars) if (car.kind === "traffic") traffic++;
    for (let i = this.vehicles.cars.length - 1; i >= 0; i--) {
      const car = this.vehicles.cars[i];
      if (car.kind !== "traffic" && car.kind !== "wreck") continue;
      if (Math.hypot(car.x - this.camX, car.y - this.camY) > viewR + 1000) this.vehicles.remove(car);
    }
    if (traffic < 12) this.vehicles.spawnTraffic(this.camX, this.camY, viewR + 60, viewR + 700);
  }

  // ——— Rules ———
  private pedHit(ped: Ped, car: Car) {
    this.fx.splat(ped.x, ped.y, Math.random() * Math.PI * 2);
    this.peds.scare(ped.x, ped.y, 150);
    if (car.kind !== "player") return;
    chip.sfx("thud");
    const before = this.victims;
    this.victims++;
    this.score += pointsForHit(before);
    if (multiplier(this.victims) > multiplier(before)) this.hud.message(`x${multiplier(this.victims)} MULTIPLIER!`, "white", 1400);
    if (wantedLevel(this.victims) > wantedLevel(before)) chip.sfx("exclaim");
    if (this.victims === FRENZY_TARGET) {
      this.score += 5000;
      chip.play("frenzy");
      this.hud.message("FRENZY COMPLETE!", "gold", 2800, "+$5,000");
      this.hud.pager(objective({ victims: this.victims, fiveCopsSeen: this.fiveCopsSeen }), true);
    }
  }

  private crash(car: Car, impact: number, x: number, y: number) {
    if (car !== this.car || car.bumpT < 0.25) return;
    car.bumpT = 0;
    chip.sfx("crash");
    this.fx.sparksAt(x, y, Math.min(14, 4 + impact / 40));
    this.shake = Math.max(this.shake, Math.min(1, impact / 500));
  }

  private exploded(car: Car) {
    chip.sfx("explosion");
    this.hud.flash();
    this.shake = 1;
    this.peds.scare(car.x, car.y, 260);
    for (const p of this.peds.pool.active) {
      if (p.state === "flat" || p.state === "down" || Math.hypot(p.x - car.x, p.y - car.y) > 70) continue;
      const a = Math.atan2(p.y - car.y, p.x - car.x);
      this.peds.knockDown(p, Math.cos(a) * 220, Math.sin(a) * 220);
      this.fx.splat(p.x, p.y, a);
      if (this.car === car || car.kind === "wreck") { this.victims++; this.score += pointsForHit(this.victims - 1); }
    }
    for (const other of this.vehicles.cars) if (other !== car && Math.hypot(other.x - car.x, other.y - car.y) < 90) this.vehicles.damage(other, 420);
    if (car === this.car) {
      this.car = null; this.mode = "foot";
      void this.fail("wasted");
    }
  }

  private rules(dt: number, s: Suspect) {
    const chasing = this.cops.chasing(s);
    this.copsMessageT -= dt;
    if (chasing >= 5 && this.copsMessageT <= 0) {
      this.copsMessageT = 25;
      this.hud.message("COPS ON YOUR TAIL: 5", "blue", 2200);
      if (!this.fiveCopsSeen) {
        this.fiveCopsSeen = true;
        gameStore.setFlag("fiveCopsSeen");
        if (this.victims < FRENZY_TARGET) this.hud.pager(objective({ victims: this.victims, fiveCopsSeen: true }), true);
      }
    }
    if (!this.won && levelWon({ victims: this.victims, fiveCopsSeen: this.fiveCopsSeen })) {
      this.won = true;
      chip.sfx("pager");
      this.hud.pager("GOOD WORK. NOW GET TO THE BROKER'S TOWER.", true);
      this.goalRing.setVisible(true); this.goalGlow.setVisible(true);
    }
    // Officers drag you out if you sit still next to them; on foot, a touch is enough.
    const b = this.car?.body;
    if (this.mode === "car" && b) {
      this.stillT = speedOf(b) < 25 ? this.stillT + dt : 0;
      if (this.stillT > 2 && this.cops.officerWithin(b.x, b.y, b.model.length / 2 + 18)) { void this.fail("busted"); return; }
      if (this.krudT > 0 && stations[this.station].name === "KRUD") {
        this.krudT -= dt;
        if (this.krudT <= 0) { this.krudT = 30; this.hud.pager(krudAds[Math.floor(Math.random() * krudAds.length)]); }
      }
    } else if (this.cops.officerWithin(this.player.x, this.player.y, 16)) { void this.fail("busted"); return; }
    else if (this.mode === "foot") {
      for (const c of this.cops.cars) if (c.kind === "cop" && Peds.hits(c, this.player.x, this.player.y) && speedOf(c.body) < 120) { void this.fail("busted"); return; }
    }
    // The finish line.
    if (this.won) {
      const g = this.layout.goal;
      if (this.player.x > g.x - 8 && this.player.x < g.x + g.w + 8 && this.player.y > g.y - 8 && this.player.y < g.y + g.h + 8) void this.finish();
    }
  }

  private async fail(kind: "busted" | "wasted") {
    if (this.ended) return;
    this.ended = true;
    chip.engine(null); chip.siren(null); chip.stopMusic();
    if (this.car && kind === "busted") { this.car.kind = "parked"; this.car = null; this.mode = "foot"; }
    if (this.car && kind === "wasted") { this.car = null; this.mode = "foot"; }
    this.player.sprite.setVisible(kind === "busted");
    if (kind === "wasted") { this.player.state = "flat"; this.player.sprite.setVisible(true); this.fx.splat(this.player.x, this.player.y, 0); }
    chip.play("busted");
    this.score = afterPenalty(this.score);
    this.hud.message(kind === "busted" ? "BUSTED" : "WASTED", "red", 2400, `-25% SCORE   VICTIMS KEPT: ${this.victims}`);
    gameStore.say(kind === "busted" ? "BUSTED. You lose a quarter of your score." : "WASTED. You lose a quarter of your score.");
    await wait(this, 2600);
    if (!this.sys.isActive()) return;
    this.cameras.main.fadeOut(350, 0, 0, 0);
    await wait(this, 400);
    // Back on the pavement nearby, with a getaway car at the kerb.
    this.cops.standDown(6);
    let best = this.layout.nodes[0], bestD = Infinity;
    for (const n of this.layout.nodes) { const d = Math.hypot(n.x - this.player.x, n.y - this.player.y); if (d > 250 && d < bestD) { bestD = d; best = n; } }
    this.player.x = best.x; this.player.y = best.y; this.player.state = "walk"; this.player.sprite.setVisible(true);
    this.vehicles.parkNear(best.x, best.y);
    this.camX = this.player.x; this.camY = this.player.y;
    this.stillT = 0; this.ended = false;
    this.cameras.main.fadeIn(350, 0, 0, 0);
    this.hud.pager(kind === "busted" ? "THE BROKER: I POSTED YOUR BAIL. EXPENSED IT. GET BACK OUT THERE." : "THE BROKER: WALK IT OFF. THERE'S A CAR AT THE KERB.", true);
  }

  private async finish() {
    if (this.ended) return;
    this.ended = true; this.locked = true;
    chip.engine(null); chip.siren(null);
    chip.play("jobDone");
    this.hud.message("JOB COMPLETE!", "gold", 3000, `FINAL SCORE $${this.score.toLocaleString("en-US")}`);
    gameStore.setCity(this.victims, wantedLevel(this.victims));
    gameStore.say("Job complete! THE BROKER wants a word.");
    await wait(this, 2600);
    this.cameras.main.fadeOut(600, 0, 0, 0);
    await wait(this, 650);
    chip.stopMusic();
    this.scene.start("Finale", { score: this.score, victims: this.victims });
  }

  // ——— Camera, arrows, audio, HUD ———
  private updateCamera(dt: number) {
    const b = this.car?.body;
    const v = b ? speedOf(b) : 0;
    // Look ahead in the direction of travel; zoom out with speed (GTA 2).
    const lx = b ? b.vx * 0.38 : 0, ly = b ? b.vy * 0.38 : 0;
    const k = 1 - Math.exp(-dt * 5);
    this.camX += (this.player.x + lx - this.camX) * k;
    this.camY += (this.player.y + ly - this.camY) * k;
    if (!this.locked) {
      const target = 1 - 0.42 * Math.min(1, Math.max(0, (v - 60) / 380));
      this.zoom += (target - this.zoom) * (1 - Math.exp(-dt * 1.6));
    }
    const halfW = GTA2.width / 2 / this.zoom, halfH = GTA2.height / 2 / this.zoom;
    this.camX = Math.max(halfW, Math.min(WORLD - halfW, this.camX));
    this.camY = Math.max(halfH, Math.min(WORLD - halfH, this.camY));
    let sx = 0, sy = 0;
    if (this.shake > 0.01 && !reducedMotion()) { sx = (Math.random() - 0.5) * 10 * this.shake; sy = (Math.random() - 0.5) * 10 * this.shake; }
    this.shake *= Math.exp(-dt * 7);
    const cam = this.cameras.main;
    cam.setZoom(this.zoom * GTA2.render);
    cam.centerOn(this.camX + sx, this.camY + sy);
  }

  private updateArrows(time: number) {
    let target: { x: number; y: number } | null = null;
    if (this.won) target = { x: this.layout.goal.x + this.layout.goal.w / 2, y: this.layout.goal.y + this.layout.goal.h / 2 };
    else if (this.mode === "foot" && !this.ended) {
      // At the start, the arrow picks out the getaway car at the kerb.
      target = !this.everDriven && this.startCar?.kind === "parked" ? this.startCar : this.vehicles.nearestEnterable(this.player.x, this.player.y, 2000);
    }
    const pulse = 0.75 + 0.25 * Math.sin(time / 300);
    this.goalRing.setScale(3).setAlpha(reducedMotion() ? 1 : 0.6 + 0.4 * pulse);
    this.goalGlow.setScale(3).setAlpha(0.22 + 0.16 * pulse);
    if (!target) { this.arrow.setVisible(false); this.hud.edgeArrow(null); return; }
    const bob = reducedMotion() ? 0 : Math.round(Math.sin(time / 180) * 2) * 3; // stepped bob
    this.arrow.setVisible(true).setPosition(Math.round(target.x), Math.round(target.y - 46 + bob));
    const halfW = GTA2.width / 2 / this.zoom, halfH = GTA2.height / 2 / this.zoom;
    const off = Math.abs(target.x - this.camX) > halfW - 20 || Math.abs(target.y - this.camY) > halfH - 20;
    this.hud.edgeArrow(off ? Math.atan2(target.y - this.camY, target.x - this.camX) : null, time);
  }

  private audio(s: Suspect) {
    if (this.ended || this.locked) { chip.engine(null); chip.siren(null); return; }
    const b = this.car?.body;
    chip.engine(b ? Math.min(1, Math.abs(forwardSpeed(b)) / b.model.maxSpeed) : null);
    let nearest = Infinity;
    for (const c of this.cops.cars) if (c.kind === "cop") nearest = Math.min(nearest, Math.hypot(c.x - s.x, c.y - s.y));
    chip.siren(nearest < 900 ? 1 - nearest / 900 : null);
  }

  private hudTick(level: number) {
    this.hud.setPagerLoop(this.jobText());
    this.hud.setScore(this.score, multiplier(this.victims));
    this.hud.setVictims(this.victims);
    this.hud.setWanted(level);
    this.hud.setArmour(this.car ? this.car.body.health : null);
    if (this.car && damageState(this.car.body) === "burning" && this.car.body.burning < 0.05) this.hud.message("YOUR CAR'S ON FIRE!", "red", 1800, "GET OUT BEFORE IT BLOWS");
    gameStore.setCity(this.victims, level);
  }

  /** The current job, looped on the pager. */
  private jobText() {
    if (this.won) return "JOB: GET TO THE BROKER'S TOWER. FOLLOW THE YELLOW ARROW.  ";
    if (!this.everDriven) return "JOB: STEAL A CAR. THE ORANGE ONE AT THE KERB IS UNLOCKED.  ";
    const cops = this.fiveCopsSeen ? "5 COPS: DONE." : "GET 5 COPS ON YOUR TAIL AT ONCE.";
    if (this.victims < FRENZY_TARGET) return `JOB: RUN UP ${FRENZY_TARGET} VICTIMS (${this.victims}/${FRENZY_TARGET}). ${cops} THEN SEE THE BROKER.  `;
    return `JOB: FRENZY DONE (${this.victims}/${FRENZY_TARGET}). ${cops}  `;
  }

  private writeTelemetry(level: number) {
    const b = this.car?.body;
    const near = this.mode === "foot" && !!this.vehicles.nearestEnterable(this.player.x, this.player.y, 72);
    const values = [this.mode, Math.round(b ? speedOf(b) : 0), this.victims, this.cops.chasing(this.suspect), level, this.won, near, Math.round(this.player.x), Math.round(this.player.y), this.locked];
    const key = values.join("|");
    if (key === this.telemetry) return;
    this.telemetry = key;
    const d = this.game.canvas.dataset;
    d.cityMode = String(values[0]); d.citySpeed = String(values[1]); d.cityVictims = String(values[2]); d.cityCops = String(values[3]);
    d.cityWanted = String(values[4]); d.cityWon = String(values[5]); d.cityNearCar = String(values[6]); d.cityPlayer = `${values[7]},${values[8]}`; d.cityLocked = String(values[9]);
  }

  private devHooks() {
    if (!dev) return;
    (window as unknown as { __bupCity?: unknown }).__bupCity = {
      /** Satisfy the win condition (20 victims, 5 cops seen). */
      win: () => { this.victims = Math.max(this.victims, FRENZY_TARGET); this.fiveCopsSeen = true; },
      /** Teleport the player (or their car) next to the tower's goal. */
      toGoal: (dy = 0) => {
        const g = this.layout.goal, x = g.x + g.w / 2, y = g.y + g.h / 2 + dy;
        if (this.car) { this.car.body.x = x; this.car.body.y = y; this.car.body.vx = 0; this.car.body.vy = 0; }
        this.player.x = x; this.player.y = y;
      },
      victims: (n: number) => { this.victims = n; },
      /** Line the player's car up just behind a walking pedestrian, doing 320 px/s (too close to dodge). */
      ram: () => {
        const ped = this.peds.pool.active.find((p) => p.state === "walk" && Math.hypot(p.x - this.player.x, p.y - this.player.y) < 600);
        if (!ped || !this.car) return false;
        ped.speed = 0;
        // Come up behind them along the pavement they're walking, which is clear of buildings.
        const b = this.car.body, a = ped.angle;
        b.x = ped.x - Math.cos(a) * 36; b.y = ped.y - Math.sin(a) * 36; b.angle = a; b.vx = Math.cos(a) * 320; b.vy = Math.sin(a) * 320;
        return true;
      },
      stats: () => ({ fps: Math.round(this.game.loop.actualFps), updateMs: +this.updateMs.toFixed(2), peds: this.peds.pool.size, cars: this.vehicles.cars.length, cops: this.cops.cars.length + this.cops.officers.length, buildings: this.buildings.drawn }),
    };
  }
}
