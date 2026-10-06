import type { DexSpecies } from "../state/store";

export type TypeName = "NORMAL" | "FIRE" | "WATER" | "GRASS" | "ELECTRIC" | "ROCK" | "GROUND" | "ICE" | "FLYING" | "FIGHTING" | "GHOST" | "BUG" | "POISON" | "PSYCHIC" | "STEEL" | "DARK" | "DRAGON";
export type Stats = { hp: number; attack: number; defense: number; spAttack: number; spDefense: number; speed: number };
export type MoveInfo = { name: string; type: TypeName; pp: number };
export type SpeciesInfo = {
  key: string; name: string; dex: number; types: TypeName[]; level: number; gender: "♂" | "♀";
  base: Stats; moves: MoveInfo[]; category: string; height: string; weight: string; entry: string;
  happy: string; hm: { cut: boolean; strength: boolean };
};

// Real Gen 3 base stats (PokeAPI), levels and movesets from PLAN.md §5.2.
// Dex categories keep their original sizes; entries are rewritten as accounting jokes.
export const species: Record<DexSpecies, SpeciesInfo> = {
  Venusaur: {
    key: "venusaur", name: "VENUSAUR", dex: 3, types: ["GRASS", "POISON"], level: 49, gender: "♂",
    base: { hp: 80, attack: 82, defense: 83, spAttack: 100, spDefense: 100, speed: 80 },
    moves: [{ name: "RAZOR LEAF", type: "GRASS", pp: 25 }, { name: "SLUDGE BOMB", type: "POISON", pp: 10 }, { name: "BODY SLAM", type: "NORMAL", pp: 15 }, { name: "SYNTHESIS", type: "GRASS", pp: 5 }],
    category: "SEED", height: "6’07”", weight: "220.5 lbs.",
    entry: "The flower on its back blooms only after quarter-end close. Its sweet scent calms auditors and makes interns oddly productive.",
    happy: "VENUSAUR is quietly photosynthesizing your expense report.", hm: { cut: true, strength: true },
  },
  Charizard: {
    key: "charizard", name: "CHARIZARD", dex: 6, types: ["FIRE", "FLYING"], level: 50, gender: "♂",
    base: { hp: 78, attack: 84, defense: 78, spAttack: 109, spDefense: 85, speed: 100 },
    moves: [{ name: "FLAMETHROWER", type: "FIRE", pp: 15 }, { name: "WING ATTACK", type: "FLYING", pp: 35 }, { name: "SLASH", type: "NORMAL", pp: 20 }, { name: "DRAGON CLAW", type: "DRAGON", pp: 15 }],
    category: "FLAME", height: "5’07”", weight: "199.5 lbs.",
    entry: "It breathes fire hot enough to melt a filing cabinet. It never burns receipts, though. It knows the retention policy is seven years.",
    happy: "CHARIZARD is looking at you happily. A balanced party makes a balanced ledger!", hm: { cut: true, strength: true },
  },
  Blastoise: {
    key: "blastoise", name: "BLASTOISE", dex: 9, types: ["WATER"], level: 50, gender: "♂",
    base: { hp: 79, attack: 83, defense: 100, spAttack: 85, spDefense: 105, speed: 78 },
    moves: [{ name: "SURF", type: "WATER", pp: 15 }, { name: "BITE", type: "DARK", pp: 25 }, { name: "SKULL BASH", type: "NORMAL", pp: 15 }, { name: "RAIN DANCE", type: "WATER", pp: 5 }],
    category: "SHELLFISH", height: "5’03”", weight: "188.5 lbs.",
    entry: "The cannons on its shell can blast a hole through a spreadsheet at 50 paces. It uses them to wash away creative accounting.",
    happy: "BLASTOISE is checking your figures.", hm: { cut: false, strength: true },
  },
  Caterpie: {
    key: "caterpie", name: "CATERPIE", dex: 10, types: ["BUG"], level: 12, gender: "♂",
    base: { hp: 45, attack: 30, defense: 35, spAttack: 20, spDefense: 20, speed: 45 },
    moves: [{ name: "TACKLE", type: "NORMAL", pp: 35 }, { name: "STRING SHOT", type: "BUG", pp: 40 }],
    category: "WORM", height: "1’00”", weight: "6.4 lbs.",
    entry: "Its short feet are tipped with suction pads that let it climb any org chart. It is still an intern after three years.",
    happy: "CATERPIE is chewing a sticky note.", hm: { cut: false, strength: false },
  },
  Pikachu: {
    key: "pikachu", name: "PIKACHU", dex: 25, types: ["ELECTRIC"], level: 48, gender: "♂",
    base: { hp: 35, attack: 55, defense: 30, spAttack: 50, spDefense: 40, speed: 90 },
    moves: [{ name: "THUNDERBOLT", type: "ELECTRIC", pp: 15 }, { name: "QUICK ATTACK", type: "NORMAL", pp: 30 }, { name: "IRON TAIL", type: "STEEL", pp: 15 }, { name: "THUNDER WAVE", type: "ELECTRIC", pp: 20 }],
    category: "MOUSE", height: "1’04”", weight: "13.2 lbs.",
    entry: "It stores electricity in its cheeks and releases it when someone says “just a quick sync”. Offices with PIKACHU never lose power at month-end.",
    happy: "PIKACHU is cheek-sparking at the idea of a balanced budget.", hm: { cut: false, strength: true },
  },
  Bayleef: {
    key: "bayleef", name: "BAYLEEF", dex: 153, types: ["GRASS"], level: 38, gender: "♀",
    base: { hp: 60, attack: 62, defense: 80, spAttack: 63, spDefense: 80, speed: 60 },
    moves: [{ name: "RAZOR LEAF", type: "GRASS", pp: 25 }, { name: "BODY SLAM", type: "NORMAL", pp: 15 }, { name: "REFLECT", type: "PSYCHIC", pp: 20 }, { name: "SYNTHESIS", type: "GRASS", pp: 5 }],
    category: "LEAF", height: "3’11”", weight: "34.8 lbs.",
    entry: "The spicy aroma of the buds around its neck makes anyone who smells it want to reconcile the petty cash. Nobody knows why.",
    happy: "BAYLEEF is sniffing a ledger.", hm: { cut: true, strength: true },
  },
};

export const dexOrder: DexSpecies[] = ["Venusaur", "Charizard", "Blastoise", "Caterpie", "Pikachu", "Bayleef"];

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
