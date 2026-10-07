import type { DexSpecies } from "../state/store";
import { species as speciesData, statsAt, type SpeciesInfo, type Stats } from "../data/species";
import { moves, type Move, type MoveId } from "./moves";
import { effectiveness, isSpecial } from "./types";

// A simplified Gen 3 battle engine (PLAN.md §5.2). Pure and deterministic for a
// given random source, so the scene only has to play back the events it returns.
export type Rng = () => number;
export type SideKey = "player" | "foe";
type StageKey = "attack" | "defense" | "spAttack" | "spDefense" | "speed";

export type Battler = {
  species: DexSpecies; info: SpeciesInfo; level: number; stats: Stats; hp: number; maxHp: number;
  moves: { id: MoveId; pp: number }[]; status: "par" | null; stages: Record<StageKey, number>;
  charging: MoveId | null; flinch: boolean;
};
export type Side = { team: Battler[]; active: number; reflect: number };
export type Battle = {
  kind: "wild" | "trainer"; player: Side; foe: Side; rain: number; turn: number;
  guaranteedCrit: boolean; ballsThrown: number; over: null | "win" | "lose" | "caught" | "run"; foeTurns: number;
};
export type Action = { kind: "move"; slot: number } | { kind: "switch"; to: number } | { kind: "potion"; target: number } | { kind: "ball" } | { kind: "run" };
export type BattleEvent =
  | { type: "text"; text: string }
  | { type: "move"; side: SideKey; move: MoveId }
  | { type: "hp"; side: SideKey; from: number; to: number; max: number }
  | { type: "faint"; side: SideKey }
  | { type: "withdraw"; side: SideKey }
  | { type: "sendOut"; side: SideKey; index: number }
  | { type: "ball"; shakes: number; caught: boolean }
  | { type: "stat"; side: SideKey; up: boolean }
  | { type: "status"; side: SideKey }
  | { type: "charge"; side: SideKey }
  | { type: "weather" };

const stageNames: Record<StageKey, string> = { attack: "ATTACK", defense: "DEFENSE", spAttack: "SP. ATK", spDefense: "SP. DEF", speed: "SPEED" };

export function createBattler(name: DexSpecies, hpScale = 1): Battler {
  const info = speciesData[name], stats = statsAt(info);
  const maxHp = stats.hp;
  return {
    species: name, info, level: info.level, stats, maxHp, hp: Math.max(1, Math.ceil(maxHp * hpScale)),
    moves: info.moves.map((id) => ({ id, pp: moves[id].pp })), status: null,
    stages: { attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 }, charging: null, flinch: false,
  };
}

export function createBattle(kind: Battle["kind"], player: DexSpecies[], foe: DexSpecies[], foeHpScale = 1): Battle {
  return {
    kind, rain: 0, turn: 0, guaranteedCrit: false, ballsThrown: 0, over: null, foeTurns: 0,
    player: { team: player.map((s) => createBattler(s)), active: 0, reflect: 0 },
    foe: { team: foe.map((s) => createBattler(s, foeHpScale)), active: 0, reflect: 0 },
  };
}

export const active = (b: Battle, side: SideKey) => b[side].team[b[side].active];
const other = (side: SideKey): SideKey => (side === "player" ? "foe" : "player");
export const stageMultiplier = (stage: number) => (stage >= 0 ? (2 + stage) / 2 : 2 / (2 - stage));

export function displayName(b: Battle, side: SideKey, mon = active(b, side)) {
  if (side === "player") return mon.info.name;
  return b.kind === "wild" ? `Wild ${mon.info.name}` : `Foe ${mon.info.name}`;
}

export function effectiveSpeed(mon: Battler) {
  return Math.floor(mon.stats.speed * stageMultiplier(mon.stages.speed) * (mon.status === "par" ? 0.25 : 1));
}

