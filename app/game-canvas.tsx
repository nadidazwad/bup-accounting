"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createGame } from "@/src/game/config";
import { gameStore, getNativeSize } from "@/src/game/state/store";
import { gameInput } from "@/src/game/input/router";
import { pixelScale } from "@/src/game/input/scaling";
import { chip } from "@/src/game/audio/chip";

export default function GameCanvas({ left, right }: { left?: ReactNode; right?: ReactNode }) {
  const viewport = useRef<HTMLDivElement>(null);
  const bezel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = viewport.current, frame = bezel.current;
    if (!element || !frame) return;
    const display = document.createElement("div");
    display.className = "game-display";
    frame.prepend(display);
    const game = createGame(display);
    let detachInput = () => {};
    let previousSound = "";
    const fit = () => {
      const state = gameStore.getSnapshot();
      const { width, height } = getNativeSize(state.scene);
      // The console body hugs the display. CSS publishes how much room its
      // wings, padding and bezel take in the current layout.
      const style = getComputedStyle(element);
      const padX = parseFloat(style.getPropertyValue("--chrome-x")) || 0;
      const padY = parseFloat(style.getPropertyValue("--chrome-y")) || 0;
      const scale = pixelScale(width, height, element.clientWidth - padX, element.clientHeight - padY, window.devicePixelRatio);
      display.style.width = `${width * scale}px`;
      display.style.height = `${height * scale}px`;
      display.dataset.scale = String(scale);
      display.dataset.deviceScale = String(Math.round(scale * window.devicePixelRatio));
      // Let CSS choose the alignment unless the console is taller than the stage.
      element.style.alignItems = height * scale + padY > element.clientHeight ? "flex-start" : "";
      const sound = `${state.settings.muted}:${state.settings.volume}`;
      if (sound !== previousSound) {
        previousSound = sound;
        chip.configure(state.settings.muted, state.settings.volume);
        if (game.isBooted && game.sound) { game.sound.mute = state.settings.muted; game.sound.volume = state.settings.volume; }
      }
      if (game.isBooted) game.scale.refresh();
    };
    const ready = () => {
      game.canvas.tabIndex = 0;
      game.canvas.setAttribute("aria-label", "BUP ACCOUNTING game. Arrow keys or WASD move, Z confirms, X cancels, Enter opens the menu.");
      game.canvas.setAttribute("aria-describedby", "game-controls-hint");
      detachInput = gameInput.attach(game.canvas, element.closest<HTMLElement>(".game-console") ?? element);
      previousSound = "";
      fit();
    };
    game.events.once("ready", ready);
    const observer = new ResizeObserver(fit);
    observer.observe(element);
    const unsubscribe = gameStore.subscribe(fit);
    const media = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    window.addEventListener("resize", fit);
    window.addEventListener("orientationchange", fit);
    document.addEventListener("fullscreenchange", fit);
    window.visualViewport?.addEventListener("resize", fit);
    media.addEventListener("change", fit);
    fit();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", fit);
      window.removeEventListener("orientationchange", fit);
      document.removeEventListener("fullscreenchange", fit);
      window.visualViewport?.removeEventListener("resize", fit);
      media.removeEventListener("change", fit);
      unsubscribe();
      detachInput();
      game.events.off("ready", ready);
      chip.stopMusic();
      // Release scene subscriptions before the replacement cartridge can accept input.
      for (const scene of game.scene.getScenes(true)) game.scene.stop(scene);
      // Phaser destroys systems on the next frame; detach this effect's child now.
      game.destroy(true);
      display.remove();
    };
  }, []);
  return (
    <div className="stage-viewport" ref={viewport}>
      <div className="gba">
        <span className="shoulder shoulder-l" aria-hidden="true">L</span>
        <span className="shoulder shoulder-r" aria-hidden="true">R</span>
        {left}
        <div className="screen-bezel" ref={bezel}>
          <span className="bezel-led" aria-hidden="true"><i />POWER</span>
          <span className="bezel-label" aria-hidden="true">GAME BUP <b>ADVANCE</b></span>
        </div>
        {right}
      </div>
    </div>
  );
}
