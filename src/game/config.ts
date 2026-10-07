import Phaser from "phaser";
import { BootScene } from "./scenes/BootScene";
import { PreloadScene } from "./scenes/PreloadScene";
import { TitleScene } from "./scenes/TitleScene";
import { IntroScene } from "./scenes/IntroScene";
import { NamingScene } from "./scenes/NamingScene";
import { PartyScene } from "./scenes/PartyScene";
import { DexScene } from "./scenes/DexScene";
import { BagScene } from "./scenes/BagScene";
import { CardScene } from "./scenes/CardScene";
import { OptionScene } from "./scenes/OptionScene";
import { OverworldScene } from "./scenes/OverworldScene";
import { BattleScene } from "./scenes/BattleScene";
import { GlitchScene } from "./scenes/GlitchScene";
import { CityScene } from "./scenes/CityScene";
import { CityHudScene } from "./scenes/CityHudScene";
import { FinaleScene } from "./scenes/FinaleScene";
import { FRLG } from "./style/frlg";

export function gameConfig(parent: HTMLElement): Phaser.Types.Core.GameConfig {
  return {
    type: Phaser.AUTO, parent,
    width: FRLG.width, height: FRLG.height,
    backgroundColor: FRLG.palette.backdrop,
    pixelArt: true, antialias: false, roundPixels: true,
    render: { preserveDrawingBuffer: process.env.NODE_ENV === "development" },
    // React snaps the parent box to a native-resolution integer multiple.
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    input: { keyboard: false },
    audio: { disableWebAudio: false },
    scene: [BootScene, PreloadScene, TitleScene, IntroScene, NamingScene, OverworldScene, PartyScene, DexScene, BagScene, CardScene, OptionScene, BattleScene, GlitchScene, CityScene, CityHudScene, FinaleScene],
  };
}

export function createGame(parent: HTMLElement) { return new Phaser.Game(gameConfig(parent)); }
