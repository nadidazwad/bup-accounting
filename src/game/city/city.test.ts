import { describe, expect, it } from "vitest";
import { createCar, damageCar, damageState, burn, EXPLODE_AFTER, forwardSpeed, lateralSpeed, models, stepCar, speedOf } from "./car";
import { intercept, steerTowards } from "./chase";
import { circleVsGrid, raycast, type Contact } from "./collide";
import { CELL, generateCity, Ground, groundAt, isSolidAt, laneCentre, SIZE } from "./layout";
import { Pool } from "./pool";
import { leanScale, proj, visibleWalls, N, E, S, W } from "./projection";
import { afterPenalty, copsFor, footCops, frenzyDone, levelWon, multiplier, objective, pointsForHit, wantedLevel } from "./rules";

const run = (seconds: number, fn: (dt: number) => void, dt = 1 / 60) => { for (let t = 0; t < seconds; t += dt) fn(dt); };

describe("car physics", () => {
  it("accelerates to its top speed and no further", () => {
    const car = createCar(models.sedan, 0, 0, 0);
    run(1, () => stepCar(car, { throttle: 1, steer: 0, handbrake: false }, 1 / 60));
    const afterOne = forwardSpeed(car);
    expect(afterOne).toBeGreaterThan(200);
    run(10, () => stepCar(car, { throttle: 1, steer: 0, handbrake: false }, 1 / 60));
    expect(forwardSpeed(car)).toBeLessThanOrEqual(models.sedan.maxSpeed + 1e-6);
    expect(forwardSpeed(car)).toBeGreaterThan(models.sedan.maxSpeed * 0.75);
    expect(car.y).toBeCloseTo(0, 6); // straight line along +x
    expect(car.x).toBeGreaterThan(3000);
  });

  it("coasts to a stop and brakes faster than it coasts", () => {
    const coast = createCar(models.sedan, 0, 0, 0), braked = createCar(models.sedan, 0, 0, 0);
    coast.vx = braked.vx = 400;
    let tCoast = 0, tBrake = 0;
    while (forwardSpeed(coast) > 0) { stepCar(coast, { throttle: 0, steer: 0, handbrake: false }, 1 / 60); tCoast += 1 / 60; }
    while (forwardSpeed(braked) > 0) { stepCar(braked, { throttle: -1, steer: 0, handbrake: false }, 1 / 60); tBrake += 1 / 60; if (forwardSpeed(braked) < 0) break; }
    expect(tBrake).toBeLessThan(tCoast);
    expect(tCoast).toBeLessThan(5);
  });

  it("reverses below its reverse limit, and steering flips in reverse", () => {
    const car = createCar(models.sedan, 0, 0, 0);
    run(4, () => stepCar(car, { throttle: -1, steer: 0, handbrake: false }, 1 / 60));
    expect(forwardSpeed(car)).toBeLessThan(0);
    expect(forwardSpeed(car)).toBeGreaterThanOrEqual(-models.sedan.maxReverse - 1e-6);
    run(0.3, () => stepCar(car, { throttle: -1, steer: 1, handbrake: false }, 1 / 60));
    expect(car.angle).toBeLessThan(0); // right lock in reverse swings the nose left
  });

  it("does not turn when stopped", () => {
    const car = createCar(models.sedan, 0, 0, 1);
    run(1, () => stepCar(car, { throttle: 0, steer: 1, handbrake: false }, 1 / 60));
    expect(car.angle).toBe(1);
  });

  it("slides more with the handbrake: lateral speed lasts longer", () => {
    const grip = createCar(models.sedan, 0, 0, 0), slide = createCar(models.sedan, 0, 0, 0);
    grip.vx = slide.vx = 400;
    run(0.4, () => { stepCar(grip, { throttle: 0, steer: 1, handbrake: false }, 1 / 60); stepCar(slide, { throttle: 0, steer: 1, handbrake: true }, 1 / 60); });
    expect(Math.abs(lateralSpeed(slide))).toBeGreaterThan(Math.abs(lateralSpeed(grip)) * 1.5);
    expect(Math.abs(slide.angle)).toBeGreaterThan(Math.abs(grip.angle)); // tighter rotation
  });

  it("goes dented → smoking → burning, and explodes after 5 s on fire", () => {
    const car = createCar(models.sedan, 0, 0, 0);
    expect(damageCar(car, 50)).toBe(0); // a tap is free
    damageCar(car, 480); expect(damageState(car)).toBe("dented"); // a hard crash: −26
    damageCar(car, 480); damageCar(car, 300); expect(damageState(car)).toBe("smoking");
    damageCar(car, 900); expect(damageState(car)).toBe("burning");
    let exploded = false, t = 0;
    while (!exploded && t < 10) { exploded = burn(car, 0.1); t += 0.1; }
    expect(exploded).toBe(true);
    expect(t).toBeGreaterThanOrEqual(EXPLODE_AFTER - 0.11);
    expect(damageState(car)).toBe("wrecked");
    stepCar(car, { throttle: 1, steer: 0, handbrake: false }, 1);
    expect(speedOf(car)).toBeLessThan(1); // wrecks don't drive
  });
});

