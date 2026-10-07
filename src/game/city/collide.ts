// Collision against the city's solid cell grid, plus raycasts for AI whiskers.
// Pure: callers pass a `solid(cx, cy)` lookup. Results go into a reused object.
import { CELL } from "./layout";

export type Solid = (cx: number, cy: number) => boolean;
export type Contact = { hit: boolean; nx: number; ny: number; depth: number };

/** Pushes a circle out of every solid cell it overlaps. Returns the summed push in `out`. */
export function circleVsGrid(solid: Solid, x: number, y: number, r: number, out: Contact) {
  out.hit = false; out.nx = 0; out.ny = 0; out.depth = 0;
  let px = 0, py = 0;
  const x0 = Math.floor((x - r) / CELL), x1 = Math.floor((x + r) / CELL);
  const y0 = Math.floor((y - r) / CELL), y1 = Math.floor((y + r) / CELL);
  for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
    if (!solid(cx, cy)) continue;
    const qx = clamp(x, cx * CELL, cx * CELL + CELL), qy = clamp(y, cy * CELL, cy * CELL + CELL);
    let dx = x - qx, dy = y - qy;
    let d = Math.hypot(dx, dy);
    if (d >= r) continue;
    if (d < 1e-4) {
      // Centre inside the cell: push out along the shortest axis.
      const left = x - cx * CELL, right = cx * CELL + CELL - x, top = y - cy * CELL, bottom = cy * CELL + CELL - y;
      const m = Math.min(left, right, top, bottom);
      dx = m === left ? -1 : m === right ? 1 : 0; dy = m === top ? -1 : m === bottom ? 1 : 0; d = 0;
      px += dx * (m + r); py += dy * (m + r);
    } else {
      px += (dx / d) * (r - d); py += (dy / d) * (r - d);
    }
    out.hit = true;
  }
  if (out.hit) {
    out.depth = Math.hypot(px, py);
    if (out.depth > 0) { out.nx = px / out.depth; out.ny = py / out.depth; }
  }
  return out;
}

/** Distance along (dx, dy) (unit vector) to the first solid cell, up to max. */
export function raycast(solid: Solid, x: number, y: number, dx: number, dy: number, max: number, step = 8) {
  for (let t = step; t <= max; t += step) {
    if (solid(Math.floor((x + dx * t) / CELL), Math.floor((y + dy * t) / CELL))) return t;
  }
  return max;
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
