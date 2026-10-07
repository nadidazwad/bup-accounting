// Pursuit maths for the cops. Pure.
import { wrapAngle } from "./car";
import type { Point } from "./layout";

/**
 * Where a chaser at `c` moving at `speed` can meet a target at `p` moving with
 * velocity `v`. Solves |p + v·t − c| = speed·t for the smallest positive t.
 * Falls back to a short look-ahead when the target is faster than the chaser.
 */
export function intercept(p: Point, v: Point, c: Point, speed: number, out: Point = { x: 0, y: 0 }, maxLead = 2.5) {
  const dx = p.x - c.x, dy = p.y - c.y;
  const a = v.x * v.x + v.y * v.y - speed * speed;
  const b = 2 * (dx * v.x + dy * v.y);
  const k = dx * dx + dy * dy;
  let t = -1;
  if (Math.abs(a) < 1e-6) { if (b < 0) t = -k / b; }
  else {
    const disc = b * b - 4 * a * k;
    if (disc >= 0) {
      const s = Math.sqrt(disc);
      const t1 = (-b - s) / (2 * a), t2 = (-b + s) / (2 * a);
      t = Math.min(t1 > 0 ? t1 : Infinity, t2 > 0 ? t2 : Infinity);
      if (!Number.isFinite(t)) t = -1;
    }
  }
  if (t < 0) t = Math.min(maxLead, Math.sqrt(k) / Math.max(1, speed));
  t = Math.min(t, maxLead);
  out.x = p.x + v.x * t; out.y = p.y + v.y * t;
  return out;
}

/** Steering in [-1, 1] that turns a heading towards a point. */
export function steerTowards(x: number, y: number, angle: number, tx: number, ty: number) {
  const diff = wrapAngle(Math.atan2(ty - y, tx - x) - angle);
  return Math.max(-1, Math.min(1, diff * 2.2));
}

export const angleTo = (x: number, y: number, angle: number, tx: number, ty: number) => wrapAngle(Math.atan2(ty - y, tx - x) - angle);
