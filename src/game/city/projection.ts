// Pseudo-3D for GTA 2 buildings. The camera looks straight down from height
// `eye`; a point `h` above the ground projects away from the screen centre by
// eye / (eye − h). Roofs therefore shift outward *and* grow, and walls are the
// quads between a base edge and its projected roof edge.
import type { Rect } from "./layout";

export const EYE = 900; // world px above the street at zoom 1

export function leanScale(eye: number, h: number) {
  return eye / Math.max(eye * 0.08, eye - h);
}

/** Projects x (or y) at the given scale around the camera centre c. */
export const proj = (v: number, c: number, s: number) => c + (v - c) * s;

// Bit flags for which walls face the camera. A wall is visible when the
// camera centre lies on its outer side.
export const N = 1, E = 2, S = 4, W = 8;
export function visibleWalls(r: Rect, cx: number, cy: number) {
  return (cy < r.y ? N : 0) | (cx > r.x + r.w ? E : 0) | (cy > r.y + r.h ? S : 0) | (cx < r.x ? W : 0);
}
