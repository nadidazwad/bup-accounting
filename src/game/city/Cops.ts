// CopDirector: keeps up to five cops on the player (police cars that ram and
// box you in, officers on foot who drag you out if you sit still). Cars aim at
// a predicted intercept, feel for walls with whisker raycasts, route around
// blocks via intersections when they can't see you, and respawn off screen
// when stuck or left far behind.
import type Phaser from "phaser";
import { forwardSpeed, speedOf } from "./car";
import { angleTo, intercept, steerTowards } from "./chase";
import { raycast, circleVsGrid, type Contact, type Solid } from "./collide";
import { BLOCKS, CELL, PERIOD, ROAD, type CityLayout, type Point } from "./layout";
import { Ped, Peds, PED_RADIUS, pedFrame, stepAnim } from "./Peds";
import { copsFor, footCops } from "./rules";
import { carVariants, PED_COP } from "./textures";
import type { Car, Vehicles } from "./Vehicles";

export type Suspect = { x: number; y: number; vx: number; vy: number; inCar: boolean; car: Car | null };

const police = carVariants.find((v) => v.model === "police")!;
const ROAD_PX = PERIOD * CELL;
const CHASE_RANGE = 1100;

type CarBrain = { waypoint: Point | null; replanT: number; stuckT: number; reverseT: number; role: number; lostT: number };

export class CopDirector {
  readonly cars: Car[] = [];
  readonly officers: Ped[] = [];
  private readonly brains = new Map<Car, CarBrain>();
  private readonly idleOfficers: Ped[] = [];
  private spawnT = 0;
  grace = 0;
  private readonly aim: Point = { x: 0, y: 0 };
  private readonly contact: Contact = { hit: false, nx: 0, ny: 0, depth: 0 };

  constructor(private readonly scene: Phaser.Scene, private readonly layout: CityLayout, private readonly solid: Solid, private readonly vehicles: Vehicles) {}

  /** Cops currently on the player's tail (alive and within chase range). */
  chasing(s: Suspect) {
    let n = 0;
    for (const c of this.cars) if (c.kind === "cop" && Math.hypot(c.x - s.x, c.y - s.y) < CHASE_RANGE) n++;
    for (const o of this.officers) if (o.state === "chase" && Math.hypot(o.x - s.x, o.y - s.y) < CHASE_RANGE) n++;
    return n;
  }

  /** BUSTED/WASTED: every cop goes home, and nobody comes back for a few seconds. */
  standDown(seconds = 5) {
    for (const c of this.cars) {
      this.brains.delete(c);
      if (c.kind === "cop") this.vehicles.remove(c);
    }
    this.cars.length = 0;
    for (const o of this.officers) { o.sprite.setVisible(false); this.idleOfficers.push(o); }
    this.officers.length = 0;
    this.grace = seconds;
  }

