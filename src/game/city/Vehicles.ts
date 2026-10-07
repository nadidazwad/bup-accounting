// Every car in BROKER CITY: parked, traffic, cops, the player's and wrecks.
// Physics is the pure stepCar(); this file adds AI inputs, collisions,
// damage states and sprites.
import Phaser from "phaser";
import { burn, createCar, damageCar, damageState, forwardSpeed, lateralSpeed, models, speedOf, stepCar, wrapAngle, type CarBody, type CarInput } from "./car";
import { circleVsGrid, type Contact, type Solid } from "./collide";
import { BLOCKS, CELL, PERIOD, ROAD, laneCentre, type CityLayout, type Dir, dirVec } from "./layout";
import { carFrame, carVariants, civilianVariants, TEX, type CarVariant } from "./textures";
import { steerTowards } from "./chase";
import type { Effects } from "./Effects";

export type CarKind = "parked" | "traffic" | "cop" | "player" | "wreck";
const ROAD_PX = PERIOD * CELL; // 512

type TrafficAi = { dir: Dir; turning: boolean; nextDir: Dir; exitX: number; exitY: number; decided: number; wait: number };

export class Car {
  readonly input: CarInput = { throttle: 0, steer: 0, handbrake: false };
  readonly ai: TrafficAi = { dir: 0, turning: false, nextDir: 0, exitX: 0, exitY: 0, decided: -1, wait: 0 };
  kind: CarKind = "parked";
  lights = 0;
  smokeT = 0;
  stuckT = 0;
  reverseT = 0;
  hadDriver = false;
  /** Seconds since this car last hit something hard (for sound throttling). */
  bumpT = 0;
  constructor(public body: CarBody, public variant: CarVariant, public readonly sprite: Phaser.GameObjects.Image) {}
  get x() { return this.body.x; }
  get y() { return this.body.y; }
}

export type CrashEvent = (car: Car, impact: number, x: number, y: number) => void;

export class Vehicles {
  readonly cars: Car[] = [];
  private readonly contact: Contact = { hit: false, nx: 0, ny: 0, depth: 0 };
  onCrash: CrashEvent = () => {};
  onExplode: (car: Car) => void = () => {};
  private sirenT = 0;

  constructor(private readonly scene: Phaser.Scene, private readonly layout: CityLayout, private readonly solid: Solid, private readonly fx: Effects) {
    for (const p of layout.parked) this.add("parked", civilianVariants[Math.floor(Math.random() * civilianVariants.length)], p.x, p.y, p.angle);
  }

  add(kind: CarKind, variant: CarVariant, x: number, y: number, angle: number) {
    const sprite = this.scene.add.image(x, y, "city-cars", carFrame(variant.name, false)).setScale(1 / TEX).setDepth(30);
    const car = new Car(createCar(models[variant.model], x, y, angle), variant, sprite);
    car.kind = kind;
    this.cars.push(car);
    this.sync(car);
    return car;
  }

  remove(car: Car) {
    const i = this.cars.indexOf(car);
    if (i >= 0) { this.cars[i] = this.cars[this.cars.length - 1]; this.cars.pop(); }
    car.sprite.destroy();
  }

  /** Swaps the model when a cop car is spawned into a recycled civilian slot etc. */
  restyle(car: Car, variant: CarVariant) {
    car.variant = variant;
    car.body = createCar(models[variant.model], car.body.x, car.body.y, car.body.angle);
  }

  // ——— Traffic ———
  spawnTraffic(cx: number, cy: number, minR: number, maxR: number) {
    return this.spawnOnRoad("traffic", null, cx, cy, minR, maxR);
  }

