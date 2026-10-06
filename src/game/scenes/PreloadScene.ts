import { Scene } from "phaser";
import { assetManifest } from "../assets.manifest";
import { gameStore } from "../state/store";

export class PreloadScene extends Scene {
  constructor() { super("Preload"); }
  preload() {
    // A GBA-boot style loading bar while the cartridge's assets arrive.
    this.cameras.main.setBackgroundColor("#000000");
    const track = this.add.rectangle(120, 84, 82, 6, 0x303048).setStrokeStyle(1, 0x6878a8);
    const bar = this.add.rectangle(80, 84, 0, 4, 0xf8d030).setOrigin(0, 0.5);
    this.load.on("progress", (value: number) => bar.setSize(Math.round(80 * value), 4));
    void track;
    const a = assetManifest.frlg;
    for (const asset of [a.tiles, a.tree, ...a.images]) this.load.image(asset.key, asset.path);
    for (const asset of [a.player, a.flower, a.grassEffect, a.water, a.frame, a.window, a.emotes, a.ball, a.flames, a.partyBall, a.bag, a.types, a.redBack, ...a.npcs]) {
      this.load.spritesheet(asset.key, asset.path, asset);
    }
    for (const mon of a.mons) {
      this.load.image(mon.front.key, mon.front.path);
      this.load.image(mon.back.key, mon.back.path);
      this.load.spritesheet(mon.icon.key, mon.icon.path, mon.icon);
      this.load.spritesheet(mon.follow.key, mon.follow.path, mon.follow);
      this.load.audio(mon.cry.key, mon.cry.path);
    }
    this.load.tilemapTiledJSON(a.map.key, a.map.path);
    for (const font of a.fonts) this.load.bitmapFont(font.key, font.texture, font.data);
  }
  create() {
    // Sub-frames of irregular native sheets.
    this.textures.get("arrow-down").add("arrow", 0, 0, 3, 10, 6);
    const stars = this.textures.get("stars");
    stars.add("big", 0, 0, 0, 16, 16); stars.add("small", 0, 0, 16, 8, 8); stars.add("tiny", 0, 8, 16, 8, 8);
    this.scene.start(gameStore.getSnapshot().scene);
  }
}
