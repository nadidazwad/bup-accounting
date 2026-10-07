import type { TypeName } from "./types";

export type MoveId =
  | "FLAMETHROWER" | "WING_ATTACK" | "SLASH" | "DRAGON_CLAW"
  | "CLOSE_COMBAT" | "MACH_PUNCH" | "THUNDERPUNCH"
  | "BLAZE_KICK" | "SKY_UPPERCUT" | "BULK_UP"
  | "THUNDERBOLT" | "QUICK_ATTACK" | "IRON_TAIL" | "THUNDER_WAVE"
  | "RAZOR_LEAF" | "SLUDGE_BOMB" | "BODY_SLAM" | "SYNTHESIS"
  | "TACKLE" | "STRING_SHOT" | "REFLECT"
  | "SURF" | "BITE" | "SKULL_BASH" | "RAIN_DANCE";

export type Effect =
  | "paralyze" | "paralyzeChance" | "flinchChance" | "selfDefDown" | "bulkUp" | "speedDownTarget"
  | "heal" | "reflect" | "rain" | "charge";

export type Move = {
  name: string; type: TypeName; power: number; accuracy: number; pp: number;
  priority?: number; highCrit?: boolean; effect?: Effect; chance?: number;
};

// Gen 3 move data (power, accuracy, PP), as in FireRed/LeafGreen.
export const moves: Record<MoveId, Move> = {
  FLAMETHROWER: { name: "FLAMETHROWER", type: "FIRE", power: 95, accuracy: 100, pp: 15 },
  WING_ATTACK: { name: "WING ATTACK", type: "FLYING", power: 60, accuracy: 100, pp: 35 },
  SLASH: { name: "SLASH", type: "NORMAL", power: 70, accuracy: 100, pp: 20, highCrit: true },
  DRAGON_CLAW: { name: "DRAGON CLAW", type: "DRAGON", power: 80, accuracy: 100, pp: 15 },
  CLOSE_COMBAT: { name: "CLOSE COMBAT", type: "FIGHTING", power: 120, accuracy: 100, pp: 5, effect: "selfDefDown" },
  MACH_PUNCH: { name: "MACH PUNCH", type: "FIGHTING", power: 40, accuracy: 100, pp: 30, priority: 1 },
  THUNDERPUNCH: { name: "THUNDERPUNCH", type: "ELECTRIC", power: 75, accuracy: 100, pp: 15, effect: "paralyzeChance", chance: 10 },
  BLAZE_KICK: { name: "BLAZE KICK", type: "FIRE", power: 85, accuracy: 90, pp: 10, highCrit: true },
  SKY_UPPERCUT: { name: "SKY UPPERCUT", type: "FIGHTING", power: 85, accuracy: 90, pp: 15 },
  BULK_UP: { name: "BULK UP", type: "FIGHTING", power: 0, accuracy: 100, pp: 20, effect: "bulkUp" },
  THUNDERBOLT: { name: "THUNDERBOLT", type: "ELECTRIC", power: 95, accuracy: 100, pp: 15, effect: "paralyzeChance", chance: 10 },
  QUICK_ATTACK: { name: "QUICK ATTACK", type: "NORMAL", power: 40, accuracy: 100, pp: 30, priority: 1 },
  IRON_TAIL: { name: "IRON TAIL", type: "STEEL", power: 100, accuracy: 75, pp: 15 },
  THUNDER_WAVE: { name: "THUNDER WAVE", type: "ELECTRIC", power: 0, accuracy: 100, pp: 20, effect: "paralyze" },
  RAZOR_LEAF: { name: "RAZOR LEAF", type: "GRASS", power: 55, accuracy: 95, pp: 25, highCrit: true },
  SLUDGE_BOMB: { name: "SLUDGE BOMB", type: "POISON", power: 90, accuracy: 100, pp: 10 },
  BODY_SLAM: { name: "BODY SLAM", type: "NORMAL", power: 85, accuracy: 100, pp: 15, effect: "paralyzeChance", chance: 30 },
  SYNTHESIS: { name: "SYNTHESIS", type: "GRASS", power: 0, accuracy: 100, pp: 5, effect: "heal" },
  TACKLE: { name: "TACKLE", type: "NORMAL", power: 35, accuracy: 95, pp: 35 },
  STRING_SHOT: { name: "STRING SHOT", type: "BUG", power: 0, accuracy: 95, pp: 40, effect: "speedDownTarget" },
  REFLECT: { name: "REFLECT", type: "PSYCHIC", power: 0, accuracy: 100, pp: 20, effect: "reflect" },
  SURF: { name: "SURF", type: "WATER", power: 95, accuracy: 100, pp: 15 },
  BITE: { name: "BITE", type: "DARK", power: 60, accuracy: 100, pp: 25, effect: "flinchChance", chance: 30 },
  SKULL_BASH: { name: "SKULL BASH", type: "NORMAL", power: 100, accuracy: 100, pp: 15, effect: "charge" },
  RAIN_DANCE: { name: "RAIN DANCE", type: "WATER", power: 0, accuracy: 100, pp: 5, effect: "rain" },
};
