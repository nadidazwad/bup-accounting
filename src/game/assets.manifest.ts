// Route A, private local preview. Provenance: docs/ASSETS.md.
// Reference originals stay outside public; only prepared runtime assets are loaded.
const frlg = (file: string) => `/assets/frlg/${file}`;
export const monKeys = ["charizard", "pikachu", "venusaur", "blastoise", "bayleef", "caterpie"] as const;
export type MonKey = typeof monKeys[number];

export const assetManifest = {
  frlg: {
    tiles: { key: "town-tiles", path: frlg("town-tiles.png") },
    map: { key: "town", path: "/assets/maps/town.tmj" },
    player: { key: "player", path: frlg("player.png"), frameWidth: 16, frameHeight: 32 },
    tree: { key: "tree", path: frlg("tree.png") },
    flower: { key: "flower", path: frlg("flower.png"), frameWidth: 16, frameHeight: 16 },
    grassEffect: { key: "grass-effect", path: frlg("grass-effect.png"), frameWidth: 16, frameHeight: 16 },
    water: { key: "water", path: frlg("water.png"), frameWidth: 112, frameHeight: 64 },
    frame: { key: "textbox", path: frlg("textbox.png"), frameWidth: 8, frameHeight: 8 },
    window: { key: "window", path: frlg("window.png"), frameWidth: 8, frameHeight: 8 },
    emotes: { key: "emotes", path: frlg("emotes.png"), frameWidth: 16, frameHeight: 16 },
    ball: { key: "ball", path: frlg("ball.png"), frameWidth: 16, frameHeight: 16 },
    flames: { key: "flames", path: frlg("flames.png"), frameWidth: 16, frameHeight: 16 },
    partyBall: { key: "party-ball", path: frlg("party-ball.png"), frameWidth: 32, frameHeight: 32 },
    bag: { key: "bag", path: frlg("bag.png"), frameWidth: 64, frameHeight: 64 },
    types: { key: "types", path: frlg("types.png"), frameWidth: 32, frameHeight: 12 },
    redBack: { key: "red-back", path: frlg("red-back.png"), frameWidth: 64, frameHeight: 64 },
    npcs: ["npc-lass", "npc-youngster", "npc-guard", "npc-auditor"].map((key) => ({ key, path: frlg(`${key}.png`), frameWidth: 16, frameHeight: 32 })),
    images: ["arrow-down", "stars", "healthbox-enemy", "battle-bg", "battle-box", "party-bg", "party-slots", "bag-bg", "naming-bg", "oak-bg", "oak-platform", "title-mon", "prof", "red-full", "auditor-front",
      "item-potion", "item-pokeball", "item-receipt", "item-calculator", "item-invoice"].map((key) => ({ key, path: frlg(`${key}.png`) })),
    mons: monKeys.map((key) => ({
      front: { key: `front-${key}`, path: frlg(`front-${key}.png`) },
      back: { key: `back-${key}`, path: frlg(`back-${key}.png`) },
      icon: { key: `icon-${key}`, path: frlg(`icon-${key}.png`), frameWidth: 32, frameHeight: 32 },
      follow: { key: `follow-${key}`, path: frlg(`follow-${key}.png`), frameWidth: 32, frameHeight: 32 },
      cry: { key: `cry-${key}`, path: `/assets/audio/cry-${key}.ogg` },
    })),
    fonts: [
      ...["", "-blue", "-red", "-white", "-gold", "-edge"].map((suffix) => ({ key: `frlg${suffix}`, texture: frlg(`text${suffix}.png`), data: frlg("text.xml") })),
      { key: "frlg-small", texture: frlg("text-small.png"), data: frlg("text-small.xml") },
      { key: "frlg-small-white", texture: frlg("text-small-white.png"), data: frlg("text-small.xml") },
    ],
  },
  gta2: [],
} as const;
