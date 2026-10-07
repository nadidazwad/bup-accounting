// Office-worker pedestrians. A fixed pool of 60 walks the pavement graph,
// takes zebra crossings, panics near fast cars and gets flattened (cartoon
// style) when hit. Spawned just off screen, recycled when far away.
import Phaser from "phaser";
import { circleVsGrid, type Contact, type Solid } from "./collide";
import type { CityLayout, PedNode } from "./layout";
import { Pool } from "./pool";
import { PED_COP, PED_FLAT, PED_FRAMES, PED_PANIC, PED_RUN, PED_WALK, pedVariants, RUN_FRAMES, WALK_FRAMES } from "./textures";
import type { Car } from "./Vehicles";
import { forwardSpeed, speedOf } from "./car";

export type PedState = "walk" | "panic" | "down" | "flat" | "chase";

export class Ped {
  x = 0; y = 0; angle = 0; vx = 0; vy = 0;
  state: PedState = "walk";
  from = 0; to = 0; offset = 0; speed = 40;
  t = 0; anim = 0; look = 0; spin = 0;
  cop = false;
  /** Running gait (the player holding Shift, chasing officers). */
  running = false;
  constructor(readonly sprite: Phaser.GameObjects.Sprite) {}
}

export const PED_RADIUS = 9;
/** World px covered by one full walk / run cycle, so feet don't slide. */
export const WALK_STRIDE = 24, RUN_STRIDE = 40;

/** Advances a ped's animation clock by the distance it moved. */
export function stepAnim(p: Ped, distance: number) {
  p.anim += distance / (p.state === "walk" && !p.running ? WALK_STRIDE : RUN_STRIDE);
}

/** The sprite frame for a ped's state and animation clock. */
export function pedFrame(p: Ped) {
  const row = (p.cop ? PED_COP : p.look) * PED_FRAMES;
  if (p.state === "flat" || p.state === "down") return row + PED_FLAT;
  const cycle = p.anim - Math.floor(p.anim);
  if (p.state === "panic") return row + PED_PANIC + Math.floor(cycle * RUN_FRAMES);
  if (p.state === "chase" || p.running) return row + PED_RUN + Math.floor(cycle * RUN_FRAMES);
  return row + PED_WALK + Math.floor(cycle * WALK_FRAMES);
}

export class Peds {
  readonly pool: Pool<Ped>;
  private readonly contact: Contact = { hit: false, nx: 0, ny: 0, depth: 0 };
  /** Called when a car knocks a pedestrian down. */
  onHit: (ped: Ped, car: Car) => void = () => {};
  target = 60;

  constructor(private readonly scene: Phaser.Scene, private readonly layout: CityLayout, private readonly solid: Solid, capacity = 60) {
    this.pool = new Pool(() => new Ped(scene.add.sprite(0, 0, "city-peds", 0).setDepth(25).setVisible(false)), capacity, (p) => {
      p.sprite.setVisible(false).setAlpha(1);
    });
  }

  /** Builds a ped sprite outside the pool (used for cops and the player). */
  static make(scene: Phaser.Scene, look: number) {
    const p = new Ped(scene.add.sprite(0, 0, "city-peds", look * PED_FRAMES).setDepth(25));
    p.look = look;
    return p;
  }

  private place(p: Ped, node: PedNode, link: number, along: number) {
    const to = this.layout.nodes[node.links[link]];
    p.from = node.id; p.to = to.id;
    p.offset = (Math.random() * 2 - 1) * 9;
    const ex = to.x - node.x, ey = to.y - node.y, len = Math.hypot(ex, ey) || 1;
    p.x = node.x + ex * along - (ey / len) * p.offset;
    p.y = node.y + ey * along + (ex / len) * p.offset;
    p.angle = Math.atan2(ey, ex);
    p.state = "walk"; p.speed = 30 + Math.random() * 22; p.t = 0; p.vx = 0; p.vy = 0; p.spin = 0;
    p.look = Math.floor(Math.random() * pedVariants.length);
    p.sprite.setVisible(true).setAlpha(1).setDepth(25);
  }

