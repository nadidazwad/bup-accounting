import type { DexSpecies } from "../state/store";
import type { MoveId } from "../battle/moves";
import type { TypeName } from "../battle/types";

export type { TypeName };
export type Stats = { hp: number; attack: number; defense: number; spAttack: number; spDefense: number; speed: number };
export type SpeciesInfo = {
  key: string; name: string; dex: number; types: TypeName[]; level: number; gender: "♂" | "♀";
  base: Stats; moves: MoveId[]; category: string; height: string; weight: string; entry: string;
  happy: string; catchRate: number; baseExp: number;
};

// Real base stats (PokeAPI), levels and movesets from PLAN.md §5.2 / Revision 2.
// Dex categories and sizes are the real ones; entries are rewritten as office jokes.
export const species: Record<DexSpecies, SpeciesInfo> = {
  Venusaur: {
    key: "venusaur", name: "VENUSAUR", dex: 3, types: ["GRASS", "POISON"], level: 49, gender: "♂",
    base: { hp: 80, attack: 82, defense: 83, spAttack: 100, spDefense: 100, speed: 80 },
    moves: ["RAZOR_LEAF", "SLUDGE_BOMB", "BODY_SLAM", "SYNTHESIS"], catchRate: 45, baseExp: 208,
    category: "SEED", height: "6’07”", weight: "220.5 lbs.",
    entry: "The flower on its back blooms only after quarter-end close. Its sweet scent calms brokers and makes interns oddly productive.",
    happy: "VENUSAUR is quietly photosynthesizing your expense report.",
  },
  Charizard: {
    key: "charizard", name: "CHARIZARD", dex: 6, types: ["FIRE", "FLYING"], level: 50, gender: "♂",
    base: { hp: 78, attack: 84, defense: 78, spAttack: 109, spDefense: 85, speed: 100 },
    moves: ["FLAMETHROWER", "WING_ATTACK", "SLASH", "DRAGON_CLAW"], catchRate: 45, baseExp: 209,
    category: "FLAME", height: "5’07”", weight: "199.5 lbs.",
    entry: "It breathes fire hot enough to melt a filing cabinet. It never burns receipts, though. It knows the retention policy is seven years.",
    happy: "CHARIZARD is looking at you happily. A balanced party makes a balanced ledger!",
  },
  Blastoise: {
    key: "blastoise", name: "BLASTOISE", dex: 9, types: ["WATER"], level: 50, gender: "♂",
    base: { hp: 79, attack: 83, defense: 100, spAttack: 85, spDefense: 105, speed: 78 },
    moves: ["SURF", "BITE", "SKULL_BASH", "RAIN_DANCE"], catchRate: 45, baseExp: 210,
    category: "SHELLFISH", height: "5’03”", weight: "188.5 lbs.",
    entry: "The cannons on its shell can blast a hole through a spreadsheet at 50 paces. It is THE BROKER’s top-performing asset.",
    happy: "BLASTOISE is checking your figures.",
  },
  Caterpie: {
    key: "caterpie", name: "CATERPIE", dex: 10, types: ["BUG"], level: 12, gender: "♂",
    base: { hp: 45, attack: 30, defense: 35, spAttack: 20, spDefense: 20, speed: 45 },
    moves: ["TACKLE", "STRING_SHOT"], catchRate: 255, baseExp: 53,
    category: "WORM", height: "1’00”", weight: "6.4 lbs.",
    entry: "Its short feet are tipped with suction pads that let it climb any org chart. It is still an intern after three years.",
    happy: "CATERPIE is chewing a sticky note.",
  },
  Pikachu: {
    key: "pikachu", name: "PIKACHU", dex: 25, types: ["ELECTRIC"], level: 48, gender: "♂",
    base: { hp: 35, attack: 55, defense: 30, spAttack: 50, spDefense: 40, speed: 90 },
    moves: ["THUNDERBOLT", "QUICK_ATTACK", "IRON_TAIL", "THUNDER_WAVE"], catchRate: 190, baseExp: 82,
    category: "MOUSE", height: "1’04”", weight: "13.2 lbs.",
    entry: "It stores electricity in its cheeks and releases it when someone says “just a quick sync”. Offices with PIKACHU never lose power at month-end.",
    happy: "PIKACHU is cheek-sparking at the idea of a balanced budget.",
  },
  Bayleef: {
    key: "bayleef", name: "BAYLEEF", dex: 153, types: ["GRASS"], level: 38, gender: "♀",
    base: { hp: 60, attack: 62, defense: 80, spAttack: 63, spDefense: 80, speed: 60 },
    moves: ["RAZOR_LEAF", "BODY_SLAM", "REFLECT", "SYNTHESIS"], catchRate: 45, baseExp: 141,
    category: "LEAF", height: "3’11”", weight: "34.8 lbs.",
    entry: "The spicy aroma of the buds around its neck makes anyone who smells it want to reconcile the petty cash. Nobody knows why.",
    happy: "BAYLEEF is sniffing a ledger.",
  },
  Blaziken: {
    key: "blaziken", name: "BLAZIKEN", dex: 257, types: ["FIRE", "FIGHTING"], level: 50, gender: "♂",
    base: { hp: 80, attack: 120, defense: 70, spAttack: 110, spDefense: 70, speed: 80 },
    moves: ["BLAZE_KICK", "SKY_UPPERCUT", "SLASH", "BULK_UP"], catchRate: 45, baseExp: 209,
    category: "BLAZE", height: "6’03”", weight: "114.6 lbs.",
    entry: "Its kicks clear a 30-story building, mostly when someone schedules a meeting that could have been an email.",
    happy: "BLAZIKEN is doing leg day. Every day is leg day.",
  },
  Infernape: {
    key: "infernape", name: "INFERNAPE", dex: 392, types: ["FIRE", "FIGHTING"], level: 50, gender: "♂",
    base: { hp: 76, attack: 104, defense: 71, spAttack: 104, spDefense: 71, speed: 108 },
    moves: ["FLAMETHROWER", "CLOSE_COMBAT", "MACH_PUNCH", "THUNDERPUNCH"], catchRate: 45, baseExp: 209,
    category: "FLAME", height: "3’11”", weight: "121.3 lbs.",
    entry: "Its crown of fire never goes out. It uses its speed to be first in line at the office coffee machine, every single morning.",
    happy: "INFERNAPE is shadowboxing a stack of invoices.",
  },
};

export const dexOrder: DexSpecies[] = ["Venusaur", "Charizard", "Blastoise", "Caterpie", "Pikachu", "Bayleef", "Blaziken", "Infernape"];

// Gen 3 stat formulas with 31 IVs, 0 EVs and a neutral nature.
export function statsAt(info: SpeciesInfo, level = info.level): Stats {
  const other = (base: number) => Math.floor(((2 * base + 31) * level) / 100) + 5;
  return {
    hp: Math.floor(((2 * info.base.hp + 31) * level) / 100) + level + 10,
    attack: other(info.base.attack), defense: other(info.base.defense), spAttack: other(info.base.spAttack),
    spDefense: other(info.base.spDefense), speed: other(info.base.speed),
  };
}

export const typeIndex: Record<TypeName, number> = {
  NORMAL: 0, FIRE: 1, WATER: 2, GRASS: 3, ELECTRIC: 4, ROCK: 5, GROUND: 6, ICE: 7,
  FLYING: 8, FIGHTING: 9, GHOST: 10, BUG: 11, POISON: 12, PSYCHIC: 13, STEEL: 14, DARK: 15, DRAGON: 16,
};