/** Gen 3 damage: ((2L/5+2)·P·A/D)/50, then Reflect, weather, +2, crit, random, STAB, type. */
export function damage(attacker: Battler, defender: Battler, move: Move, opts: { crit: boolean; roll: number; rain: boolean; reflect: boolean }) {
  if (!move.power) return 0;
  const special = isSpecial(move.type);
  const atkKey: StageKey = special ? "spAttack" : "attack", defKey: StageKey = special ? "spDefense" : "defense";
  // Critical hits ignore the attacker's drops and the defender's boosts.
  const atkStage = opts.crit ? Math.max(0, attacker.stages[atkKey]) : attacker.stages[atkKey];
  const defStage = opts.crit ? Math.min(0, defender.stages[defKey]) : defender.stages[defKey];
  const a = Math.floor(attacker.stats[atkKey] * stageMultiplier(atkStage));
  const d = Math.max(1, Math.floor(defender.stats[defKey] * stageMultiplier(defStage)));
  let base = Math.floor(Math.floor((Math.floor((2 * attacker.level) / 5) + 2) * move.power * a / d) / 50);
  if (opts.reflect && !special && !opts.crit) base = Math.floor(base / 2);
  if (opts.rain && move.type === "WATER") base = Math.floor(base * 1.5);
  if (opts.rain && move.type === "FIRE") base = Math.floor(base / 2);
  base += 2;
  if (opts.crit) base *= 2;
  base = Math.floor((base * opts.roll) / 100);
  if (attacker.info.types.includes(move.type)) base = Math.floor(base * 1.5);
  base = Math.floor(base * effectiveness(move.type, defender.info.types));
  return effectiveness(move.type, defender.info.types) === 0 ? 0 : Math.max(1, base);
}

/** Expected damage with an average roll, used by the trainer AI. */
export function expectedDamage(b: Battle, user: Battler, target: Battler, id: MoveId, targetSide: SideKey) {
  const move = moves[id];
  return damage(user, target, move, { crit: false, roll: 92, rain: b.rain > 0, reflect: b[targetSide].reflect > 0 }) * (move.accuracy / 100);
}

export function chooseFoeAction(b: Battle, rng: Rng): Action {
  const foe = active(b, "foe"), target = active(b, "player");
  const usable = foe.moves.map((m, slot) => ({ ...m, slot })).filter((m) => m.pp > 0);
  if (!usable.length) return { kind: "move", slot: 0 };
  if (b.kind === "wild") return { kind: "move", slot: usable[Math.floor(rng() * usable.length)].slot };
  // THE BROKER's ace opens with RAIN DANCE against a FIRE type.
  const rain = usable.find((m) => m.id === "RAIN_DANCE");
  if (rain && b.foeTurns === 0 && b.rain === 0 && target.info.types.includes("FIRE")) return { kind: "move", slot: rain.slot };
  const heal = usable.find((m) => m.id === "SYNTHESIS");
  if (heal && foe.hp < foe.maxHp * 0.35 && rng() < 0.6) return { kind: "move", slot: heal.slot };
  if (rng() < 0.7) {
    const best = usable.reduce((x, y) => (expectedDamage(b, foe, target, y.id, "player") > expectedDamage(b, foe, target, x.id, "player") ? y : x));
    if (expectedDamage(b, foe, target, best.id, "player") > 0) return { kind: "move", slot: best.slot };
  }
  return { kind: "move", slot: usable[Math.floor(rng() * usable.length)].slot };
}

/** Gen 3 catch chance (modified: a friendlier ×3 rate, and the third ball always works). */
export function catchResult(b: Battle, rng: Rng) {
  const mon = active(b, "foe");
  if (b.ballsThrown >= 3) return { shakes: 3, caught: true };
  let a = Math.floor(((3 * mon.maxHp - 2 * mon.hp) * mon.info.catchRate * 3) / (3 * mon.maxHp));
  if (mon.status === "par") a = Math.floor(a * 1.5);
  if (a >= 255) return { shakes: 3, caught: true };
  const shake = Math.floor(1048560 / Math.sqrt(Math.sqrt(16711680 / Math.max(1, a))));
  let shakes = 0;
  while (shakes < 4 && rng() * 65536 < shake) shakes++;
  return shakes === 4 ? { shakes: 3, caught: true } : { shakes: Math.min(3, shakes), caught: false };
}

