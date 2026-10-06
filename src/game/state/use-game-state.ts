"use client";

import { useSyncExternalStore } from "react";
import { gameStore } from "./store";

export function useGameState() {
  return useSyncExternalStore(gameStore.subscribe, gameStore.getSnapshot, gameStore.getServerSnapshot);
}