  spawnAround(cx: number, cy: number, minR: number, maxR: number, tries = 12) {
    const nodes = this.layout.nodes;
    for (let i = 0; i < tries; i++) {
      const node = nodes[Math.floor(Math.random() * nodes.length)];
      const link = Math.floor(Math.random() * node.links.length);
      if (node.crossing[link]) continue;
      const along = Math.random();
      const to = nodes[node.links[link]];
      const x = node.x + (to.x - node.x) * along, y = node.y + (to.y - node.y) * along;
      const d = Math.hypot(x - cx, y - cy);
      if (d < minR || d > maxR) continue;
      const p = this.pool.acquire();
      if (!p) return null;
      this.place(p, node, link, along);
      return p;
    }
    return null;
  }

  /** A driver dragged out of their car runs off in a panic. */
  spawnPanicking(x: number, y: number, fromX: number, fromY: number) {
    const p = this.pool.acquire();
    if (!p) return null;
    const node = this.layout.nodes[0];
    this.place(p, node, 0, 0);
    p.x = x; p.y = y;
    this.panic(p, fromX, fromY, 3);
    return p;
  }

  panic(p: Ped, fromX: number, fromY: number, seconds = 2.4) {
    if (p.state === "down" || p.state === "flat") return;
    p.state = "panic"; p.t = seconds;
    p.angle = Math.atan2(p.y - fromY, p.x - fromX) + (Math.random() - 0.5) * 0.9;
    p.speed = 110 + Math.random() * 40;
  }

  /** Everyone near a point runs. */
  scare(x: number, y: number, radius: number) {
    for (const p of this.pool.active) if (Math.abs(p.x - x) < radius && Math.abs(p.y - y) < radius) this.panic(p, x, y);
  }

  knockDown(p: Ped, vx: number, vy: number) {
    p.state = "down"; p.t = 0.4;
    p.vx = vx; p.vy = vy; p.spin = (Math.random() < 0.5 ? -1 : 1) * (8 + Math.random() * 8);
  }

  update(dt: number, cx: number, cy: number, viewR: number, cars: readonly Car[]) {
    const active = this.pool.active;
    // Keep the streets busy: refill just outside the view.
    for (let i = 0; i < 3 && active.length < this.target; i++) this.spawnAround(cx, cy, viewR + 30, viewR + 520);
    for (let i = active.length - 1; i >= 0; i--) {
      const p = active[i];
      const far = Math.hypot(p.x - cx, p.y - cy) > viewR + 900;
      if (far || this.stepPed(p, dt, cars)) { this.pool.release(p); continue; }
      this.draw(p);
    }
  }

