"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useGameState } from "@/src/game/state/use-game-state";
import { gameStore, type GameSettings, type SceneKey, type TextSpeed } from "@/src/game/state/store";
import { gameInput, type InputAction } from "@/src/game/input/router";
import { chip } from "@/src/game/audio/chip";
import { useGameFullscreen } from "./use-game-fullscreen";
import RegistrationForm from "./register/registration-form";

const GameCanvas = dynamic(() => import("./game-canvas"), {
  ssr: false,
  loading: () => <div className="game-loading" role="status"><span className="loading-ball" aria-hidden="true" />Loading the cartridge…</div>,
});
const settingsKey = "bup-accounting-settings-v1";
const dev = process.env.NODE_ENV === "development";
const buzz = () => { try { navigator.vibrate?.(8); } catch { /* Vibration is optional. */ } };

function PadButton({ action, label, className, children, disabled }: { action: InputAction; label: string; className: string; children?: ReactNode; disabled?: boolean }) {
  return <button type="button" className={className} aria-label={label} disabled={disabled}
    onPointerDown={(event) => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); chip.unlock(); buzz(); gameInput.press(action, `pointer:${event.pointerId}`); }}
    onPointerUp={(event) => gameInput.release(action, `pointer:${event.pointerId}`)} onPointerCancel={(event) => gameInput.release(action, `pointer:${event.pointerId}`)}
    onLostPointerCapture={(event) => gameInput.release(action, `pointer:${event.pointerId}`)}
    onContextMenu={(event) => event.preventDefault()}
    onClick={(event) => { if (event.detail === 0) { gameInput.press(action); gameInput.release(action); } }}>
    {children}
  </button>;
}

// One cross with four hit zones. A thumb can slide between directions without
// lifting, like a real D-pad; each arm stays a separate accessible button.
function DPad({ disabled }: { disabled: boolean }) {
  const pad = useRef<HTMLDivElement>(null);
  const held = useRef(new Map<number, InputAction>());
  const direction = (event: React.PointerEvent): InputAction | null => {
    const rect = pad.current!.getBoundingClientRect();
    const dx = event.clientX - (rect.left + rect.width / 2), dy = event.clientY - (rect.top + rect.height / 2);
    if (Math.hypot(dx, dy) < rect.width * 0.1) return held.current.get(event.pointerId) ?? null;
    return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up");
  };
  const set = (id: number, next: InputAction | null) => {
    const previous = held.current.get(id);
    if (previous === next) return;
    if (previous) gameInput.release(previous, `dpad:${id}`);
    if (next) { held.current.set(id, next); buzz(); gameInput.press(next, `dpad:${id}`); } else held.current.delete(id);
    pad.current?.setAttribute("data-held", next ?? "");
  };
  const end = (event: React.PointerEvent) => set(event.pointerId, null);
  const arm = (action: "up" | "down" | "left" | "right", label: string) => (
    <button type="button" className={`dpad-arm dpad-${action}`} aria-label={label} disabled={disabled} tabIndex={-1}
      onClick={(event) => { if (event.detail === 0) { gameInput.press(action); gameInput.release(action); } }} />
  );
  return (
    <div className="dpad" ref={pad} role="group" aria-label="Movement controls" data-held=""
      onPointerDown={(event) => { if (disabled) return; event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); chip.unlock(); set(event.pointerId, direction(event)); }}
      onPointerMove={(event) => { if (held.current.has(event.pointerId)) set(event.pointerId, direction(event)); }}
      onPointerUp={end} onPointerCancel={end} onLostPointerCapture={end} onContextMenu={(event) => event.preventDefault()}>
      {arm("up", "Move up")}{arm("left", "Move left")}<span className="dpad-hub" aria-hidden="true" />{arm("right", "Move right")}{arm("down", "Move down")}
    </div>
  );
}

