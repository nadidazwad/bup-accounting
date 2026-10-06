import { Scene } from "phaser";

export class BootScene extends Scene {
  constructor() { super("Boot"); }
  create() {
    this.cameras.main.setBackgroundColor("#e0eee7");
    this.add.rectangle(120, 80, 80, 3, 0x70c8a0);
    document.fonts.ready.then(() => {
      if (this.sys.isActive()) this.scene.start("Preload");
    });
  }
}