  /** Drops a car into a random lane between minR and maxR from a point. */
  spawnOnRoad(kind: CarKind, fixed: CarVariant | null, cx: number, cy: number, minR: number, maxR: number) {
    for (let attempt = 0; attempt < 12; attempt++) {
      const vertical = Math.random() < 0.5;
      const road = Math.floor(Math.random() * (BLOCKS + 1));
      const dir: Dir = vertical ? (Math.random() < 0.5 ? 0 : 2) : (Math.random() < 0.5 ? 1 : 3);
      const lane = laneCentre(road, dir);
      // A point along the road, between intersections.
      const along = (vertical ? cy : cx) + (Math.random() * 2 - 1) * maxR;
      const block = Math.floor(along / ROAD_PX);
      if (block < 0 || block >= BLOCKS) continue;
      const pos = block * ROAD_PX + ROAD * CELL + 40 + Math.random() * (ROAD_PX - ROAD * CELL - 80);
      const x = vertical ? lane : pos, y = vertical ? pos : lane;
      const d = Math.hypot(x - cx, y - cy);
      if (d < minR || d > maxR) continue;
      if (this.cars.some((c) => Math.abs(c.x - x) < 80 && Math.abs(c.y - y) < 80)) continue;
      const variant = fixed ?? civilianVariants[Math.floor(Math.random() * civilianVariants.length)];
      const car = this.add(kind, variant, x, y, dirAngle(dir));
      car.hadDriver = true;
      car.ai.dir = dir; car.ai.turning = false; car.ai.decided = -1;
      const speed = 120;
      car.body.vx = dirVec[dir].x * speed; car.body.vy = dirVec[dir].y * speed;
      return car;
    }
    return null;
  }

  private drive(car: Car, dt: number, obstacles: (car: Car, aheadX: number, aheadY: number) => boolean) {
    const ai = car.ai, b = car.body, input = car.input;
    const v = dirVec[ai.dir];
    // Next intersection along the direction of travel.
    if (!ai.turning) {
      const along = ai.dir === 0 || ai.dir === 2 ? b.y : b.x;
      const k = ai.dir === 1 || ai.dir === 2 ? Math.floor(along / ROAD_PX) + 1 : Math.floor((along - ROAD * CELL) / ROAD_PX);
      const entry = ai.dir === 1 || ai.dir === 2 ? k * ROAD_PX : k * ROAD_PX + ROAD * CELL;
      const distance = (entry - along) * (ai.dir === 1 || ai.dir === 2 ? 1 : -1);
      if (distance < 40 && ai.decided !== k) {
        ai.decided = k;
        const cross = ai.dir === 0 || ai.dir === 2 ? Math.round((b.x - 2 * CELL) / ROAD_PX) : Math.round((b.y - 2 * CELL) / ROAD_PX);
        const options: Dir[] = [];
        // Intersection coordinates: (vertical road index, horizontal road index).
        const vertical = ai.dir === 0 || ai.dir === 2;
        const ix = vertical ? cross : k, iy = vertical ? k : cross;
        const can = (d: Dir) => ix >= 0 && iy >= 0 && ix <= BLOCKS && iy <= BLOCKS
          && (d === 0 ? iy > 0 : d === 2 ? iy < BLOCKS : d === 3 ? ix > 0 : ix < BLOCKS);
        for (const d of [ai.dir, ((ai.dir + 1) % 4) as Dir, ((ai.dir + 3) % 4) as Dir]) if (can(d)) options.push(d);
        const straight = options.includes(ai.dir) && Math.random() < 0.55;
        const next = straight ? ai.dir : options[Math.floor(Math.random() * options.length)] ?? ai.dir;
        if (next !== ai.dir) {
          ai.turning = true; ai.nextDir = next;
          const boxX = ix * ROAD_PX, boxY = iy * ROAD_PX;
          if (next === 0 || next === 2) { ai.exitX = laneCentre(boxX / ROAD_PX, next); ai.exitY = next === 2 ? boxY + ROAD * CELL + 30 : boxY - 30; }
          else { ai.exitY = laneCentre(boxY / ROAD_PX, next); ai.exitX = next === 1 ? boxX + ROAD * CELL + 30 : boxX - 30; }
        }
      }
    }
    let tx: number, ty: number, target = 140;
    if (ai.turning) {
      tx = ai.exitX; ty = ai.exitY; target = 85;
      const nv = dirVec[ai.nextDir];
      if ((b.x - ai.exitX) * nv.x + (b.y - ai.exitY) * nv.y > -6 || Math.hypot(b.x - ai.exitX, b.y - ai.exitY) < 18) { ai.turning = false; ai.dir = ai.nextDir; ai.decided = -1; }
    } else {
      const lane = laneCentre(Math.round((ai.dir === 0 || ai.dir === 2 ? b.x - 2 * CELL : b.y - 2 * CELL) / ROAD_PX), ai.dir);
      tx = ai.dir === 0 || ai.dir === 2 ? lane : b.x + v.x * 90;
      ty = ai.dir === 0 || ai.dir === 2 ? b.y + v.y * 90 : lane;
    }
    input.steer = steerTowards(b.x, b.y, b.angle, tx, ty);
    const ahead = 46 + Math.max(0, forwardSpeed(b)) * 0.35;
    const blocked = obstacles(car, b.x + Math.cos(b.angle) * ahead, b.y + Math.sin(b.angle) * ahead);
    const speed = forwardSpeed(b);
    input.handbrake = false;
    if (blocked) { input.throttle = speed > 10 ? -1 : 0; ai.wait += dt; }
    else { input.throttle = speed < target - 8 ? 0.8 : speed > target + 15 ? -0.4 : 0; ai.wait = 0; }
  }

