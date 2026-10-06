export type Tile = { x: number; y: number };
export type Direction = "up" | "down" | "left" | "right";
export const vectors: Record<Direction, Tile> = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };
export const sameTile = (a: Tile, b: Tile) => a.x === b.x && a.y === b.y;
export const tileKey = (p: Tile) => `${p.x},${p.y}`;
export const directionTo = (a: Tile, b: Tile): Direction => b.x > a.x ? "right" : b.x < a.x ? "left" : b.y > a.y ? "down" : "up";
export type Grid = { width: number; height: number; blocked: Set<string>; ledges: Set<string> };
export function walkable(grid: Grid, p: Tile) {
  return p.x >= 0 && p.y >= 0 && p.x < grid.width && p.y < grid.height && !grid.blocked.has(tileKey(p));
}
export function destination(grid: Grid, from: Tile, direction: Direction, excluded: readonly Tile[] = []): Tile | null {
  const v = vectors[direction];
  let to = { x: from.x + v.x, y: from.y + v.y };
  if (grid.ledges.has(tileKey(to))) {
    if (direction !== "down") return null;
    to = { x: to.x, y: to.y + 1 };
  }
  return walkable(grid, to) && !excluded.some(p => sameTile(p, to)) ? to : null;
}
// A* uses the same directed graph as keyboard movement, including one-way hops.
export function findPath(grid: Grid, from: Tile, goal: Tile, excluded: readonly Tile[] = []): Tile[] | null {
  if (!walkable(grid, goal) || excluded.some(p => sameTile(p, goal))) return null;
  const start = tileKey(from), end = tileKey(goal);
  const open = new Set([start]);
  const points = new Map<string, Tile>([[start, from]]);
  const came = new Map<string, string>();
  const costs = new Map([[start, 0]]);
  const heuristic = (p: Tile) => Math.abs(p.x - goal.x) + Math.abs(p.y - goal.y);
  while (open.size) {
    let current = start, best = Infinity;
    for (const key of open) { const score = costs.get(key)! + heuristic(points.get(key)!); if (score < best) { best = score; current = key; } }
    if (current === end) {
      const path: Tile[] = []; let key = end;
      while (key !== start) { path.unshift(points.get(key)!); key = came.get(key)!; }
      return path;
    }
    open.delete(current);
    const p = points.get(current)!;
    for (const d of Object.keys(vectors) as Direction[]) {
      const to = destination(grid, p, d, excluded); if (!to) continue;
      const key = tileKey(to), cost = costs.get(current)! + Math.abs(to.x - p.x) + Math.abs(to.y - p.y);
      if (cost >= (costs.get(key) ?? Infinity)) continue;
      costs.set(key, cost); points.set(key, to); came.set(key, current); open.add(key);
    }
  }
  return null;
}
