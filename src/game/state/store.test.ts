import { expect, it } from "vitest";
import { createGameStore, getNativeSize, nextPreviewScene, sceneOrder } from "./store";
import { integerScale } from "../input/scaling";
import { InputRouter } from "../input/router";

it("starts with Charizard, deduplicates the party, and preserves settings on restart", () => {
  const store = createGameStore();
  expect(store.getSnapshot().party).toEqual(["Charizard"]);
  store.addToParty("Pikachu");
  store.addToParty("Pikachu");
  store.addToParty("Venusaur");
  expect(store.getSnapshot().party).toHaveLength(3);
  store.setSettings({ muted: true });
  store.setPlayerName(" ledger123 ");
  expect(store.getSnapshot().playerName).toBe("LEDGER1");
  store.reset();
  expect(store.getSnapshot().settings.muted).toBe(true);
  expect(store.getSnapshot().party).toEqual(["Charizard"]);
});

it("notifies subscribers, cleans up, and follows scene order without inventing progress", () => {
  const store = createGameStore();
  let updates = 0;
  const unsubscribe = store.subscribe(() => updates++);
  for (const scene of sceneOrder) store.setScene(scene);
  expect(updates).toBe(8);
  expect(store.getSnapshot().kills).toBe(0);
  expect(store.getSnapshot().flags.bossBeaten).toBe(false);
  unsubscribe();
  store.say("test");
  expect(updates).toBe(8);
  expect(nextPreviewScene("Title")).toBe("Intro");
  expect(nextPreviewScene("Registration")).toBe("Registration");
});

it("integer scaling never stretches pixels fractionally, including undersized screens", () => {
  expect(integerScale(240, 160, 719, 479)).toBe(2);
  expect(integerScale(240, 160, 720, 480)).toBe(3);
  expect(integerScale(240, 160, 200, 140)).toBe(1);
  expect(integerScale(640, 480, 1366, 768)).toBe(1);
  expect(getNativeSize("Overworld")).toEqual({ width: 240, height: 160 });
  expect(getNativeSize("City")).toEqual({ width: 640, height: 480 });
});

it("suppresses repeated input and clears held buttons on cleanup", () => {
  const input = new InputRouter();
  let presses = 0;
  const unsubscribe = input.subscribe(() => presses++);
  input.press("confirm"); input.press("confirm");
  expect(presses).toBe(1);
  input.release("confirm"); input.press("confirm");
  expect(presses).toBe(2);
  input.clear();
  expect(input.isHeld("confirm")).toBe(false);
  unsubscribe(); input.press("confirm");
  expect(presses).toBe(2);
});

it("keeps an action held until both keyboard and touch sources release", () => {
  const input = new InputRouter();
  input.press("cancel", "ShiftLeft"); input.press("cancel", "pointer:1");
  input.release("cancel", "ShiftLeft"); expect(input.isHeld("cancel")).toBe(true);
  input.release("cancel", "pointer:1"); expect(input.isHeld("cancel")).toBe(false);
  input.press("left", "ArrowLeft"); input.press("left", "KeyA");
  input.release("left", "ArrowLeft"); expect(input.isHeld("left")).toBe(true);
  input.clear(); expect(input.isHeld("left")).toBe(false);
});

it("persists party order, decoy rewards, pushed bushes and gate progress", () => {
  const values = new Map<string, string>();
  const storage = { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => { values.set(k, v); } } as unknown as Storage;
  const store = createGameStore(() => storage);
  store.addToParty("Pikachu"); store.addToParty("Venusaur"); store.swapParty(0, 2);
  store.addItem("POTION"); store.useItem("POKE_BALL"); store.useItem("POKE_BALL");
  store.openSpot("venusaur:7,5"); store.openSpot("venusaur:7,5"); store.openSpot("pikachu");
  store.setFlag("guardMoved"); store.setFlag("fieldHintSeen");
  store.setPosition({ x: 22, y: 6, facing: "up" }); store.tick(500);
  expect(store.save(123)).toBe(true);
  const restored = createGameStore(() => storage);
  expect(restored.load()).toBe(true);
  expect(restored.getSnapshot()).toMatchObject({
    scene: "Title", gameReady: false, party: ["Venusaur", "Pikachu", "Charizard"],
    bag: { POTION: 1, POKE_BALL: 3 }, position: { x: 22, y: 6, facing: "up" },
    playMs: 500, savedAt: 123, flags: { bushesCut: ["venusaur:7,5", "pikachu"], guardMoved: true },
  });
});

it("reports failed storage honestly and rejects corrupt saves", () => {
  const missing = createGameStore(() => null);
  expect(missing.save()).toBe(false);
  expect(missing.getSnapshot().savedAt).toBeNull();
  const denied = createGameStore(() => { throw new Error("Storage denied"); });
  expect(denied.save()).toBe(false); expect(denied.load()).toBe(false);
  const corrupt = createGameStore(() => ({ getItem: () => '{broken' }) as unknown as Storage);
  expect(corrupt.hasSave()).toBe(false); expect(corrupt.load()).toBe(false);
});

it("does not duplicate rewards through repeated party updates or consume missing items", () => {
  const store = createGameStore(() => null);
  store.addToParty("Pikachu"); store.addToParty("Pikachu");
  expect(store.getSnapshot().seen).toEqual(["Charizard", "Pikachu"]);
  expect(store.useItem("POTION")).toBe(false);
  store.addItem("POTION"); expect(store.useItem("POTION")).toBe(true);
  expect(store.getSnapshot().bag.POTION).toBeUndefined();
  store.swapParty(-1, 0); expect(store.getSnapshot().party).toEqual(["Charizard", "Pikachu"]);
});
