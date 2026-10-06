import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
const map: { width: number; height: number; tilewidth: number; layers: { name: string; data?: number[]; objects?: { x: number; y: number; type: string }[] }[] } = JSON.parse(readFileSync(new URL("../../../public/assets/maps/town.tmj", import.meta.url), "utf8"));
import { OverworldMovement } from "./movement";
import { destination, directionTo, findPath, sameTile, tileKey, type Grid } from "./navigation";
import { FRLG } from "../style/frlg";
const empty = (): Grid => ({ width: 12, height: 12, blocked: new Set(), ledges: new Set() });
function finish(m: OverworldMovement) {
  for (let i = 0; i < 200 && m.busy; i++) {
    m.update(1000 / 60); const p = m.visual();
    expect(p.player.x !== p.follower.x || p.player.y !== p.follower.y).toBe(true);
    expect(Object.values(p.player).every(Number.isInteger)).toBe(true);
    expect(Object.values(p.follower).every(Number.isInteger)).toBe(true);
    expect(sameTile(m.player, m.follower)).toBe(false);
  }
  expect(m.busy).toBe(false);
}
it("finishes walking in 16 frames and running in 8", () => {
  const m = new OverworldMovement(empty(), { x: 5, y: 5 }, { x: 5, y: 6 });
  m.move("up"); m.update(15 * 1000 / 60); expect(m.busy).toBe(true); m.update(1000 / 60);
  expect(m.player).toEqual({ x: 5, y: 4 }); expect(m.follower).toEqual({ x: 5, y: 5 });
  m.move("up", true); m.update(7 * 1000 / 60); expect(m.busy).toBe(true); m.update(1000 / 60); expect(m.busy).toBe(false);
});
it("rejects walls, boundaries and blocked landing tiles", () => {
  const grid = empty(); grid.blocked.add("5,4");
  const m = new OverworldMovement(grid, { x: 5, y: 5 }, { x: 5, y: 6 });
  expect(m.move("up")).toBe(false); expect(m.facing).toBe("up");
  expect(destination(grid, { x: 0, y: 0 }, "left")).toBeNull();
  grid.ledges.add("5,7"); grid.blocked.add("5,8"); expect(destination(grid, { x: 5, y: 6 }, "down")).toBeNull();
});
it("hops down ledges only and the follower uses the same legal hop", () => {
  const grid = empty(); grid.ledges.add("5,5"); grid.blocked.add("5,5");
  const m = new OverworldMovement(grid, { x: 5, y: 4 }, { x: 5, y: 3 });
  m.move("down"); m.update(FRLG.walkTileMs); expect(m.visual().player.hop).toBe(10); finish(m);
  expect(m.player).toEqual({ x: 5, y: 6 }); expect(m.follower).toEqual({ x: 5, y: 4 });
  expect(destination(grid, m.player, "up")).toBeNull(); expect(destination(grid, { x: 4, y: 5 }, "right")).toBeNull();
  m.move("down"); finish(m); expect(m.follower).toEqual({ x: 5, y: 6 });
});
it("repeated reversals detour around the player without crossing their footpoint", () => {
  const m = new OverworldMovement(empty(), { x: 5, y: 5 }, { x: 5, y: 6 });
  for (const d of ["down", "up", "left", "right", "up", "down", "right", "left"] as const) {
    const previous = { ...m.player }; expect(m.move(d)).toBe(true); finish(m); expect(m.follower).toEqual(previous);
  }
});
it("refuses a reversal in a corridor without turn space", () => {
  const grid = empty(); for (let y = 0; y < 12; y++) { grid.blocked.add(`4,${y}`); grid.blocked.add(`6,${y}`); }
  const m = new OverworldMovement(grid, { x: 5, y: 5 }, { x: 5, y: 6 });
  expect(m.move("down")).toBe(false); expect(m.busy).toBe(false);
});
it("A* takes a shortest wall detour and respects one-way ledges", () => {
  const grid = empty(); for (let y = 2; y < 8; y++) grid.blocked.add(`5,${y}`);
  const path = findPath(grid, { x: 3, y: 4 }, { x: 7, y: 4 })!;
  expect(path.length).toBe(10); expect(path.every(p => !grid.blocked.has(tileKey(p)))).toBe(true);
  expect(findPath(grid, { x: 3, y: 4 }, { x: 5, y: 4 })).toBeNull();
  const ledges = empty(); for (let x = 0; x < 12; x++) { ledges.blocked.add(`${x},5`); ledges.ledges.add(`${x},5`); }
  expect(findPath(ledges, { x: 5, y: 4 }, { x: 5, y: 6 })).toEqual([{ x: 5, y: 6 }]);
  expect(findPath(ledges, { x: 5, y: 6 }, { x: 5, y: 4 })).toBeNull();
});
it("large deltas commit every queued follower detour step", () => {
  const m = new OverworldMovement(empty(), { x: 5, y: 5 }, { x: 5, y: 6 });
  m.move("down"); m.update(2000); expect(m.busy).toBe(false); expect(m.follower).toEqual({ x: 5, y: 5 });
});
it("the shipped 40×30 map connects spawn to grass, the northern clearing and ledges", () => {
  expect([map.width, map.height, map.tilewidth]).toEqual([40, 30, 16]);
  const grid: Grid = { width: 40, height: 30, blocked: new Set(), ledges: new Set() };
  map.layers.find(l => l.name === "Collision")!.data!.forEach((gid, i) => { if (gid) grid.blocked.add(`${i % 40},${Math.floor(i / 40)}`); });
  for (const o of map.layers.find(l => l.name === "Objects")!.objects!.filter(o => o.type === "ledge")) grid.ledges.add(`${o.x / 16},${o.y / 16}`);
  for (const goal of [{ x: 5, y: 12 }, { x: 6, y: 9 }, { x: 25, y: 14 }, { x: 16, y: 6 }]) {
    const path = findPath(grid, { x: 9, y: 24 }, goal)!; expect(path).not.toBeNull();
    const m = new OverworldMovement(grid, { x: 9, y: 24 }, { x: 9, y: 25 });
    for (const to of path) { const previous = { ...m.player }; expect(m.move(directionTo(previous, to))).toBe(true); finish(m); expect(m.follower).toEqual(previous); }
  }
});
