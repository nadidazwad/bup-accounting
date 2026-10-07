"use client";

import { useEffect, useRef } from "react";
import { createGame } from "@/src/game/config";
import { gameStore, screenSize } from "@/src/game/state/store";
import { gameInput } from "@/src/game/input/router";
import { pixelScale } from "@/src/game/input/scaling";
import { chip } from "@/src/game/audio/chip";

export default function GameCanvas() {
  const viewport = useRef<HTMLDivElement>(null);
  const bezel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = viewport.current, frame = bezel.current;
    if (!element || !frame) return;
    const display = document.createElement("div");
    display.className = "game-display";
    frame.prepend(display);
    const game = createGame(display);
    // Development only: lets one-off scripts drive scenes from the console.
    const devWindow = window as unknown as { __bupGame?: typeof game };
    if (process.env.NODE_ENV === "development") devWindow.__bupGame = game;
    let detachInput = () => {};
    let previousSound = "";
    const fit = () => {
      const state = gameStore.getSnapshot();
      const { width, height } = screenSize(state.screen);
      // CSS publishes how much breathing room the stage keeps around the screen.
      const style = getComputedStyle(element);
      const padX = parseFloat(style.getPropertyValue("--chrome-x")) || 0;
      const padY = parseFloat(style.getPropertyValue("--chrome-y")) || 0;
      const availableW = element.clientWidth - padX, availableH = element.clientHeight - padY;
      // GBA pixels stay device-pixel exact. The GTA screen renders at 2× and is
      // smoothly fitted instead, like a PC game in a resizable window.
      const scale = state.screen === "gta"
        ? Math.max(0.25, Math.min(availableW / width, availableH / height))
        : pixelScale(width, height, availableW, availableH, window.devicePixelRatio);
      display.style.width = `${width * scale}px`;
      display.style.height = `${height * scale}px`;
      display.dataset.scale = String(scale);
      display.dataset.deviceScale = String(Math.round(scale * window.devicePixelRatio));
      display.dataset.screen = state.screen;
      // The stickers around the screen fill whatever width is left beside it.
      const stage = element.closest<HTMLElement>(".stage");
      if (stage) {
        const gutter = Math.max(0, (stage.clientWidth - width * scale) / 2);
        stage.style.setProperty("--gutter", `${gutter}px`);
        stage.style.setProperty("--px", String(gutter >= 300 ? 3 : gutter >= 130 ? 2 : 1));
        stage.dataset.decor = gutter >= 70 ? "on" : "off";
      }
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
      game.canvas.setAttribute("aria-label", "Game. WASD or arrow keys move, E or Space interacts, Q goes back, M or Escape opens the menu.");
      game.canvas.setAttribute("aria-describedby", "game-controls-hint");
      detachInput = gameInput.attach(game.canvas, element.closest<HTMLElement>(".stage") ?? element);
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
      chip.resetMusic();
      // Release scene subscriptions before the replacement cartridge can accept input.
      for (const scene of game.scene.getScenes(true)) game.scene.stop(scene);
      // Phaser destroys systems on the next frame; detach this effect's child now.
      game.destroy(true);
      if (devWindow.__bupGame === game) delete devWindow.__bupGame;
      display.remove();
    };
  }, []);
  return (
    <div className="stage-viewport" ref={viewport}>
      <div className="screen-frame" ref={bezel} />
    </div>
  );
}
