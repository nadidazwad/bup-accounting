import type { GameObjects, Scene } from "phaser";
import { FRLG } from "../style/frlg";
import { directionTo, tileKey, vectors, walkable, type Direction, type Grid, type Tile } from "./navigation";

// Native object-event frame table: down, up, left idles, then two walk frames each.
const frames: Record<Direction, number[]> = { down: [0, 3, 4], up: [1, 5, 6], left: [2, 7, 8], right: [2, 7, 8] };

/** A map NPC that occupies one tile in the collision grid and can walk or wander. */
export class Npc {
  readonly sprite: GameObjects.Sprite;
  tile: Tile;
  facing: Direction;
  private from: Tile | null = null;
  private elapsed = 0;
  private steps = 0;
  private nextWander = 0;
  private resolveStep?: () => void;
  readonly home: Tile;
  constructor(scene: Scene, readonly name: string, texture: string, tile: Tile, facing: Direction, private readonly grid: Grid,
    readonly wander = 0, readonly message = "") {
    this.tile = { ...tile }; this.home = { ...tile }; this.facing = facing;
    this.sprite = scene.add.sprite(0, 0, texture, 0).setOrigin(0.5, 1);
    grid.blocked.add(tileKey(tile));
    this.nextWander = 1500 + Math.random() * 2500;
    this.draw();
  }
  get moving() { return this.from !== null; }
  face(direction: Direction) { this.facing = direction; this.draw(); }
  faceTile(tile: Tile) { if (tile.x !== this.tile.x || tile.y !== this.tile.y) this.face(directionTo(this.tile, tile)); }
  /** Starts a one-tile walk. Resolves when it lands. */
  step(direction: Direction, avoid: readonly Tile[] = []) {
    this.facing = direction;
    const to = { x: this.tile.x + vectors[direction].x, y: this.tile.y + vectors[direction].y };
    if (this.moving || !walkable(this.grid, to) || this.grid.ledges.has(tileKey(to)) || avoid.some((p) => p.x === to.x && p.y === to.y)) {
      this.draw(); return Promise.resolve(false);
    }
    // Reserve the destination immediately so nobody else can step into it.
    this.grid.blocked.add(tileKey(to));
    this.from = this.tile; this.tile = to; this.elapsed = 0;
    return new Promise<boolean>((resolve) => { this.resolveStep = () => resolve(true); });
  }
  update(delta: number, idle: boolean, avoid: () => Tile[]) {
    if (this.from) {
      this.elapsed += delta;
      if (this.elapsed >= FRLG.walkTileMs) {
        this.grid.blocked.delete(tileKey(this.from));
        this.from = null; this.steps++;
        const resolve = this.resolveStep; this.resolveStep = undefined; resolve?.();
      }
    } else if (this.wander && idle) {
      this.nextWander -= delta;
      if (this.nextWander <= 0) {
        this.nextWander = 1800 + Math.random() * 3000;
        const options = (Object.keys(vectors) as Direction[]).filter((d) => {
          const to = { x: this.tile.x + vectors[d].x, y: this.tile.y + vectors[d].y };
          return Math.abs(to.x - this.home.x) <= this.wander && Math.abs(to.y - this.home.y) <= this.wander;
        });
        const d = options[Math.floor(Math.random() * options.length)];
        // Half the time an FRLG wanderer just looks around.
        if (d && Math.random() < 0.55) void this.step(d, avoid()); else if (d) this.face(d);
      }
    }
    this.draw();
  }
  remove() { this.grid.blocked.delete(tileKey(this.tile)); if (this.from) this.grid.blocked.delete(tileKey(this.from)); this.sprite.destroy(); }
  private draw() {
    let x = this.tile.x * 16 + 8, y = this.tile.y * 16 + 16, frame = frames[this.facing][0];
    if (this.from) {
      const t = Math.min(1, this.elapsed / FRLG.walkTileMs);
      x = Math.round(this.from.x * 16 + 8 + (this.tile.x - this.from.x) * 16 * t);
      y = Math.round(this.from.y * 16 + 16 + (this.tile.y - this.from.y) * 16 * t);
      if (t < 0.5) frame = frames[this.facing][1 + (this.steps % 2)];
    }
    this.sprite.setPosition(x, y).setDepth(y).setFrame(frame).setFlipX(this.facing === "right");
  }
}
