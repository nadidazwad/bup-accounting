import type { Scene } from "phaser";
import { chip } from "../audio/chip";
import { gameInput } from "../input/router";

/** Closes a full-screen menu launched over a paused scene (the start menu stays open behind it). */
export function closeOverlay(scene: Scene, from = "Overworld") {
  chip.sfx("select");
  gameInput.clear();
  scene.scene.resume(from);
  scene.scene.stop();
}

export const hpColors = (fraction: number) =>
  fraction > 0.5 ? [0x70f8a8, 0x58d080] : fraction > 0.2 ? [0xf8e038, 0xc8a808] : [0xf85838, 0xa84048];
