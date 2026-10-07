// Arcade top-down car physics in the GTA 2 spirit: velocity is split into a
// forward and a lateral part, lateral grip bleeds the slide away, and the
// handbrake drops grip so the back end swings out. Pure: no Phaser.

export type CarModel = {
  length: number; width: number;
  accel: number; brake: number; reverseAccel: number;
  maxSpeed: number; maxReverse: number;
  drag: number;        // rolling resistance, px/s²
  airDrag: number;     // proportional drag, 1/s
  grip: number;        // lateral decay rate, 1/s
  handbrakeGrip: number;
  turnRate: number;    // rad/s at full lock and speed
};

export const models = {
  sedan: { length: 56, width: 28, accel: 380, brake: 900, reverseAccel: 260, maxSpeed: 470, maxReverse: 170, drag: 70, airDrag: 0.25, grip: 5.2, handbrakeGrip: 1.1, turnRate: 3.1 },
  sport: { length: 52, width: 26, accel: 470, brake: 1000, reverseAccel: 280, maxSpeed: 560, maxReverse: 180, drag: 60, airDrag: 0.22, grip: 5.8, handbrakeGrip: 1.2, turnRate: 3.4 },
  van: { length: 64, width: 30, accel: 300, brake: 800, reverseAccel: 220, maxSpeed: 400, maxReverse: 150, drag: 80, airDrag: 0.3, grip: 4.6, handbrakeGrip: 1.0, turnRate: 2.6 },
  police: { length: 58, width: 28, accel: 430, brake: 950, reverseAccel: 260, maxSpeed: 500, maxReverse: 170, drag: 65, airDrag: 0.24, grip: 6.0, handbrakeGrip: 1.2, turnRate: 3.2 },
  taxi: { length: 58, width: 28, accel: 360, brake: 900, reverseAccel: 250, maxSpeed: 450, maxReverse: 170, drag: 70, airDrag: 0.25, grip: 5.2, handbrakeGrip: 1.1, turnRate: 3.0 },
  wagon: { length: 62, width: 28, accel: 330, brake: 860, reverseAccel: 240, maxSpeed: 430, maxReverse: 160, drag: 75, airDrag: 0.27, grip: 4.9, handbrakeGrip: 1.0, turnRate: 2.8 },
  bug: { length: 44, width: 26, accel: 340, brake: 900, reverseAccel: 260, maxSpeed: 400, maxReverse: 170, drag: 65, airDrag: 0.28, grip: 5.6, handbrakeGrip: 1.3, turnRate: 3.5 },
  pickup: { length: 58, width: 28, accel: 350, brake: 880, reverseAccel: 250, maxSpeed: 440, maxReverse: 165, drag: 72, airDrag: 0.26, grip: 5.0, handbrakeGrip: 1.0, turnRate: 2.9 },
} satisfies Record<string, CarModel>;
export type ModelName = keyof typeof models;

export type CarBody = {
  x: number; y: number; angle: number;
  vx: number; vy: number;
  model: CarModel;
  health: number;      // 100 → 0
  burning: number;     // seconds on fire, 0 when not burning
};

export type CarInput = { throttle: number; steer: number; handbrake: boolean };
export const idle: CarInput = { throttle: 0, steer: 0, handbrake: false };

export function createCar(model: CarModel, x: number, y: number, angle: number): CarBody {
  return { x, y, angle, vx: 0, vy: 0, model, health: 100, burning: 0 };
}

export const forwardSpeed = (c: CarBody) => c.vx * Math.cos(c.angle) + c.vy * Math.sin(c.angle);
export const lateralSpeed = (c: CarBody) => -c.vx * Math.sin(c.angle) + c.vy * Math.cos(c.angle);
export const speedOf = (c: CarBody) => Math.hypot(c.vx, c.vy);

/** Advances one car by dt seconds. Mutates in place; allocates nothing. */
export function stepCar(c: CarBody, input: CarInput, dt: number) {
  const m = c.model;
  const cos = Math.cos(c.angle), sin = Math.sin(c.angle);
  let f = c.vx * cos + c.vy * sin;
  let l = -c.vx * sin + c.vy * cos;
  const throttle = c.health <= 0 ? 0 : clamp(input.throttle, -1, 1);
  if (throttle > 0) f += (f < -5 ? m.brake : m.accel) * throttle * dt;
  else if (throttle < 0) f += (f > 5 ? m.brake : m.reverseAccel) * throttle * dt;
  // Rolling resistance always, plus air drag that grows with speed.
  const resist = (m.drag + m.airDrag * Math.abs(f)) * dt * (throttle === 0 ? 1.6 : 1);
  f = Math.abs(f) <= resist ? 0 : f - Math.sign(f) * resist;
  if (input.handbrake) f *= Math.exp(-1.4 * dt);
  f = clamp(f, -m.maxReverse, m.maxSpeed);
  l *= Math.exp(-(input.handbrake ? m.handbrakeGrip : m.grip) * dt);
  // Steering needs rolling wheels and flips when reversing.
  const roll = clamp(Math.abs(f) / 140, 0, 1) * Math.sign(f);
  const steer = clamp(input.steer, -1, 1) * m.turnRate * roll * (input.handbrake ? 1.35 : 1) * (1 - 0.25 * Math.min(1, Math.abs(f) / m.maxSpeed));
  c.angle = wrapAngle(c.angle + steer * dt);
  // Recompose with the *old* heading: the body turns, the momentum doesn't,
  // and the lateral slide that appears next frame is what grip eats away.
  c.vx = f * cos - l * sin;
  c.vy = f * sin + l * cos;
  c.x += c.vx * dt;
  c.y += c.vy * dt;
}

export type DamageState = "ok" | "dented" | "smoking" | "burning" | "wrecked";
export const damageState = (c: CarBody): DamageState =>
  c.health <= 0 ? "wrecked" : c.burning > 0 ? "burning" : c.health < 40 ? "smoking" : c.health < 75 ? "dented" : "ok";

export const EXPLODE_AFTER = 5; // seconds on fire
/** Applies an impact. Returns the damage dealt. Light taps are free. */
export function damageCar(c: CarBody, impact: number) {
  if (c.health <= 0) return 0;
  const dealt = impact > 80 ? (impact - 80) * 0.065 : 0;
  c.health = Math.max(0.5, c.health - dealt);
  if (c.health < 15 && c.burning === 0) c.burning = 0.0001;
  return dealt;
}
/** Advances the fire timer. Returns true on the frame the car explodes. */
export function burn(c: CarBody, dt: number) {
  if (c.burning <= 0 || c.health <= 0) return false;
  c.burning += dt;
  if (c.burning < EXPLODE_AFTER) return false;
  c.health = 0; c.burning = 0; c.vx *= 0.2; c.vy *= 0.2;
  return true;
}

export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
export function wrapAngle(a: number) {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}
