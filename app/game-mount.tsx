"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { useGameState } from "@/src/game/state/use-game-state";
import { gameStore, type GameSettings, type SceneKey, type Screen, type TextSpeed } from "@/src/game/state/store";
import { chip } from "@/src/game/audio/chip";
import { useGameFullscreen } from "./use-game-fullscreen";
import StageDecor from "./stage-decor";

const GameCanvas = dynamic(() => import("./game-canvas"), {
  ssr: false,
  loading: () => <div className="game-loading" role="status"><span className="loading-ball" aria-hidden="true" />Loading…</div>,
});
const settingsKey = "bup-game-settings-v1";
const dev = process.env.NODE_ENV === "development";

// Level 1 has Pokémon accents; the GTA levels switch the page to asphalt and neon.
// While the cartridge glitches, the page glitches with it.
const levelTheme = (scene: SceneKey, screen: Screen) => (screen === "gta" ? "gta" : scene === "Glitch" ? "glitch" : "pokemon");
const levelName = (scene: SceneKey, screen: Screen) => (levelTheme(scene, screen) === "pokemon" ? "Level 1" : "Level 2");

const controls: Record<"pokemon" | "gta", { keys: [string[], string][]; touch: string }> = {
  pokemon: {
    keys: [
      [["W", "A", "S", "D"], "Move"],
      [["Shift"], "Run (hold)"],
      [["E", "Space"], "Interact · confirm"],
      [["Q", "Esc"], "Back"],
      [["M", "Esc"], "Menu"],
    ],
    touch: "Walk, talk, advance text · tap yourself for the menu",
  },
  gta: {
    keys: [
      [["W", "A", "S", "D"], "Drive · walk"],
      [["E", "F"], "Get in · get out"],
      [["Space", "Shift"], "Handbrake · run on foot"],
      [["R"], "Change radio station"],
      [["H"], "Horn"],
      [["Esc", "M"], "Pause"],
    ],
    touch: "Tap a car to get in · hold where you want to drive · tap your car to get out",
  },
};

const Icon = {
  sound: (on: boolean) => <svg viewBox="0 0 16 16" aria-hidden="true" shapeRendering="crispEdges"><path d="M2 6h3l4-3v10l-4-3H2z" />{on ? <path d="M11 5h1v1h1v4h-1v1h-1v-1h1V6h-1zM13 3h1v1h1v8h-1v1h-1v-1h1V4h-1z" /> : <path d="M11 6h1v1h1V6h1v1h-1v1h1v1h-1V8h-1v1h-1V8h1V7h-1z" />}</svg>,
  expand: <svg viewBox="0 0 16 16" aria-hidden="true" shapeRendering="crispEdges"><path d="M2 2h5v2H4v3H2zM9 2h5v5h-2V4H9zM2 9h2v3h3v2H2zM12 9h2v5H9v-2h3z" /></svg>,
  keys: <svg viewBox="0 0 16 16" aria-hidden="true" shapeRendering="crispEdges"><path d="M1 4h14v9H1zM2 5v7h12V5z" /><path d="M3 6h2v2H3zM6 6h2v2H6zM9 6h2v2H9zM12 6h1v2h-1zM4 9h8v2H4z" /></svg>,
};