function setHp(events: BattleEvent[], side: SideKey, mon: Battler, to: number) {
  const from = mon.hp;
  mon.hp = Math.max(0, Math.min(mon.maxHp, to));
  if (mon.hp !== from) events.push({ type: "hp", side, from, to: mon.hp, max: mon.maxHp });
}

function changeStage(events: BattleEvent[], b: Battle, side: SideKey, mon: Battler, key: StageKey, delta: number) {
  const name = displayName(b, side, mon);
  const next = Math.max(-6, Math.min(6, mon.stages[key] + delta));
  if (next === mon.stages[key]) { events.push({ type: "text", text: `${name}’s ${stageNames[key]} won’t go ${delta > 0 ? "higher" : "lower"}!` }); return; }
  mon.stages[key] = next;
  events.push({ type: "stat", side, up: delta > 0 }, { type: "text", text: `${name}’s ${stageNames[key]} ${delta > 0 ? "rose" : "fell"}!` });
}

function useMove(b: Battle, side: SideKey, slot: number, movedFirst: boolean, rng: Rng, events: BattleEvent[]) {
  const user = active(b, side), targetSide = other(side), target = active(b, targetSide);
  if (user.hp <= 0) return;
  const name = displayName(b, side, user);
  if (user.flinch) { user.flinch = false; events.push({ type: "text", text: `${name} flinched!` }); return; }
  if (user.status === "par" && rng() < 0.25) { user.charging = null; events.push({ type: "status", side }, { type: "text", text: `${name} is paralyzed! It can’t move!` }); return; }
  const charging = user.charging;
  const id = charging ?? user.moves[slot].id;
  const move = moves[id];
  if (!charging) user.moves[slot].pp = Math.max(0, user.moves[slot].pp - 1);
  events.push({ type: "text", text: `${name} used ${move.name}!` });
  if (move.effect === "charge" && !charging) {
    user.charging = id;
    events.push({ type: "charge", side }, { type: "text", text: `${name} lowered its head!` });
    changeStage(events, b, side, user, "defense", 1);
    return;
  }
  user.charging = null;
  const fail = () => events.push({ type: "text", text: "But it failed!" });
  if (move.power === 0) {
    switch (move.effect) {
      case "rain":
        if (b.rain) { fail(); return; }
        b.rain = 5; events.push({ type: "move", side, move: id }, { type: "weather" }, { type: "text", text: "It started to rain!" }); return;
      case "reflect":
        if (b[side].reflect) { fail(); return; }
        b[side].reflect = 5; events.push({ type: "move", side, move: id }, { type: "text", text: `${side === "player" ? "Your" : "The foe’s"} team became stronger against physical moves!` }); return;
      case "heal": {
        if (user.hp >= user.maxHp) { fail(); return; }
        events.push({ type: "move", side, move: id });
        setHp(events, side, user, user.hp + Math.floor(user.maxHp / (b.rain ? 4 : 2)));
        events.push({ type: "text", text: `${name} regained health!` }); return;
      }
      case "bulkUp":
        events.push({ type: "move", side, move: id });
        changeStage(events, b, side, user, "attack", 1); changeStage(events, b, side, user, "defense", 1); return;
      case "speedDownTarget":
        if (rng() * 100 >= move.accuracy) { events.push({ type: "text", text: `${name}’s attack missed!` }); return; }
        events.push({ type: "move", side, move: id });
        changeStage(events, b, targetSide, target, "speed", -1); return;
      case "paralyze":
        if (target.status || effectiveness(move.type, target.info.types) === 0) { fail(); return; }
        events.push({ type: "move", side, move: id });
        target.status = "par";
        events.push({ type: "status", side: targetSide }, { type: "text", text: `${displayName(b, targetSide)} is paralyzed! It may be unable to move!` }); return;
    }
    return;
  }
  if (rng() * 100 >= move.accuracy) { events.push({ type: "text", text: `${name}’s attack missed!` }); return; }
  const multiplier = effectiveness(move.type, target.info.types);
  if (multiplier === 0) { events.push({ type: "text", text: `It doesn’t affect ${displayName(b, targetSide)}…` }); return; }
  const crit = (side === "player" && b.guaranteedCrit) || rng() < (move.highCrit ? 1 / 8 : 1 / 16);
  const roll = 85 + Math.floor(rng() * 16);
  let dealt = damage(user, target, move, { crit, roll, rain: b.rain > 0, reflect: b[targetSide].reflect > 0 });
  // Wild POKéMON here are auditioning to join you: they pull their punches.
  if (b.kind === "wild" && side === "foe") dealt = Math.ceil(dealt / 2);
  events.push({ type: "move", side, move: id });
  // Wild POKéMON in this story always hang on at 1 HP so they can be caught.
  const floor = b.kind === "wild" && targetSide === "foe" ? 1 : 0;
  const endured = floor > 0 && target.hp - dealt < 1;
  setHp(events, targetSide, target, Math.max(floor, target.hp - dealt));
  if (crit) events.push({ type: "text", text: "A critical hit!" });
  if (multiplier > 1) events.push({ type: "text", text: "It’s super effective!" });
  if (multiplier < 1) events.push({ type: "text", text: "It’s not very effective…" });
  if (endured) events.push({ type: "text", text: `${displayName(b, targetSide)} is hanging on by a thread! Throw a POKé BALL!` });
  if (target.hp > 0) {
    if (move.effect === "paralyzeChance" && !target.status && rng() * 100 < (move.chance ?? 0)) {
      target.status = "par";
      events.push({ type: "status", side: targetSide }, { type: "text", text: `${displayName(b, targetSide)} is paralyzed! It may be unable to move!` });
    }
    if (move.effect === "flinchChance" && movedFirst && rng() * 100 < (move.chance ?? 0)) target.flinch = true;
  }
  if (move.effect === "selfDefDown") { changeStage(events, b, side, user, "defense", -1); changeStage(events, b, side, user, "spDefense", -1); }
  if (target.hp === 0) events.push({ type: "faint", side: targetSide }, { type: "text", text: targetSide === "foe" ? `${displayName(b, "foe")} fainted!` : `${target.info.name} fainted!` });
}