  update(dt: number, level: number, s: Suspect, viewR: number) {
    // Forget cars that were stolen or wrecked.
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const c = this.cars[i];
      if (c.kind !== "cop") { this.brains.delete(c); this.cars.splice(i, 1); }
    }
    this.grace = Math.max(0, this.grace - dt);
    const want = this.grace > 0 ? 0 : copsFor(level);
    const wantFoot = footCops(want), wantCars = want - wantFoot;
    const standing = this.officers.filter((o) => o.state === "chase").length;
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      this.spawnT = 0.7;
      if (this.cars.length < wantCars) this.spawnCar(s, viewR);
      else if (standing < wantFoot) this.spawnOfficer(s, viewR);
    }
    // Too many (e.g. wanted level dropped after a bust): retire the farthest when off screen.
    if (this.cars.length > wantCars) {
      const c = this.cars[this.cars.length - 1];
      if (Math.hypot(c.x - s.x, c.y - s.y) > viewR + 100) { this.brains.delete(c); this.vehicles.remove(c); this.cars.pop(); }
    }
    this.cars.forEach((c, i) => this.driveCar(c, i, dt, s, viewR));
    for (let i = this.officers.length - 1; i >= 0; i--) {
      const o = this.officers[i];
      if (this.stepOfficer(o, dt, s, viewR)) { o.sprite.setVisible(false); this.officers.splice(i, 1); this.idleOfficers.push(o); }
    }
  }

  private spawnCar(s: Suspect, viewR: number) {
    const car = this.vehicles.spawnOnRoad("cop", police, s.x, s.y, viewR + 60, viewR + 520);
    if (!car) return;
    car.hadDriver = true;
    this.cars.push(car);
    this.brains.set(car, { waypoint: null, replanT: 0, stuckT: 0, reverseT: 0, role: this.cars.length - 1, lostT: 0 });
  }

  private spawnOfficer(s: Suspect, viewR: number) {
    const nodes = this.layout.nodes;
    for (let tries = 0; tries < 16; tries++) {
      const n = nodes[Math.floor(Math.random() * nodes.length)];
      const d = Math.hypot(n.x - s.x, n.y - s.y);
      if (d < viewR + 20 || d > viewR + 420) continue;
      const o = this.idleOfficers.pop() ?? Peds.make(this.scene, PED_COP);
      o.cop = true; o.look = PED_COP; o.state = "chase"; o.x = n.x; o.y = n.y; o.t = 0; o.speed = 128 + Math.random() * 20;
      o.vx = 0; o.vy = 0; o.anim = 0; o.from = 0;
      o.sprite.setVisible(true).setAlpha(1).setDepth(26);
      this.officers.push(o);
      return;
    }
  }

  private brain(c: Car) {
    let b = this.brains.get(c);
    if (!b) { b = { waypoint: null, replanT: 0, stuckT: 0, reverseT: 0, role: 0, lostT: 0 }; this.brains.set(c, b); }
    return b;
  }

  private driveCar(c: Car, index: number, dt: number, s: Suspect, viewR: number) {
    const brain = this.brain(c), b = c.body, input = c.input;
    const dist = Math.hypot(s.x - c.x, s.y - c.y);
    // Left behind or wedged for too long: reappear somewhere useful.
    if (dist > 1500 || brain.lostT > 4.5) {
      if (dist > viewR + 60) {
        const fresh = this.vehicles.spawnOnRoad("cop", police, s.x, s.y, viewR + 60, viewR + 520);
        if (fresh) {
          this.vehicles.remove(c); this.brains.delete(c);
          this.cars[index] = fresh; fresh.hadDriver = true;
          this.brains.set(fresh, { waypoint: null, replanT: 0, stuckT: 0, reverseT: 0, role: brain.role, lostT: 0 });
          return;
        }
      }
    }
    const top = b.model.maxSpeed * 0.86;
    // Where to go: a predicted intercept; two cars aim ahead/beside you to box you in.
    if (s.inCar) {
      intercept({ x: s.x, y: s.y }, { x: s.vx, y: s.vy }, { x: c.x, y: c.y }, top, this.aim, 1.6);
      const v = Math.hypot(s.vx, s.vy);
      if (v > 60 && dist > 140) {
        const ux = s.vx / v, uy = s.vy / v;
        if (brain.role % 3 === 1) { this.aim.x += ux * 110; this.aim.y += uy * 110; }
        else if (brain.role % 3 === 2) { this.aim.x += -uy * 70 + ux * 40; this.aim.y += ux * 70 + uy * 40; }
      }
    } else { this.aim.x = s.x; this.aim.y = s.y; }
    // Can we see it? If not, route via the best visible intersection.
    let tx = this.aim.x, ty = this.aim.y;
    const toAim = Math.hypot(tx - c.x, ty - c.y) || 1;
    const clear = raycast(this.solid, c.x, c.y, (tx - c.x) / toAim, (ty - c.y) / toAim, toAim, 16) >= toAim;
    brain.replanT -= dt;
    if (clear) brain.waypoint = null;
    else if (!brain.waypoint || brain.replanT <= 0 || Math.hypot(brain.waypoint.x - c.x, brain.waypoint.y - c.y) < 50) {
      brain.replanT = 0.4;
      brain.waypoint = this.bestCorner(c.x, c.y, tx, ty);
    }
    if (brain.waypoint) { tx = brain.waypoint.x; ty = brain.waypoint.y; }
    let steer = steerTowards(c.x, c.y, b.angle, tx, ty);
    // Whiskers: feel ahead-left and ahead-right, turn away from the closer wall.
    const speed = forwardSpeed(b);
    const reach = 60 + Math.max(0, speed) * 0.3;
    const l = raycast(this.solid, c.x, c.y, Math.cos(b.angle - 0.5), Math.sin(b.angle - 0.5), reach, 10);
    const r = raycast(this.solid, c.x, c.y, Math.cos(b.angle + 0.5), Math.sin(b.angle + 0.5), reach, 10);
    if (l < reach || r < reach) steer += (l < r ? 1 : -1) * (1 - Math.min(l, r) / reach) * 1.6;
    steer = Math.max(-1, Math.min(1, steer));
    let throttle = 1;
    const facing = Math.abs(angleTo(c.x, c.y, b.angle, tx, ty));
    if (facing > 1.9 && dist < 220 && Math.abs(speed) < 120) { throttle = -1; steer = -steer; } // three-point turn
    if (!s.inCar && dist < 120) throttle = speed > 30 ? -1 : 0; // pull up next to a suspect on foot
    else if (facing > 1.1 && speed > 260) throttle = 0.2;
    // Stuck against something: back off for a moment.
    const moving = speedOf(b);
    if (throttle > 0 && moving < 30) brain.stuckT += dt; else brain.stuckT = Math.max(0, brain.stuckT - dt * 2);
    if (brain.stuckT > 1.1) { brain.reverseT = 0.9; brain.stuckT = 0; brain.lostT += 1; }
    if (moving > 120) brain.lostT = Math.max(0, brain.lostT - dt);
    if (brain.reverseT > 0) { brain.reverseT -= dt; throttle = -1; steer = -steer; }
    input.throttle = throttle; input.steer = steer; input.handbrake = facing > 1.3 && speed > 200;
  }

  /** The intersection centre the car can see that best shortens its trip. */
  private bestCorner(x: number, y: number, tx: number, ty: number) {
    let best: Point | null = null, bestCost = Infinity;
    const ix0 = Math.max(0, Math.floor(x / ROAD_PX) - 1), ix1 = Math.min(BLOCKS, Math.floor(x / ROAD_PX) + 2);
    const iy0 = Math.max(0, Math.floor(y / ROAD_PX) - 1), iy1 = Math.min(BLOCKS, Math.floor(y / ROAD_PX) + 2);
    for (let iy = iy0; iy <= iy1; iy++) for (let ix = ix0; ix <= ix1; ix++) {
      const px = ix * ROAD_PX + ROAD * CELL / 2, py = iy * ROAD_PX + ROAD * CELL / 2;
      const d = Math.hypot(px - x, py - y);
      if (d < 40) continue;
      if (raycast(this.solid, x, y, (px - x) / d, (py - y) / d, d, 16) < d) continue;
      const cost = d + Math.abs(tx - px) + Math.abs(ty - py);
      if (cost < bestCost) { bestCost = cost; best = { x: px, y: py }; }
    }
    return best;
  }

  /** Returns true when the officer should be recycled. */
  private stepOfficer(o: Ped, dt: number, s: Suspect, viewR: number) {
    if (o.state === "down") {
      o.t -= dt; o.x += o.vx * dt; o.y += o.vy * dt; o.vx *= Math.exp(-5 * dt); o.vy *= Math.exp(-5 * dt); o.angle += o.spin * dt;
      if (o.t <= 0) { o.state = "flat"; o.t = 6; o.sprite.setDepth(20); }
      this.draw(o); return false;
    }
    if (o.state === "flat") { o.t -= dt; if (o.t < 1) o.sprite.setAlpha(Math.max(0, o.t)); this.draw(o); return o.t <= 0; }
    const dx = s.x - o.x, dy = s.y - o.y, d = Math.hypot(dx, dy);
    if (d > 1300 && d > viewR + 100) return true;
    if (s.inCar) intercept({ x: s.x, y: s.y }, { x: s.vx, y: s.vy }, { x: o.x, y: o.y }, o.speed, this.aim, 0.8);
    else { this.aim.x = s.x; this.aim.y = s.y; }
    const close = d < 26;
    const ax = this.aim.x - o.x, ay = this.aim.y - o.y, ad = Math.hypot(ax, ay) || 1;
    o.angle = Math.atan2(ay, ax);
    if (!close) { o.x += (ax / ad) * o.speed * dt; o.y += (ay / ad) * o.speed * dt; stepAnim(o, o.speed * dt); }
    circleVsGrid(this.solid, o.x, o.y, PED_RADIUS, this.contact);
    if (this.contact.hit) {
      o.x += this.contact.nx * this.contact.depth; o.y += this.contact.ny * this.contact.depth;
      // Slide along the wall instead of pressing into it.
      o.x += -this.contact.ny * o.speed * dt * Math.sign(ax * -this.contact.ny + ay * this.contact.nx || 1);
      o.y += this.contact.nx * o.speed * dt * Math.sign(ax * -this.contact.ny + ay * this.contact.nx || 1);
    }
    this.draw(o);
    return false;
  }

  private draw(o: Ped) {
    o.sprite.setFrame(pedFrame(o)).setPosition(o.x, o.y).setRotation(o.angle);
  }

  /** Is an officer close enough to grab the suspect? */
  officerWithin(x: number, y: number, r: number) {
    return this.officers.some((o) => o.state === "chase" && Math.hypot(o.x - x, o.y - y) < r);
  }

  /** Cars hit officers too. Returns how many went down. */
  collideOfficers(cars: readonly Car[], onHit: (o: Ped, car: Car) => void) {
    for (const car of cars) {
      if (car.kind === "parked" || car.kind === "wreck" || speedOf(car.body) < 55) continue;
      for (const o of this.officers) {
        if (o.state !== "chase" || !Peds.hits(car, o.x, o.y)) continue;
        o.state = "down"; o.t = 0.4; o.vx = car.body.vx * 0.9; o.vy = car.body.vy * 0.9; o.spin = 10;
        onHit(o, car);
      }
    }
  }
}
