import type { ItemId } from "../state/store";

export type ItemInfo = { name: string; icon: string; description: string; use: string };

export const items: Record<ItemId, ItemInfo> = {
  POTION: { name: "POTION", icon: "item-potion", description: "A spray-type medicine. Restores 20 HP. The only liquid asset you own.", use: "Everyone is fully healthy. Save it for a battle." },
  POKE_BALL: { name: "POKé BALL", icon: "item-pokeball", description: "A BALL thrown to catch a wild POKéMON. Weaken it first for better odds.", use: "There’s no wild POKéMON here. Try the tall grass." },
};

export const bagOrder: ItemId[] = ["POTION", "POKE_BALL"];