const priority = (b: Battle, side: SideKey, action: Action) => {
  if (action.kind !== "move") return 6;
  const mon = active(b, side);
  return moves[mon.charging ?? mon.moves[action.slot].id].priority ?? 0;
};

export function runTurn(b: Battle, playerAction: Action, rng: Rng, foeAction: Action = chooseFoeAction(b, rng)): BattleEvent[] {
  const events: BattleEvent[] = [];
  b.turn++;
  for (const side of ["player", "foe"] as const) active(b, side).flinch = false;
  const p = active(b, "player");
  // Non-move actions always go first.
  if (playerAction.kind === "run") {
    if (b.kind === "trainer") { events.push({ type: "text", text: "No! There’s no running from a trainer battle!" }); return events; }
    events.push({ type: "text", text: "Got away safely!" }); b.over = "run"; return events;
  }
  if (playerAction.kind === "switch") {
    events.push({ type: "text", text: `${p.info.name}, come back!` }, { type: "withdraw", side: "player" });
    b.player.active = playerAction.to; p.stages = { attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 }; p.charging = null;
    events.push({ type: "text", text: `Go! ${active(b, "player").info.name}!` }, { type: "sendOut", side: "player", index: playerAction.to });
  }
  if (playerAction.kind === "potion") {
    const mon = b.player.team[playerAction.target];
    const before = mon.hp;
    setHp(events, "player", mon, mon.hp + 20);
    events.push({ type: "text", text: `${mon.info.name}’s HP was restored by ${mon.hp - before} point(s).` });
  }
  if (playerAction.kind === "ball") {
    if (b.kind === "trainer") {
      events.push({ type: "text", text: "The trainer blocked the BALL! Don’t be a thief!" });
    } else {
      b.ballsThrown++;
      const result = catchResult(b, rng);
      events.push({ type: "ball", ...result });
      if (result.caught) { events.push({ type: "text", text: `Gotcha! ${active(b, "foe").info.name} was caught!` }); b.over = "caught"; return events; }
      events.push({ type: "text", text: ["Oh, no! The POKéMON broke free!", "Aww! It appeared to be caught!", "Aargh! Almost had it!", "Shoot! It was so close, too!"][result.shakes] });
    }
  }
  const order: SideKey[] = [];
  if (playerAction.kind === "move") {
    const pp = priority(b, "player", playerAction), fp = priority(b, "foe", foeAction);
    const ps = effectiveSpeed(active(b, "player")), fs = effectiveSpeed(active(b, "foe"));
    const playerFirst = pp !== fp ? pp > fp : ps !== fs ? ps > fs : rng() < 0.5;
    order.push(...(playerFirst ? ["player", "foe"] as const : ["foe", "player"] as const));
  } else order.push("foe");
  order.forEach((side, i) => {
    if (b.over || active(b, "player").hp <= 0 || active(b, "foe").hp <= 0) return;
    const action = side === "player" ? playerAction : foeAction;
    if (action.kind !== "move") return;
    useMove(b, side, action.slot, i === 0, rng, events);
    if (side === "foe") b.foeTurns++;
  });
  // End of turn: weather and screens wind down.
  if (b.rain > 0) { b.rain--; events.push({ type: "text", text: b.rain ? "Rain continues to fall." : "The rain stopped." }); }
  for (const side of ["player", "foe"] as const) {
    if (b[side].reflect > 0 && --b[side].reflect === 0) events.push({ type: "text", text: `${side === "player" ? "Your" : "The foe’s"} team’s REFLECT wore off!` });
  }
  if (b.foe.team.every((m) => m.hp <= 0)) b.over = "win";
  else if (b.player.team.every((m) => m.hp <= 0)) b.over = "lose";
  return events;
}