  // ——— Simulation ———
  step(dt: number, time: number, obstacles: (car: Car, aheadX: number, aheadY: number) => boolean) {
    this.sirenT += dt;
    const flip = this.sirenT > 0.28;
    if (flip) this.sirenT = 0;
    for (const car of this.cars) {
      const b = car.body;
      car.bumpT += dt;
      if (car.kind === "traffic") this.drive(car, dt, obstacles);
      else if (car.kind === "parked" || car.kind === "wreck") { car.input.throttle = 0; car.input.steer = 0; car.input.handbrake = true; }
      if (car.kind === "wreck") { b.vx *= Math.exp(-4 * dt); b.vy *= Math.exp(-4 * dt); b.x += b.vx * dt; b.y += b.vy * dt; }
      else stepCar(b, car.input, dt);
      this.collideGrid(car);
      if (car.kind === "cop" && flip) car.lights ^= 1;
      // Damage: smoke, then fire, then the bang.
      const state = damageState(b);
      if (state === "smoking" || state === "burning") {
        car.smokeT -= dt;
        if (car.smokeT <= 0) {
          car.smokeT = state === "burning" ? 0.05 : 0.12;
          const bx = b.x + Math.cos(b.angle) * b.model.length * 0.35, by = b.y + Math.sin(b.angle) * b.model.length * 0.35;
          this.fx.smokeAt(bx, by);
          if (state === "burning") this.fx.fireAt(bx + (Math.random() - 0.5) * 10, by + (Math.random() - 0.5) * 10, 2);
        }
      }
      if (burn(b, dt)) this.explode(car);
      // Handbrake turns and hard slides leave rubber on the road.
      if (car.kind === "player" && Math.abs(lateralSpeed(b)) > 140 && speedOf(b) > 120 && ((time * 30) | 0) % 2 === 0) {
        for (const side of [-1, 1]) {
          const rx = b.x - Math.cos(b.angle) * b.model.length * 0.32 - Math.sin(b.angle) * side * b.model.width * 0.38;
          const ry = b.y - Math.sin(b.angle) * b.model.length * 0.32 + Math.cos(b.angle) * side * b.model.width * 0.38;
          this.fx.skid(rx, ry, b.angle);
        }
      }
    }
    this.collideCars();
    for (const car of this.cars) this.sync(car);
  }

  explode(car: Car) {
    car.body.health = 0; car.body.burning = 0;
    car.kind = "wreck";
    this.fx.explosion(car.x, car.y);
    this.onExplode(car);
  }

  damage(car: Car, impact: number) {
    if (car.kind === "wreck") return;
    damageCar(car.body, impact);
  }

  private collideGrid(car: Car) {
    const b = car.body, m = b.model, c = this.contact;
    const cos = Math.cos(b.angle), sin = Math.sin(b.angle);
    const r = m.width / 2, off = m.length / 2 - r;
    for (const side of [1, -1]) {
      const px = b.x + cos * off * side, py = b.y + sin * off * side;
      circleVsGrid(this.solid, px, py, r, c);
      if (!c.hit) continue;
      b.x += c.nx * c.depth; b.y += c.ny * c.depth;
      const vn = b.vx * c.nx + b.vy * c.ny;
      if (vn >= 0) continue;
      const impact = -vn;
      // Bounce with a little restitution, scrub some tangential speed, and spin.
      b.vx -= 1.35 * vn * c.nx; b.vy -= 1.35 * vn * c.ny;
      b.vx *= 0.88; b.vy *= 0.88;
      const torque = (cos * c.ny - sin * c.nx) * side;
      b.angle = wrapAngle(b.angle + torque * Math.min(0.25, impact / 1600));
      if (impact > 60) {
        this.damage(car, impact);
        this.onCrash(car, impact, px - c.nx * r, py - c.ny * r);
      }
    }
  }

