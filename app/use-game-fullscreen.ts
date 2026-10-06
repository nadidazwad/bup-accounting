"use client";
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { gameInput } from "@/src/game/input/router";

export function useGameFullscreen(container: RefObject<HTMLElement | null>) {
  const [mode, setMode] = useState<"window" | "native" | "viewport">("window");
  const [message, setMessage] = useState("");
  const priorFocus = useRef<HTMLElement | null>(null);
  const entering = useRef(false);
  const restoreFocus = useCallback(() => {
    gameInput.clear();
    requestAnimationFrame(() => { if (priorFocus.current?.isConnected) priorFocus.current.focus(); });
  }, []);
  useEffect(() => {
    const changed = () => {
      const active = document.fullscreenElement === container.current && !!container.current;
      setMode(active ? "native" : "window");
      if (active) { setMessage(""); gameInput.clear(); container.current?.querySelector("canvas")?.focus(); }
      else { entering.current = false; restoreFocus(); }
    };
    const failed = () => { entering.current = false; setMessage("Native fullscreen was unavailable. You can use full viewport instead."); };
    document.addEventListener("fullscreenchange", changed);
    document.addEventListener("fullscreenerror", failed);
    return () => { document.removeEventListener("fullscreenchange", changed); document.removeEventListener("fullscreenerror", failed); };
  }, [container, restoreFocus]);
  useEffect(() => {
    if (mode === "window") return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (mode === "viewport") { event.preventDefault(); setMode("window"); restoreFocus(); }
        else if (document.fullscreenElement) void document.exitFullscreen().catch(() => setMessage("Press Exit fullscreen to close fullscreen."));
      }
    };
    const blur = () => gameInput.clear();
    document.addEventListener("keydown", escape);
    window.addEventListener("blur", blur);
    return () => { document.body.style.overflow = previous; document.removeEventListener("keydown", escape); window.removeEventListener("blur", blur); };
  }, [mode, restoreFocus]);
  const leave = useCallback(async () => {
    gameInput.clear();
    if (document.fullscreenElement === container.current && document.fullscreenElement) {
      try { await document.exitFullscreen(); } catch { setMessage("Fullscreen could not close. Press Escape to exit."); return; }
    }
    setMode("window"); restoreFocus();
  }, [container, restoreFocus]);
  const expandViewport = () => {
    setMode("viewport"); setMessage("Full viewport mode. Browser bars may remain visible.");
    requestAnimationFrame(() => container.current?.querySelector("canvas")?.focus());
  };
  const toggle = async () => {
    if (mode !== "window") { await leave(); return; }
    if (entering.current || !container.current) return;
    priorFocus.current = document.activeElement as HTMLElement | null;
    gameInput.clear();
    if (!document.fullscreenEnabled || !container.current.requestFullscreen || message.includes("unavailable")) { expandViewport(); return; }
    entering.current = true;
    try { await container.current.requestFullscreen(); }
    catch { entering.current = false; expandViewport(); }
  };
  return { mode, message, toggle, leave };
}