export default function GameMount() {
  const state = useGameState();
  const [cartridge, setCartridge] = useState(0);
  const [notchOpen, setNotchOpen] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  const pointerType = useRef("");
  const fullscreen = useGameFullscreen(stage);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const stored: Partial<GameSettings> = {};
    try {
      const values = JSON.parse(localStorage.getItem(settingsKey) || "{}") as Record<string, unknown>;
      if (typeof values.muted === "boolean") stored.muted = values.muted;
      if (typeof values.volume === "number" && values.volume >= 0 && values.volume <= 1) stored.volume = values.volume;
      if (["slow", "mid", "fast"].includes(values.textSpeed as string)) stored.textSpeed = values.textSpeed as TextSpeed;
    } catch { /* Storage can be unavailable in restricted contexts. */ }
    gameStore.setSettings({ ...stored, reducedMotion: media.matches });
    const motionChanged = () => gameStore.setSettings({ reducedMotion: media.matches });
    media.addEventListener("change", motionChanged);
    let lastSettings = "";
    const unsubscribe = gameStore.subscribe(() => {
      const { muted, volume, textSpeed } = gameStore.getSnapshot().settings;
      const settings = JSON.stringify({ muted, volume, textSpeed });
      if (settings === lastSettings) return;
      lastSettings = settings;
      try { localStorage.setItem(settingsKey, settings); } catch { /* Settings still work in memory. */ }
    });
    const debugScenes: Record<string, SceneKey> = { "1": "Overworld", battle: "Battle", glitch: "Glitch", "2": "City", finale: "Finale" };
    const level = new URLSearchParams(window.location.search).get("level") ?? "";
    if (dev && debugScenes[level]) gameStore.setScene(debugScenes[level]);
    const unlock = () => chip.unlock();
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return () => {
      unsubscribe();
      media.removeEventListener("change", motionChanged);
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);
  const theme = levelTheme(state.scene, state.screen);
  const sheet = controls[theme === "pokemon" ? "pokemon" : "gta"];
  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);

  const restart = () => { gameStore.reset(); setCartridge((value) => value + 1); };
  return (
    <main className="stage" ref={stage} data-fullscreen={fullscreen.mode} data-theme={theme} data-scene={state.scene}>
      <div className={`notch ${notchOpen ? "notch-open" : ""}`} onMouseEnter={() => setNotchOpen(true)} onMouseLeave={() => setNotchOpen(false)}
        onFocus={() => setNotchOpen(true)} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setNotchOpen(false); }}>
        <button type="button" className="notch-tab" aria-expanded={notchOpen} aria-controls="controls-sheet"
          onPointerDown={(event) => { pointerType.current = event.pointerType; }}
          // A mouse already opened the sheet by hovering; touch and keyboard toggle it.
          onClick={() => { if (pointerType.current === "mouse") setNotchOpen(true); else setNotchOpen((open) => !open); pointerType.current = ""; }}>
          {Icon.keys}<span>{levelName(state.scene, state.screen)}</span><span className="notch-hint">Controls</span>
        </button>
        <div className="notch-sheet" id="controls-sheet" role="region" aria-label="Controls" hidden={!notchOpen}>
          <ul className="control-list" id="game-controls-hint">
            {sheet.keys.map(([keys, action]) => (
              <li key={action}><span className="keys">{keys.map((k) => <kbd key={k}>{k}</kbd>)}</span><span>{action}</span></li>
            ))}
            <li className="touch-line"><span className="keys"><kbd>Tap</kbd></span><span>{sheet.touch}</span></li>
          </ul>
          <div className="notch-actions">
            <button type="button" className="chip-button" aria-pressed={!state.settings.muted} onClick={() => gameStore.setSettings({ muted: !state.settings.muted })}>
              {Icon.sound(!state.settings.muted)}<span>{state.settings.muted ? "Sound off" : "Sound on"}</span>
            </button>
            <button type="button" className="chip-button" onClick={() => void fullscreen.toggle()}>
              {Icon.expand}<span>{fullscreen.mode === "window" ? "Fullscreen" : "Exit fullscreen"}</span>
            </button>
            <button type="button" className="chip-button" onClick={restart}><span>Restart</span></button>
          </div>
          <p className="notch-note">Contains brief flashing, turned off when your device asks for reduced motion.</p>
          {dev && <p className="notch-note">Dev: <code>?level=1</code> town · <code>?level=battle</code> · <code>?level=glitch</code> · <code>?level=2</code> city · <code>?level=finale</code> · F1 collision · scene {state.scene}</p>}
          <p className="notch-note">Rafid was here</p>
        </div>
      </div>
      <StageDecor theme={theme} />
      <section className="screen" aria-label="Game">
        <GameCanvas key={cartridge} />
      </section>
      <span className="fullscreen-status" role="status">{fullscreen.message}</span>
      <p className="rotate-hint" aria-hidden="true">Turn your phone sideways for a bigger city</p>
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">{state.dialogue}</div>
    </main>
  );
}