  /** Advances one ped. Returns true when it should be recycled. */
  stepPed(p: Ped, dt: number, cars: readonly Car[]) {
    const nodes = this.layout.nodes;
    switch (p.state) {
      case "walk": {
        const to = nodes[p.to], from = nodes[p.from];
        const ex = to.x - from.x, ey = to.y - from.y, len = Math.hypot(ex, ey) || 1;
        const tx = to.x - (ey / len) * p.offset, ty = to.y + (ex / len) * p.offset;
        const dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy);
        if (d < 3) {
          // Pick the next edge: usually around the block, sometimes across the road.
          const links = to.links;
          let pick = -1;
          for (let tries = 0; tries < 6; tries++) {
            const k = Math.floor(Math.random() * links.length);
            if (links[k] === p.from && links.length > 1) continue;
            if (to.crossing[k] && Math.random() < 0.6) continue;
            pick = k; break;
          }
          if (pick < 0) pick = links.findIndex((l) => l !== p.from);
          p.from = to.id; p.to = links[Math.max(0, pick)];
          break;
        }
        p.angle = Math.atan2(dy, dx);
        p.x += (dx / d) * p.speed * dt; p.y += (dy / d) * p.speed * dt;
        stepAnim(p, p.speed * dt);
        // Scatter from fast cars heading their way.
        for (const car of cars) {
          if (car.kind !== "player" && car.kind !== "cop") continue;
          const ox = p.x - car.x, oy = p.y - car.y;
          if (Math.abs(ox) > 120 || Math.abs(oy) > 120) continue;
          const v = speedOf(car.body);
          if (v < 170) continue;
          if ((ox * car.body.vx + oy * car.body.vy) / (v * (Math.hypot(ox, oy) || 1)) > 0.35) {
            // Dodge sideways from the car's path.
            const side = (-car.body.vy * ox + car.body.vx * oy) > 0 ? 1 : -1;
            this.panic(p, p.x + (car.body.vy / v) * side * 40, p.y - (car.body.vx / v) * side * 40, 1.6);
            break;
          }
        }
        return false;
      }
      case "panic": {
        p.t -= dt;
        p.x += Math.cos(p.angle) * p.speed * dt; p.y += Math.sin(p.angle) * p.speed * dt;
        stepAnim(p, p.speed * dt);
        if (this.push(p)) p.angle += Math.PI * (0.5 + Math.random());
        if (p.t <= 0) {
          // Calm down and walk to the nearest pavement corner.
          let best = 0, bestD = Infinity;
          for (const n of nodes) { const d = Math.abs(n.x - p.x) + Math.abs(n.y - p.y); if (d < bestD) { bestD = d; best = n.id; } }
          p.state = "walk"; p.from = best; p.to = best; p.speed = 34 + Math.random() * 16; p.offset = 0;
          void cars;
        }
        return false;
      }
      case "down": {
        p.t -= dt;
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.vx *= Math.exp(-5 * dt); p.vy *= Math.exp(-5 * dt);
        p.angle += p.spin * dt;
        this.push(p);
        if (p.t <= 0) { p.state = "flat"; p.t = 7; p.sprite.setDepth(20); }
        return false;
      }
      case "flat": {
        p.t -= dt;
        if (p.t < 1) p.sprite.setAlpha(Math.max(0, p.t));
        return p.t <= 0;
      }
      default: return false;
    }
  }

  private push(p: Ped) {
    circleVsGrid(this.solid, p.x, p.y, PED_RADIUS, this.contact);
    if (!this.contact.hit) return false;
    p.x += this.contact.nx * this.contact.depth; p.y += this.contact.ny * this.contact.depth;
    return true;
  }

  draw(p: Ped) {
    p.sprite.setFrame(pedFrame(p)).setPosition(p.x, p.y).setRotation(p.angle);
  }

  /** Car vs pedestrian: an oriented-box test in the car's frame. */
  static hits(car: Car, x: number, y: number) {
    const b = car.body;
    const dx = x - b.x, dy = y - b.y;
    const reach = b.model.length / 2 + PED_RADIUS;
    if (Math.abs(dx) > reach || Math.abs(dy) > reach) return false;
    const c = Math.cos(b.angle), s = Math.sin(b.angle);
    const lx = dx * c + dy * s, ly = -dx * s + dy * c;
    return Math.abs(lx) < b.model.length / 2 + PED_RADIUS - 1 && Math.abs(ly) < b.model.width / 2 + PED_RADIUS - 1;
  }

  /** Checks every moving car against every standing pedestrian. */
  collide(cars: readonly Car[]) {
    for (const car of cars) {
      if (car.kind === "parked" || car.kind === "wreck") continue;
      const v = speedOf(car.body);
      if (v < 55) continue;
      for (const p of this.pool.active) {
        if (p.state === "down" || p.state === "flat") continue;
        if (!Peds.hits(car, p.x, p.y)) continue;
        const f = forwardSpeed(car.body);
        this.knockDown(p, car.body.vx * 0.9 + Math.cos(car.body.angle) * Math.sign(f) * 40, car.body.vy * 0.9 + Math.sin(car.body.angle) * Math.sign(f) * 40);
        this.onHit(p, car);
      }
    }
  }
}
