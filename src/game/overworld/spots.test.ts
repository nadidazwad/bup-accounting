import { expect, it } from "vitest";
import { parseOpened, pushTarget, spotRewards } from "./spots";
import type { Grid } from "./navigation";

it("has exactly two captures and six optional decoys", () => {
  expect(Object.values(spotRewards).filter(r => r.kind === 'species')).toEqual([
    { kind: 'species', species: 'Venusaur' }, { kind: 'species', species: 'Pikachu' },
  ]);
  expect(Object.keys(spotRewards)).toHaveLength(8);
});
it("restores cut trees and the exact final bush tile", () => {
  const opened = parseOpened(['pikachu', 'venusaur:7,5']);
  expect(opened.get('pikachu')).toBeNull();
  expect(opened.get('venusaur')).toEqual({ x: 7, y: 5 });
});
it("keeps bushes off ledges, actors and occupied tiles and refuses a trapped push", () => {
  const grid: Grid = { width: 5, height: 5, blocked: new Set(['2,2', '2,1']), ledges: new Set(['1,2']) };
  expect(pushTarget(grid, { x: 2, y: 2 }, 'up', [])).toEqual({ x: 3, y: 2 });
  expect(pushTarget(grid, { x: 2, y: 2 }, 'up', [{ x: 3, y: 2 }])).toBeNull();
});