  private collideCars() {
    const cars = this.cars;
    for (let i = 0; i < cars.length; i++) {
      const a = cars[i];
      for (let j = i + 1; j < cars.length; j++) {
        const b = cars[j];
        const reach = (a.body.model.length + b.body.model.length) / 2;
        if (Math.abs(a.x - b.x) > reach || Math.abs(a.y - b.y) > reach) continue;
        this.collidePair(a, b);
      }
    }
  }

  private collidePair(a: Car, b: Car) {
    const A = a.body, B = b.body;
    const ra = A.model.width / 2, rb = B.model.width / 2;
    const oa = A.model.length / 2 - ra, ob = B.model.length / 2 - rb;
    const ac = Math.cos(A.angle), as = Math.sin(A.angle), bc = Math.cos(B.angle), bs = Math.sin(B.angle);
    // Heavier "mass" for parked cars and wrecks, so a tap doesn't send them flying.
    const ma = a.kind === "wreck" ? 6 : a.kind === "parked" ? 2.5 : 1, mb = b.kind === "wreck" ? 6 : b.kind === "parked" ? 2.5 : 1;
    for (const sa of [1, -1]) for (const sb of [1, -1]) {
      const ax = A.x + ac * oa * sa, ay = A.y + as * oa * sa, bx = B.x + bc * ob * sb, by = B.y + bs * ob * sb;
      const dx = bx - ax, dy = by - ay, d = Math.hypot(dx, dy), min = ra + rb;
      if (d >= min || d < 1e-4) continue;
      const nx = dx / d, ny = dy / d, depth = min - d;
      const wa = mb / (ma + mb), wb = ma / (ma + mb);
      A.x -= nx * depth * wa; A.y -= ny * depth * wa; B.x += nx * depth * wb; B.y += ny * depth * wb;
      const rel = (B.vx - A.vx) * nx + (B.vy - A.vy) * ny;
      if (rel >= 0) continue;
      const j = (-(1.3) * rel) / (1 / ma + 1 / mb);
      A.vx -= (j / ma) * nx; A.vy -= (j / ma) * ny; B.vx += (j / mb) * nx; B.vy += (j / mb) * ny;
      const impact = -rel;
      if (a.kind === "parked" && impact > 40) { /* nudged parked cars stay parked */ }
      if (impact > 60) {
        this.damage(a, impact); this.damage(b, impact);
        this.onCrash(a, impact, (ax + bx) / 2, (ay + by) / 2);
      }
    }
  }

  sync(car: Car) {
    const b = car.body;
    const state = damageState(b);
    const frame = state === "wrecked" ? `wreck-${car.variant.model}` : carFrame(car.variant.name, state !== "ok", car.lights);
    if (car.sprite.frame.name !== frame) car.sprite.setFrame(frame);
    car.sprite.setPosition(b.x, b.y).setRotation(b.angle);
  }

  nearestEnterable(x: number, y: number, max: number) {
    let best: Car | null = null, bestD = max;
    for (const car of this.cars) {
      if (car.kind === "wreck" || car.kind === "player") continue;
      const d = Math.hypot(car.x - x, car.y - y);
      if (d < bestD) { bestD = d; best = car; }
    }
    return best;
  }

  /** Puts a fresh civilian car at the kerb, mid-block, near a point (used after BUSTED/WASTED). */
  parkNear(x: number, y: number) {
    const road = Math.max(0, Math.min(BLOCKS, Math.round((y - 2 * CELL) / ROAD_PX)));
    const block = Math.max(0, Math.min(BLOCKS - 1, Math.floor(x / ROAD_PX)));
    let px = block * ROAD_PX + ROAD * CELL + (ROAD_PX - ROAD * CELL) / 2;
    const py = laneCentre(road, 3);
    while (this.cars.some((c) => Math.abs(c.x - px) < 70 && Math.abs(c.y - py) < 40)) px += 70;
    return this.add("parked", carVariants[Math.floor(Math.random() * 6)], px, py, Math.PI);
  }
}

export const dirAngle = (d: Dir) => [-Math.PI / 2, 0, Math.PI / 2, Math.PI][d];