describe("chase maths", () => {
  it("leads a moving target to the exact meeting point", () => {
    const p = { x: 0, y: 0 }, v = { x: 100, y: 0 }, c = { x: 0, y: 300 };
    const hit = intercept(p, v, c, 200);
    // Chaser and target reach the point at the same time.
    const t = hit.x / 100;
    expect(Math.hypot(hit.x - c.x, hit.y - c.y)).toBeCloseTo(200 * t, 4);
    expect(hit.y).toBe(0);
  });

  it("aims straight at a stationary target", () => {
    const hit = intercept({ x: 50, y: 80 }, { x: 0, y: 0 }, { x: 0, y: 0 }, 300);
    expect(hit).toEqual({ x: 50, y: 80 });
  });

  it("falls back to a bounded look-ahead when the target is faster", () => {
    const hit = intercept({ x: 0, y: 0 }, { x: 500, y: 0 }, { x: -1000, y: 0 }, 100);
    expect(hit.x).toBeGreaterThan(0);
    expect(hit.x).toBeLessThanOrEqual(500 * 2.5);
  });

  it("steers left/right towards the target", () => {
    expect(steerTowards(0, 0, 0, 100, 100)).toBeGreaterThan(0);
    expect(steerTowards(0, 0, 0, 100, -100)).toBeLessThan(0);
    expect(steerTowards(0, 0, 0, 100, 0)).toBe(0);
  });
});

describe("collision", () => {
  const solid = (cx: number, cy: number) => cx === 2 && cy === 0;
  const out: Contact = { hit: false, nx: 0, ny: 0, depth: 0 };
  it("pushes a circle out of a solid cell", () => {
    circleVsGrid(solid, 2 * CELL - 5, 16, 10, out);
    expect(out.hit).toBe(true);
    expect(out.nx).toBeCloseTo(-1);
    expect(out.depth).toBeCloseTo(5);
    circleVsGrid(solid, 10, 16, 10, out);
    expect(out.hit).toBe(false);
  });
  it("raycasts to the first wall", () => {
    expect(raycast(solid, 0, 16, 1, 0, 200, 4)).toBe(64);
    expect(raycast(solid, 0, 16, -1, 0, 200)).toBe(200);
  });
});

describe("ped pool", () => {
  it("recycles objects instead of allocating", () => {
    let made = 0;
    const pool = new Pool(() => ({ id: made++, alive: true }), 60, (p) => { p.alive = false; });
    const items = Array.from({ length: 60 }, () => pool.acquire()!);
    expect(pool.acquire()).toBeNull(); // capped at 60
    expect(pool.size).toBe(60);
    pool.release(items[10]);
    expect(items[10].alive).toBe(false);
    expect(pool.size).toBe(59);
    const again = pool.acquire()!;
    expect(again).toBe(items[10]);
    pool.release(items[10]); pool.release(items[10]); // double release is ignored
    expect(pool.size).toBe(59);
    for (let i = 0; i < 500; i++) { const p = pool.acquire(); if (p) pool.release(p); }
    expect(made).toBe(60);
    expect(pool.allocated).toBe(60);
  });
});

