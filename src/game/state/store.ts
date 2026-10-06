export const sceneOrder = ["Title", "Intro", "Overworld", "Battle", "Glitch", "City", "Briefing", "Registration"] as const;
export type SceneKey = typeof sceneOrder[number];
export type Species = "Charizard" | "Pikachu" | "Venusaur";
export type DexSpecies = Species | "Blastoise" | "Bayleef" | "Caterpie";
export type ItemId = "POTION" | "POKE_BALL" | "RECEIPT" | "CALCULATOR" | "OLD_INVOICE";
export type TextSpeed = "slow" | "mid" | "fast";
export type Facing = "up" | "down" | "left" | "right";
export type GameSettings = { muted: boolean; crt: boolean; reducedMotion: boolean; volume: number; textSpeed: TextSpeed };
export type FieldPosition = { x: number; y: number; facing: Facing };
export type GameFlags = {
  bushesCut: readonly string[];
  bossBeaten: boolean;
  fiveCopsSeen: boolean;
  guardMoved: boolean;
  fieldHintSeen: boolean;
};
export type GameState = {
  scene: SceneKey;
  gameReady: boolean;
  playerName: string;
  party: readonly Species[];
  bag: Readonly<Partial<Record<ItemId, number>>>;
  seen: readonly DexSpecies[];
  money: number;
  playMs: number;
  position: FieldPosition | null;
  savedAt: number | null;
  flags: GameFlags;
  kills: number;
  wanted: number;
  dialogue: string;
  registrationStartedAt: number;
  settings: GameSettings;
};

export const saveKey = "bup-accounting-save-v1";
export const textSpeedMs: Record<TextSpeed, number> = { slow: (8 / 60) * 1000, mid: (2 / 60) * 1000, fast: 1000 / 60 };

const initialState = (): GameState => ({
  scene: "Title", gameReady: false, playerName: "RED", party: ["Charizard"],
  bag: { POKE_BALL: 5 }, seen: ["Charizard"], money: 3000, playMs: 0, position: null, savedAt: null,
  flags: { bushesCut: [], bossBeaten: false, fiveCopsSeen: false, guardMoved: false, fieldHintSeen: false },
  kills: 0, wanted: 0, dialogue: "BUP ACCOUNTING presents. Press Start to begin.", registrationStartedAt: 0,
  settings: { muted: false, crt: false, reducedMotion: false, volume: 0.5, textSpeed: "mid" },
});

// Only progress is persisted. Scene, readiness and the registration timer are
// session state; settings have their own storage key.
export type SaveData = Pick<GameState, "playerName" | "party" | "bag" | "seen" | "money" | "playMs" | "position" | "flags" | "savedAt">;
const speciesNames: readonly Species[] = ["Charizard", "Pikachu", "Venusaur"];
const dexNames: readonly DexSpecies[] = [...speciesNames, "Blastoise", "Bayleef", "Caterpie"];
const itemNames: readonly ItemId[] = ["POTION", "POKE_BALL", "RECEIPT", "CALCULATOR", "OLD_INVOICE"];

export function parseSave(raw: unknown): SaveData | null {
  if (!raw || typeof raw !== "object") return null;
  const v = raw as Record<string, unknown>;
  const base = initialState();
  const party = Array.isArray(v.party) ? v.party.filter((s): s is Species => speciesNames.includes(s as Species)) : [];
  if (!party.length || new Set(party).size !== party.length) return null;
  const bag: Partial<Record<ItemId, number>> = {};
  if (v.bag && typeof v.bag === "object") {
    for (const [id, n] of Object.entries(v.bag as Record<string, unknown>)) {
      if (itemNames.includes(id as ItemId) && Number.isInteger(n) && (n as number) > 0 && (n as number) < 1000) bag[id as ItemId] = n as number;
    }
  }
  const f = (v.flags && typeof v.flags === "object" ? v.flags : {}) as Record<string, unknown>;
  const p = v.position as Record<string, unknown> | null;
  const position = p && Number.isInteger(p.x) && Number.isInteger(p.y) && ["up", "down", "left", "right"].includes(p.facing as string)
    ? { x: p.x as number, y: p.y as number, facing: p.facing as Facing } : null;
  return {
    playerName: typeof v.playerName === "string" ? normalizeName(v.playerName) : base.playerName,
    party, bag,
    seen: Array.isArray(v.seen) ? dexNames.filter(s => (v.seen as unknown[]).includes(s)) : [...party],
    money: Number.isInteger(v.money) && (v.money as number) >= 0 ? Math.min(v.money as number, 999999) : base.money,
    playMs: Number.isFinite(v.playMs) && (v.playMs as number) >= 0 ? v.playMs as number : 0,
    position,
    savedAt: Number.isFinite(v.savedAt) ? v.savedAt as number : null,
    flags: {
      bushesCut: Array.isArray(f.bushesCut) ? f.bushesCut.filter((id): id is string => typeof id === "string").slice(0, 32) : [],
      bossBeaten: f.bossBeaten === true, fiveCopsSeen: f.fiveCopsSeen === true,
      guardMoved: f.guardMoved === true, fieldHintSeen: f.fieldHintSeen === true,
    },
  };
}

