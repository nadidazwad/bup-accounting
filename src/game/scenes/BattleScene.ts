import { Scene } from "phaser";
import { gameStore } from "../state/store";
import { TextBox } from "../ui/TextBox";
import { bindInput, markReady } from "./helpers";

/** M3 ends at the trainer challenge. M4 supplies the actual battle engine. */
export class BattleScene extends Scene {
  private textbox!: TextBox;
  constructor() { super("Battle"); }
  create() {
    gameStore.setScene("Battle");
    this.cameras.main.setBackgroundColor("#e0eee7");
    this.add.image(120, 106, "auditor-front").setOrigin(0.5, 1);
    this.textbox = new TextBox(this);
    bindInput(this, a => {
      if (["confirm", "cancel", "start", "menu"].includes(a)) this.textbox.advance();
    }, () => this.textbox.advance());
    markReady(this);
    void this.textbox.show("Your party is ready! THE AUDITOR’s battle is coming next. Return to town to explore or SAVE.", {
      onClose: () => {
        // Face the exit so the restored follower stands inside the clearing,
        // rather than occupying the only tile through the fence.
        const position = gameStore.getSnapshot().position;
        if (position) gameStore.setPosition({ ...position, facing: "down" });
        this.scene.start("Overworld");
      },
    });
  }
  update(time: number, delta: number) { this.textbox.update(time, delta); }
}
