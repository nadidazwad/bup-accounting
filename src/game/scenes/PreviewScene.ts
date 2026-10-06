import { Scene } from "phaser";
import { gameStore, getNativeSize, nextPreviewScene, type SceneKey } from "../state/store";
import { gameInput } from "../input/router";
import { FRLG } from "../style/frlg";
import { GTA2 } from "../style/gta2";

export class PreviewScene extends Scene {
  constructor(private readonly sceneKey: SceneKey, private readonly heading: string, private readonly description: string) {
    super(sceneKey);
  }

  create() {
    gameStore.setScene(this.sceneKey);
    const { width, height } = getNativeSize(this.sceneKey);
    this.scale.setGameSize(width, height);
    const city = width === GTA2.width;
    const palette = city ? GTA2.palette : FRLG.palette;
    this.cameras.main.setBackgroundColor(palette.backdrop);
    const ink = city ? GTA2.palette.gold : FRLG.palette.ink;
    const unit = city ? 2 : 1;
    const border = this.add.graphics();
    border.lineStyle(unit, city ? 0xe8c068 : 0x70c8a0);
    border.strokeRect(8 * unit, 8 * unit, width - 16 * unit, height - 16 * unit);
    this.add.text(width / 2, height * 0.24, "BUP ACCOUNTING", { fontFamily: "monospace", fontSize: `${9 * unit}px`, color: ink }).setOrigin(0.5);
    this.add.text(width / 2, height * 0.42, this.heading, {
      fontFamily: "monospace", fontSize: `${this.sceneKey === "Title" ? 17 : 13 * unit}px`,
      color: ink, align: "center", wordWrap: { width: width - 32 * unit },
    }).setOrigin(0.5);
    this.add.text(width / 2, height * 0.63, this.description, {
      fontFamily: "monospace", fontSize: `${8 * unit}px`, color: city ? "#f8f8f8" : ink,
      align: "center", wordWrap: { width: width - 36 * unit }, lineSpacing: 3 * unit,
    }).setOrigin(0.5);
    const hint = this.sceneKey === "Title" ? "PRESS START" : "SCENE PREVIEW";
    this.add.text(width / 2, height * 0.86, hint, { fontFamily: "monospace", fontSize: `${8 * unit}px`, color: ink }).setOrigin(0.5);
    gameStore.say(`${this.heading}. ${this.description}. ${hint}.`);

    const advance = () => {
      if (!["Title", "Intro"].includes(this.sceneKey) && process.env.NODE_ENV !== "development") return;
      const next = nextPreviewScene(this.sceneKey);
      if (next === "Registration") {
        gameStore.setScene(next);
        this.scene.stop();
      } else this.scene.start(next);
    };
    const unsubscribe = gameInput.subscribe((action) => { if (action === "confirm") advance(); });
    const pointer = () => { this.game.canvas.focus(); advance(); };
    this.input.on("pointerup", pointer);
    this.events.once("shutdown", () => {
      unsubscribe();
      this.input.off("pointerup", pointer);
      gameInput.clear();
    });
    this.game.canvas.dataset.ready = "true";
    gameStore.setGameReady(true);
  }
}