export const nextFoe = (b: Battle) => b.foe.team.findIndex((m, i) => i > b.foe.active && m.hp > 0);
export const canSwitchTo = (b: Battle, i: number) => i !== b.player.active && (b.player.team[i]?.hp ?? 0) > 0;

/** A free switch (after a faint, or in Shift mode before the foe's next POKéMON). */
export function switchPlayer(b: Battle, to: number, recall = true): BattleEvent[] {
  const events: BattleEvent[] = [];
  const old = active(b, "player");
  if (recall) events.push({ type: "text", text: `${old.info.name}, come back!` }, { type: "withdraw", side: "player" });
  old.stages = { attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 }; old.charging = null;
  b.player.active = to;
  events.push({ type: "text", text: `Go! ${active(b, "player").info.name}!` }, { type: "sendOut", side: "player", index: to });
  return events;
}

export function sendOutFoe(b: Battle, index: number): BattleEvent[] {
  b.foe.active = index; b.foeTurns = 0;
  return [{ type: "sendOut", side: "foe", index }];
}

/** Gen 3 EXP for a single participant; trainer battles give ×1.5. */
export function expYield(b: Battle, fainted: Battler) {
  return Math.floor((fainted.info.baseExp * fainted.level * (b.kind === "trainer" ? 1.5 : 1)) / 7);
}

/** Deterministic random source for tests and replays. */
export function seeded(seed: number): Rng {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
