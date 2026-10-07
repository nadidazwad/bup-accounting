import Phaser from "phaser";
import type { Scene, Types } from "phaser";
import { gameInput, type InputAction } from "../input/router";
import { gameStore } from "../state/store";

/** Routes router actions and taps to a scene while it is running (not paused or asleep). */
export function bindInput(scene: Scene, onAction: (action: InputAction, source: string) => void, onPointer?: (x: number, y: number) => void) {
  if (process.env.NODE_ENV === "development") scene.game.canvas.dataset.overlay = scene.sys.settings.key;
  const unsubscribe = gameInput.subscribe((action, source) => { if (scene.sys.isActive()) onAction(action, source); });
  const pointer = (p: { x: number; y: number }) => {
    scene.game.canvas.focus({ preventScroll: true });
    if (scene.sys.isActive()) onPointer?.(p.x, p.y);
  };
  scene.input.on("pointerup", pointer);
  scene.events.once("shutdown", () => {
    unsubscribe(); scene.input.off("pointerup", pointer);
    if (scene.game.canvas.dataset.overlay === scene.sys.settings.key) delete scene.game.canvas.dataset.overlay;
  });
}

export function markReady(scene: Scene) {
  scene.game.canvas.dataset.ready = "true";
  gameStore.setGameReady(true);
}

export const reducedMotion = () => gameStore.getSnapshot().settings.reducedMotion;

export const wait = (scene: Scene, ms: number) => new Promise<void>((resolve) => scene.time.delayedCall(ms, () => resolve()));

export const tween = (scene: Scene, config: Types.Tweens.TweenBuilderConfig) =>
  new Promise<void>((resolve) => { scene.tweens.add({ ...config, onComplete: () => resolve() }); });

export function fadeOut(scene: Scene, ms = 400, color = 0) {
  return new Promise<void>((resolve) => {
    const c = Phaser.Display.Color.IntegerToRGB(color);
    scene.cameras.main.fadeOut(ms, c.r, c.g, c.b);
    scene.cameras.main.once("camerafadeoutcomplete", () => resolve());
  });
}

export function fadeIn(scene: Scene, ms = 400, color = 0) {
  return new Promise<void>((resolve) => {
    const c = Phaser.Display.Color.IntegerToRGB(color);
    scene.cameras.main.fadeIn(ms, c.r, c.g, c.b);
    scene.cameras.main.once("camerafadeincomplete", () => resolve());
  });
}

/** White screen flashes. Reduced motion skips them (WCAG 2.3.1 is respected either way: ≤ 3 per second). */
export async function flash(scene: Scene, times = 2, color = 0xffffff) {
  if (reducedMotion()) return;
  const cover = scene.add.rectangle(0, 0, scene.scale.width, scene.scale.height, color).setOrigin(0).setScrollFactor(0).setDepth(20000).setAlpha(0);
  for (let i = 0; i < times; i++) {
    await tween(scene, { targets: cover, alpha: 1, duration: 90 });
    await tween(scene, { targets: cover, alpha: 0, duration: 90 });
    await wait(scene, 160);
  }
  cover.destroy();
}

export const playCry = (scene: Scene, key: string, rate = 1) => {
  const settings = gameStore.getSnapshot().settings;
  if (settings.muted || !scene.cache.audio.exists(`cry-${key}`)) return;
  scene.sound.play(`cry-${key}`, { rate, volume: settings.volume });
};

/** Captures the next rendered frame of the whole canvas into a texture. */
export function snapshotTexture(scene: Scene, key: string) {
  return new Promise<void>((resolve) => {
    scene.game.renderer.snapshot((snap) => {
      const image = snap as HTMLImageElement;
      const add = () => {
        if (scene.textures.exists(key)) scene.textures.remove(key);
        scene.textures.addImage(key, image);
        resolve();
      };
      if (image.complete && image.naturalWidth) add(); else image.onload = add;
    });
  });
}
