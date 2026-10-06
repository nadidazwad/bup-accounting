import { GameObjects, type Scene } from "phaser";

// FRLG standard window (frame "Type 1"): a 3×3 sheet of native 8×8 tiles.
// (x, y, width, height) is the outer box, frame included.
export class Window extends GameObjects.Container {
  readonly inner: { x: number; y: number; width: number; height: number };
  constructor(scene: Scene, x: number, y: number, width: number, height: number, fill = 0xf8f8f8) {
    super(scene, x, y);
    this.inner = { x: 8, y: 8, width: width - 16, height: height - 16 };
    this.add(scene.add.rectangle(4, 4, width - 8, height - 8, fill).setOrigin(0));
    const piece = (frame: number, px: number, py: number, w = 8, h = 8) => {
      const image = scene.add.image(px, py, "window", frame).setOrigin(0);
      if (w !== 8 || h !== 8) image.setDisplaySize(w, h);
      this.add(image);
    };
    // Edges stretch a single native tile; it is a flat colour band, so this is lossless.
    piece(0, 0, 0); piece(2, width - 8, 0); piece(6, 0, height - 8); piece(8, width - 8, height - 8);
    piece(1, 8, 0, width - 16, 8); piece(7, 8, height - 8, width - 16, 8);
    piece(3, 0, 8, 8, height - 16); piece(5, width - 8, 8, 8, height - 16);
    scene.add.existing(this);
  }
}