export function normalizeName(name: string) {
  return name.trim().slice(0, 7).toUpperCase() || "RED";
}

export function createGameStore(storage: () => Storage | null = () => (typeof localStorage === "undefined" ? null : localStorage)) {
  let state = initialState();
  const serverSnapshot = state;
  const listeners = new Set<() => void>();
  const update = (patch: Partial<GameState>) => {
    state = { ...state, ...patch };
    listeners.forEach((listener) => listener());
  };
  return {
    getSnapshot: () => state,
    getServerSnapshot: () => serverSnapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    setScene(scene: SceneKey) {
      update({ scene, registrationStartedAt: scene === "Registration" ? Date.now() : state.registrationStartedAt });
    },
    setGameReady(gameReady: boolean) { update({ gameReady }); },
    say(dialogue: string) { if (dialogue !== state.dialogue) update({ dialogue }); },
    setPlayerName(playerName: string) { update({ playerName: normalizeName(playerName) }); },
    addToParty(species: Species) {
      if (!state.party.includes(species)) update({ party: [...state.party, species], seen: state.seen.includes(species) ? state.seen : [...state.seen, species] });
    },
    markSeen(species: DexSpecies) { if (!state.seen.includes(species)) update({ seen: [...state.seen, species] }); },
    swapParty(a: number, b: number) {
      const party = [...state.party];
      if (a === b || !party[a] || !party[b]) return;
      [party[a], party[b]] = [party[b], party[a]];
      update({ party });
    },
    addItem(id: ItemId, count = 1) { update({ bag: { ...state.bag, [id]: Math.min(999, (state.bag[id] ?? 0) + count) } }); },
    useItem(id: ItemId) {
      const count = state.bag[id] ?? 0;
      if (count <= 0) return false;
      const bag = { ...state.bag };
      if (count === 1) delete bag[id]; else bag[id] = count - 1;
      update({ bag });
      return true;
    },
    openSpot(id: string) {
      if (!state.flags.bushesCut.includes(id)) update({ flags: { ...state.flags, bushesCut: [...state.flags.bushesCut, id] } });
    },
    setFlag(flag: "guardMoved" | "fieldHintSeen" | "bossBeaten", value = true) { update({ flags: { ...state.flags, [flag]: value } }); },
    setPosition(position: FieldPosition) { state = { ...state, position }; },
    tick(ms: number) { if (ms > 0 && ms < 1000) state = { ...state, playMs: state.playMs + ms }; },
    setSettings(settings: Partial<GameSettings>) { update({ settings: { ...state.settings, ...settings } }); },
    hasSave() {
      try { return !!parseSave(JSON.parse(storage()?.getItem(saveKey) ?? "null")); } catch { return false; }
    },
    readSave(): SaveData | null {
      try { return parseSave(JSON.parse(storage()?.getItem(saveKey) ?? "null")); } catch { return null; }
    },
    save(now = Date.now()) {
      const data: SaveData = {
        playerName: state.playerName, party: state.party, bag: state.bag, seen: state.seen, money: state.money,
        playMs: state.playMs, position: state.position, flags: state.flags, savedAt: now,
      };
      try {
        const target = storage();
        if (!target) return false;
        target.setItem(saveKey, JSON.stringify(data));
      } catch { return false; }
      update({ savedAt: now });
      return true;
    },
    load() {
      const data = this.readSave();
      if (!data) return false;
      update({ ...data });
      return true;
    },
    reset() { const settings = state.settings; state = { ...initialState(), settings }; listeners.forEach((listener) => listener()); },
  };
}

export const gameStore = createGameStore();

export function nextPreviewScene(scene: SceneKey): SceneKey {
  return sceneOrder[Math.min(sceneOrder.indexOf(scene) + 1, sceneOrder.length - 1)];
}

export function getNativeSize(scene: SceneKey) {
  return ["City", "Briefing", "Registration"].includes(scene)
    ? { width: 640, height: 480 }
    : { width: 240, height: 160 };
}

export function formatPlayTime(ms: number) {
  const minutes = Math.floor(ms / 60000);
  return `${Math.min(999, Math.floor(minutes / 60))}:${String(minutes % 60).padStart(2, "0")}`;
}
