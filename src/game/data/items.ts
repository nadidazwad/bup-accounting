import type { ItemId } from "../state/store";

export type ItemInfo = { name: string; icon: string; description: string; use: string };

export const items: Record<ItemId, ItemInfo> = {
  POTION: { name: "POTION", icon: "item-potion", description: "A spray-type wound medicine. Restores 20 HP. The only liquid asset you own.", use: "It won’t have any effect. Everyone is fully healthy. Save it for THE AUDITOR." },
  POKE_BALL: { name: "POKé BALL", icon: "item-pokeball", description: "A BALL thrown to catch a wild POKéMON. Also great for storing paperclips.", use: "There’s no wild POKéMON here. Try the bushes." },
  RECEIPT: { name: "RECEIPT", icon: "item-receipt", description: "A crumpled receipt from 2019. Keep it. The taxman might ask.", use: "PROF. LEDGER’s words echoed… There’s a time and place for everything! But not now." },
  CALCULATOR: { name: "CALCULATOR", icon: "item-calculator", description: "A pocket calculator. It only does addition. Subtraction is a paid upgrade.", use: "You punched in 1 + 1. It says 11. Close enough." },
  OLD_INVOICE: { name: "OLD INVOICE", icon: "item-invoice", description: "An invoice marked NET 30. It was issued in 2009. Still unpaid.", use: "You read the due date again. Then you put it away. Some things are better left unaudited." },
};

export const bagOrder: ItemId[] = ["POTION", "POKE_BALL", "RECEIPT", "CALCULATOR", "OLD_INVOICE"];