describe("wanted level and the win condition", () => {
  it("adds the first cop head at 3 victims and maxes out around 12", () => {
    expect([0, 2, 3, 4, 5, 7, 9, 11, 12, 13, 40].map(wantedLevel)).toEqual([0, 0, 1, 1, 2, 3, 4, 5, 5, 6, 6]);
  });
  it("puts 5 cops on you from 5 heads, mixing cars and officers on foot", () => {
    expect([0, 1, 4, 5, 6].map(copsFor)).toEqual([0, 1, 4, 5, 5]);
    expect(footCops(5)).toBe(2);
    expect(5 - footCops(5)).toBe(3);
  });
  it("scores hits with a growing multiplier and charges 25 % for a bust", () => {
    expect([0, 4, 5, 10, 25, 99].map(multiplier)).toEqual([1, 1, 2, 3, 5, 5]);
    expect(pointsForHit(0)).toBe(100);
    expect(pointsForHit(12)).toBe(300);
    expect(afterPenalty(1000)).toBe(750);
    expect(afterPenalty(0)).toBe(0);
  });
  it("needs 20 victims AND 5 cops seen at once", () => {
    expect(levelWon({ victims: 19, fiveCopsSeen: true })).toBe(false);
    expect(levelWon({ victims: 25, fiveCopsSeen: false })).toBe(false);
    expect(frenzyDone({ victims: 20, fiveCopsSeen: false })).toBe(true);
    expect(levelWon({ victims: 20, fiveCopsSeen: true })).toBe(true);
    expect(objective({ victims: 20, fiveCopsSeen: true })).toMatch(/BROKER'S TOWER/);
    expect(objective({ victims: 20, fiveCopsSeen: false })).toMatch(/5 COPS/);
    expect(objective({ victims: 7, fiveCopsSeen: false })).toMatch(/13 TO GO/);
  });
});

describe("city layout and pseudo-3D", () => {
  const city = generateCity();
  it("is deterministic and has roads on the block grid", () => {
    expect(generateCity().buildings.length).toBe(city.buildings.length);
    expect(groundAt(city, 10, 10)).toBe(Ground.Road);
    expect(city.tiles.length).toBe(SIZE);
    expect(city.buildings.length).toBeGreaterThan(40);
  });
  it("starts the player on the pavement with a free car at the kerb", () => {
    expect(isSolidAt(city, city.spawn.x, city.spawn.y)).toBe(false);
    expect(groundAt(city, city.spawn.x, city.spawn.y)).toBe(Ground.Pavement);
    expect(groundAt(city, city.spawnCar.x, city.spawnCar.y)).toBe(Ground.Road);
    expect(city.spawnCar.y).toBe(laneCentre(Math.round(city.spawnCar.y / (16 * CELL)), 3));
  });
  it("links every pedestrian node, with zebra crossings across roads", () => {
    for (const n of city.nodes) {
      expect(n.links.length).toBeGreaterThanOrEqual(2);
      expect(isSolidAt(city, n.x, n.y)).toBe(false);
    }
    expect(city.nodes.some((n) => n.crossing.includes(true))).toBe(true);
  });
  it("puts the goal on open ground next to THE BROKER's tower", () => {
    const g = city.goal;
    expect(isSolidAt(city, g.x + g.w / 2, g.y + g.h / 2)).toBe(false);
    expect(city.tower.height).toBeGreaterThan(300);
  });
  it("leans roofs away from the screen centre, more for taller buildings", () => {
    const low = leanScale(900, 50), high = leanScale(900, 300);
    expect(low).toBeGreaterThan(1);
    expect(high).toBeGreaterThan(low);
    expect(proj(700, 500, high)).toBeGreaterThan(proj(700, 500, low)); // right of centre: further right
    expect(proj(300, 500, high)).toBeLessThan(300); // left of centre: further left
    expect(proj(500, 500, high)).toBe(500); // straight below: no lean
  });
  it("shows only the walls that face the camera", () => {
    const r = { x: 100, y: 100, w: 50, h: 50 };
    expect(visibleWalls(r, 125, 125)).toBe(0);
    expect(visibleWalls(r, 125, 0)).toBe(N);
    expect(visibleWalls(r, 300, 300)).toBe(E | S);
    expect(visibleWalls(r, 0, 125)).toBe(W);
  });
});

describe("photosensitivity", () => {
  it("never allows more than 2 flashes in any one-second window (WCAG 2.3.1 allows 3)", async () => {
    const { FlashLimiter } = await import("./flash");
    const limiter = new FlashLimiter(2);
    const allowed: number[] = [];
    for (let t = 0; t < 5000; t += 50) if (limiter.allow(t)) allowed.push(t);
    for (const t of allowed) expect(allowed.filter((u) => u >= t && u < t + 1000).length).toBeLessThanOrEqual(2);
    expect(allowed.length).toBeGreaterThanOrEqual(9);
  });
});
