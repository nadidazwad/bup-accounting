import { expect, it } from "vitest";
import { RadioPlaylist } from "./radio";

it("hears all songs once per round without adjacent repeats across shuffled rounds", () => {
  let seed = 17;
  const playlist = new RadioPlaylist(3, () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32));
  let last: number | null = null;
  for (let round = 0; round < 100; round++) {
    const heard: number[] = [];
    for (let song = 0; song < 3; song++) {
      const next = playlist.next();
      expect(next).not.toBe(last);
      heard.push(next); last = next;
    }
    expect([...heard].sort()).toEqual([0, 1, 2]);
  }
});

it("the starting song and order depend on the shuffle", () => {
  const a = new RadioPlaylist(3, () => 0), b = new RadioPlaylist(3, () => 0.99);
  const first = Array.from({ length: 3 }, () => a.next());
  const second = Array.from({ length: 3 }, () => b.next());
  expect(first[0]).not.toBe(second[0]);
  expect(first).not.toEqual(second);
});

it("R offers off after a full round, while car changes and song endings keep playing", () => {
  const playlist = new RadioPlaylist(3, () => 0);
  const heard = [playlist.next(), playlist.cycle(), playlist.cycle()];
  expect(new Set(heard).size).toBe(3);
  expect(playlist.cycle()).toBeNull();
  expect(playlist.cycle()).not.toBe(heard[2]);
  expect(playlist.next()).not.toBeNull();
  expect(playlist.next()).not.toBeNull();
  expect(playlist.next()).not.toBeNull();
});