const Icon = {
  sound: (on: boolean) => <svg viewBox="0 0 16 16" aria-hidden="true" shapeRendering="crispEdges"><path d="M2 6h3l4-3v10l-4-3H2z" />{on ? <path d="M11 5h1v1h1v4h-1v1h-1v-1h1V6h-1zM13 3h1v1h1v8h-1v1h-1v-1h1V4h-1z" /> : <path d="M11 6h1v1h1V6h1v1h-1v1h1v1h-1V8h-1v1h-1V8h1V7h-1z" />}</svg>,
  expand: <svg viewBox="0 0 16 16" aria-hidden="true" shapeRendering="crispEdges"><path d="M2 2h5v2H4v3H2zM9 2h5v5h-2V4H9zM2 9h2v3h3v2H2zM12 9h2v5H9v-2h3z" /></svg>,
  crt: <svg viewBox="0 0 16 16" aria-hidden="true" shapeRendering="crispEdges"><path d="M1 3h14v10H1zM3 5v6h10V5z" /><path d="M4 6h8v1H4zM4 8h8v1H4z" opacity=".55" /></svg>,
};

export default function GameMount() {
  const state = useGameState();
  const [cartridge, setCartridge] = useState(0);
  const stage = useRef<HTMLElement>(null);
  const consoleRef = useRef<HTMLDivElement>(null);
  const fullscreen = useGameFullscreen(consoleRef);
  const skip = async () => {
    await fullscreen.leave();
    history.replaceState(null, "", "#registration");
    gameStore.setScene("Registration");
    requestAnimationFrame(() => document.getElementById("registration-title")?.focus());
  };
  const registrationVisible = state.scene === "Registration";
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    let stored: Partial<GameSettings> = {};
    try {
      const parsed: unknown = JSON.parse(localStorage.getItem(settingsKey) || "{}");
      if (parsed && typeof parsed === "object") {
        const values = parsed as Record<string, unknown>;
        if (typeof values.muted === "boolean") stored.muted = values.muted;
        if (typeof values.crt === "boolean") stored.crt = values.crt;
        if (typeof values.volume === "number" && values.volume >= 0 && values.volume <= 1) stored.volume = values.volume;
        if (["slow", "mid", "fast"].includes(values.textSpeed as string)) stored.textSpeed = values.textSpeed as TextSpeed;
      }
    } catch { /* Storage can be unavailable in restricted contexts. */ }
    if (window.matchMedia("(pointer: coarse)").matches) stored = { ...stored, crt: false };
    gameStore.setSettings({ ...stored, reducedMotion: media.matches });
    const motionChanged = () => gameStore.setSettings({ reducedMotion: media.matches });
    media.addEventListener("change", motionChanged);
    let lastSettings = "";
    const unsubscribe = gameStore.subscribe(() => {
      const settings = JSON.stringify(gameStore.getSnapshot().settings);
      if (settings === lastSettings) return;
      lastSettings = settings;
      try { localStorage.setItem(settingsKey, settings); } catch { /* Settings still work in memory. */ }
    });
    const params = new URLSearchParams(window.location.search);
    const debugScenes: Record<string, SceneKey> = { "1": "Overworld", battle: "Battle", "2": "City", "3": "Registration" };
    if (window.location.hash === "#registration") gameStore.setScene("Registration");
    else if (dev && debugScenes[params.get("level") ?? ""]) gameStore.setScene(debugScenes[params.get("level")!]);
    const hashChanged = () => { if (window.location.hash === "#registration") gameStore.setScene("Registration"); };
    window.addEventListener("hashchange", hashChanged);
    const unlock = () => chip.unlock();
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return () => {
      unsubscribe();
      media.removeEventListener("change", motionChanged);
      window.removeEventListener("hashchange", hashChanged);
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  const playAgain = () => {
    history.replaceState(null, "", window.location.pathname);
    gameStore.reset();
    setCartridge(value => value + 1);
    requestAnimationFrame(() => stage.current?.focus());
  };
  const expanded = fullscreen.mode !== "window";
  const soundButton = (
    <button type="button" className="icon-button" aria-pressed={!state.settings.muted} aria-label={state.settings.muted ? "Sound off" : "Sound on"}
      onClick={() => gameStore.setSettings({ muted: !state.settings.muted })}>{Icon.sound(!state.settings.muted)}<span>{state.settings.muted ? "Sound off" : "Sound on"}</span></button>
  );
  const skipLink = (
    <a className="skip-link" href="#registration" onClick={(event) => { event.preventDefault(); void skip(); }}>Skip to registration <span aria-hidden="true">→</span></a>
  );
  return (
    <div className={`game-shell ${expanded ? "shell-expanded" : ""}`}>
      <header className="page-header" inert={expanded}>
        <Link className="brand" href="/" onClick={(event) => { event.preventDefault(); playAgain(); }}>
          <span className="brand-ball" aria-hidden="true" />
          <span className="brand-name">BUP<span className="brand-rest"> ACCOUNTING</span></span>
          <span className="brand-tag">BUPAF ’26</span>
        </Link>
        <nav className="header-actions" aria-label="Game options">
          {soundButton}
          {skipLink}
        </nav>
      </header>
      <main className={registrationVisible ? "page-main form-main" : "page-main"}>
        {registrationVisible ? <RegistrationForm playerName={state.playerName} victims={state.kills} startedAt={state.registrationStartedAt} onPlayAgain={playAgain} /> : (
          <div ref={consoleRef} className={`game-console ${expanded ? "console-expanded" : ""}`} data-fullscreen={fullscreen.mode} data-ready={state.gameReady}>
            {expanded && <div className="console-toolbar">
              <button type="button" className="icon-button" onClick={() => void fullscreen.toggle()}>{Icon.expand}<span>{fullscreen.mode === "native" ? "Exit fullscreen" : "Exit full viewport"}</span></button>
              {soundButton}
              {skipLink}
              <span className="fullscreen-status" role="status">{fullscreen.message}</span>
            </div>}
            <section className={`game-stage ${state.settings.crt ? "crt-enabled" : ""}`} ref={stage} tabIndex={-1} aria-label="Game console" data-scene={state.scene}>
              <GameCanvas key={cartridge} left={
                <div className="gba-wing gba-left">
                  <DPad disabled={!state.gameReady} />
                  <div className="pill-buttons">
                    <div className="pill"><PadButton className="pill-button" action="select" label="Select: show controls" disabled={!state.gameReady} /><span aria-hidden="true">SELECT</span></div>
                    <div className="pill"><PadButton className="pill-button" action="menu" label="Start: open the menu" disabled={!state.gameReady} /><span aria-hidden="true">START</span></div>
                  </div>
                </div>
              } right={
                <div className="gba-wing gba-right">
                  <div className="face-buttons">
                    <div className="face face-b"><PadButton className="face-button" action="cancel" label="B: cancel, or hold to run" disabled={!state.gameReady}>B</PadButton></div>
                    <div className="face face-a"><PadButton className="face-button" action="confirm" label="A: confirm or talk" disabled={!state.gameReady}>A</PadButton></div>
                  </div>
                  <div className="speaker" aria-hidden="true" />
                </div>
              } />
            </section>
            <div className="console-dock">
              <button type="button" className="dock-button" onClick={() => void fullscreen.toggle()}>{Icon.expand}<span>{fullscreen.mode === "native" ? "Exit fullscreen" : fullscreen.mode === "viewport" ? "Exit full viewport" : "Fullscreen"}</span></button>
              <button type="button" className="dock-button" aria-pressed={state.settings.crt} onClick={() => gameStore.setSettings({ crt: !state.settings.crt })}>{Icon.crt}<span>CRT {state.settings.crt ? "on" : "off"}</span></button>
              <span className="fullscreen-status" role="status">{fullscreen.message}</span>
            </div>
            <p className="controls-hint" id="game-controls-hint">
              <kbd className="kbd-arrows">←↑↓→</kbd> move <kbd>Z</kbd> A <kbd>X</kbd> B, hold to run <kbd>Enter</kbd> start menu <kbd>Esc</kbd> back <kbd>C</kbd> select
            </p>
            <p className="portrait-hint">Turn your phone sideways for a bigger screen.</p>
            <p className="photosensitivity-note">Later levels include flashing effects. Your device’s reduced-motion setting turns them off.</p>
            {dev && <p className="development-note">Dev · scene {state.scene} · <code>?level=1</code> skips to the town · F1 shows collision</p>}
          </div>
        )}
      </main>
      <footer className="page-footer" inert={expanded}><span>©2026 BUP ACCOUNTING / GAME FREAK-ISH</span><span>Keep your receipts.</span></footer>
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">{state.dialogue}</div>
    </div>
  );
}
