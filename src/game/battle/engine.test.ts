import { describe, expect, it } from "vitest";
import { active, catchResult, chooseFoeAction, createBattle, createBattler, damage, expYield, runTurn, seeded } from "./engine";
import { moves } from "./moves";
import { effectiveness } from "./types";

const charizard = createBattler("Charizard"), bayleef = createBattler("Bayleef");
const none = { crit: false, roll: 100, rain: false, reflect: false };
const fixed = (...values: number[]) => { let i = 0; return () => values[i++ % values.length]; };

describe("Gen 3 damage formula (hand-calculated)", () => {
  // Charizard L50 SpA 129 vs Bayleef L38 SpD 77: floor(22·95·129/77)=3501 → /50=70 → +2=72 → STAB 108 → ×2 = 216.
  it("Flamethrower vs Bayleef", () => expect(damage(charizard, bayleef, moves.FLAMETHROWER, none)).toBe(216));
  // Rain halves fire before the +2: 35+2 = 37 → STAB 55 → ×2 = 110.
  it("Flamethrower in rain", () => expect(damage(charizard, bayleef, moves.FLAMETHROWER, { ...none, rain: true })).toBe(110));
  // A critical hit doubles after the +2: 144 → STAB 216 → ×2 = 432.
  it("critical Flamethrower", () => expect(damage(charizard, bayleef, moves.FLAMETHROWER, { ...none, crit: true })).toBe(432));
  // Caterpie L12 Atk 15 vs Charizard Def 98, minimum roll: 0+2 → floor(2·0.85)=1.
  it("Caterpie Tackle at the minimum roll", () => expect(damage(createBattler("Caterpie"), charizard, moves.TACKLE, { ...none, roll: 85 })).toBe(1));
  // Pikachu L48 SpA 67 vs Blastoise SpD 125: floor(21·95·67/125)=1069 → 21 → 23 → STAB 34 → ×2 = 68.
  it("Thunderbolt vs Blastoise", () => expect(damage(createBattler("Pikachu"), createBattler("Blastoise"), moves.THUNDERBOLT, none)).toBe(68));
});

it("type chart covers immunities and dual types", () => {
  expect(effectiveness("ELECTRIC", ["WATER"])).toBe(2);
  expect(effectiveness("FIGHTING", ["NORMAL"])).toBe(2);
  expect(effectiveness("NORMAL", ["GHOST"])).toBe(0);
  expect(effectiveness("GRASS", ["FIRE", "FLYING"])).toBe(0.25);
  expect(effectiveness("ROCK", ["FIRE", "FLYING"])).toBe(4);
});

it("priority beats speed, then speed decides", () => {
  const b = createBattle("trainer", ["Pikachu"], ["Blastoise"]);
  const events = runTurn(b, { kind: "move", slot: 1 }, fixed(0.99, 0.5, 0.5), { kind: "move", slot: 0 });
  const used = events.filter((e) => e.type === "text" && e.text.includes(" used ")).map((e) => (e as { text: string }).text);
  expect(used[0]).toBe("PIKACHU used QUICK ATTACK!");
  const slow = createBattle("trainer", ["Caterpie"], ["Pikachu"]);
  const order = runTurn(slow, { kind: "move", slot: 0 }, fixed(0.99, 0.5), { kind: "move", slot: 0 }).filter((e) => e.type === "text" && e.text.includes(" used "));
  expect((order[0] as { text: string }).text).toContain("Foe PIKACHU");
});

it("Skull Bash charges, raises Defense, then strikes without spending more PP", () => {
  const b = createBattle("trainer", ["Charizard"], ["Blastoise"]);
  const rng = seeded(4);
  const slot = active(b, "foe").moves.findIndex((m) => m.id === "SKULL_BASH");
  runTurn(b, { kind: "move", slot: 1 }, rng, { kind: "move", slot });
  expect(active(b, "foe").charging).toBe("SKULL_BASH");
  expect(active(b, "foe").stages.defense).toBe(1);
  const pp = active(b, "foe").moves[slot].pp;
  const events = runTurn(b, { kind: "move", slot: 1 }, rng);
  expect(events.some((e) => e.type === "text" && e.text === "Foe BLASTOISE used SKULL BASH!")).toBe(true);
  expect(active(b, "foe").moves[slot].pp).toBe(pp);
  expect(active(b, "foe").charging).toBeNull();
});

it("Blastoise opens with Rain Dance against a fire type, and rain lasts five turns", () => {
  const b = createBattle("trainer", ["Charizard"], ["Blastoise"]);
  const action = chooseFoeAction(b, seeded(1));
  expect(action).toEqual({ kind: "move", slot: 3 });
  runTurn(b, { kind: "move", slot: 1 }, seeded(2), action);
  expect(b.rain).toBe(4);
  for (let i = 0; i < 4; i++) runTurn(b, { kind: "potion", target: 0 }, seeded(i + 3), { kind: "move", slot: 1 });
  expect(b.rain).toBe(0);
});

it("Reflect halves physical damage only", () => {
  const blaziken = createBattler("Blaziken"), target = createBattler("Bayleef");
  // Blaziken Atk 140 vs Bayleef Def 77: floor(22·70·140/77)=2800 → 56 → 58; Reflect halves first: 28 → 30.
  expect(damage(blaziken, target, moves.SLASH, none)).toBe(58);
  expect(damage(blaziken, target, moves.SLASH, { ...none, reflect: true })).toBe(30);
  expect(damage(blaziken, target, moves.BLAZE_KICK, { ...none, reflect: true })).toBe(damage(blaziken, target, moves.BLAZE_KICK, none));
});

it("wild POKéMON hang on at 1 HP, and the third ball always catches", () => {
  const b = createBattle("wild", ["Charizard"], ["Venusaur"]);
  for (let i = 0; i < 6; i++) runTurn(b, { kind: "move", slot: 0 }, seeded(i), { kind: "move", slot: 3 });
  expect(active(b, "foe").hp).toBeGreaterThanOrEqual(1);
  expect(b.over).toBeNull();
  b.ballsThrown = 3;
  expect(catchResult(b, () => 0.99).caught).toBe(true);
});

it("losing every POKéMON ends the battle; rematches start the foe with less HP", () => {
  const b = createBattle("trainer", ["Pikachu"], ["Blastoise"]);
  active(b, "player").hp = 1;
  runTurn(b, { kind: "move", slot: 0 }, () => 0.5, { kind: "move", slot: 0 });
  expect(b.over).toBe("lose");
  const rematch = createBattle("trainer", ["Pikachu"], ["Blastoise"], 0.75);
  expect(active(rematch, "foe").hp).toBe(Math.ceil(active(rematch, "foe").maxHp * 0.75));
  expect(expYield(rematch, active(rematch, "foe"))).toBe(Math.floor((210 * 50 * 1.5) / 7));
});
