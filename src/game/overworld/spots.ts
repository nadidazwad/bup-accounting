import type { ItemId, Species } from "../state/store";
import type { Direction, Grid, Tile } from "./navigation";
import { tileKey, vectors, walkable } from "./navigation";

export type SpotReward =
  | { kind: "species"; species: Species }
  | { kind: "item"; item: ItemId; lines: string[] }
  | { kind: "spreadsheet" }
  | { kind: "nothing"; lines: string[] };

// PLAN.md §4.2: two real hiding spots and six decoys with accounting jokes.
export const spotRewards: Record<string, SpotReward> = {
  venusaur: { kind: "species", species: "Venusaur" },
  pikachu: { kind: "species", species: "Pikachu" },
  spreadsheet: { kind: "spreadsheet" },
  potion: { kind: "item", item: "POTION", lines: ["It’s actually useful! THE AUDITOR won’t know what hit them."] },
  receipt: { kind: "item", item: "RECEIPT", lines: ["It’s from 2019. Better keep it, just in case."] },
  calculator: { kind: "item", item: "CALCULATOR", lines: ["It only does addition. Subtraction is a paid upgrade."] },
  invoice: { kind: "item", item: "OLD_INVOICE", lines: ["It’s still unpaid. NET 30 became NET 6,000."] },
  "tax-form": { kind: "nothing", lines: ["There’s nothing here but a tax form…", "It was due yesterday."] },
};

/** Opened spots are saved as "id", or "id:x,y" when a bush was pushed to x,y. */
export function parseOpened(entries: readonly string[]) {
  const opened = new Map<string, Tile | null>();
  for (const entry of entries) {
    const [id, at] = entry.split(":");
    const [x, y] = (at ?? "").split(",").map(Number);
    opened.set(id, at && Number.isInteger(x) && Number.isInteger(y) ? { x, y } : null);
  }
  return opened;
}

/**
 * Where a pushed bush slides: straight ahead if free, else to either side.
 * A Strength-style slide never lands on a ledge, an actor or the map edge.
 */
export function pushTarget(grid: Grid, bush: Tile, facing: Direction, avoid: readonly Tile[]): Tile | null {
  const sides: Record<Direction, Direction[]> = { up: ["up", "left", "right"], down: ["down", "left", "right"], left: ["left", "up", "down"], right: ["right", "up", "down"] };
  for (const d of sides[facing]) {
    const to = { x: bush.x + vectors[d].x, y: bush.y + vectors[d].y };
    if (walkable(grid, to) && !grid.ledges.has(tileKey(to)) && !avoid.some((p) => p.x === to.x && p.y === to.y)) return to;
  }
  return null;
}
