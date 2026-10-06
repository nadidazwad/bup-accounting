import { FRLG } from "../style/frlg";
import { destination, directionTo, findPath, sameTile, tileKey, vectors, type Direction, type Grid, type Tile } from "./navigation";

type Leg = { from: Tile; to: Tile };
type Step = { player: Leg | null; follower: Leg; duration: number; elapsed: number; run: boolean };
const pixels = (p: Tile) => ({ x: p.x * 16 + 8, y: p.y * 16 + 16 });
export class OverworldMovement {
  player: Tile;
  follower: Tile;
  facing: Direction = "down";
  followerFacing: Direction = "down";
  private steps: Step[] = [];
  completedSteps = 0;
  constructor(readonly grid: Grid, player: Tile, follower: Tile) {
    if (!walkableSpawn(grid, player, follower)) throw new Error("Invalid player/follower spawn");
    this.player = { ...player }; this.follower = { ...follower };
  }
  get busy() { return this.steps.length > 0; }
  /** Every tile the player or follower stands on or is moving into. */
  occupied(): Tile[] {
    const tiles = [this.player, this.follower];
    for (const step of this.steps) { tiles.push(step.follower.to); if (step.player) tiles.push(step.player.to); }
    return tiles;
  }
  /** Places both actors without animation (loading a save, cutscenes). */
  teleport(player: Tile, follower: Tile, facing: Direction) {
    this.steps = []; this.player = { ...player }; this.follower = { ...follower }; this.facing = facing; this.followerFacing = facing;
  }
  move(direction: Direction, run = false) {
    if (this.busy) return false;
    this.facing = direction;
    const to = destination(this.grid, this.player, direction);
    if (!to) return false;
    const ms = run ? FRLG.runTileMs : FRLG.walkTileMs;
    let followerStart = this.follower;
    // On a reversal, walk around the stationary player before both can advance.
    // Directed ledges apply to the follower too. No teleport or wall shortcut.
    if (sameTile(to, this.follower)) {
      let detour: Tile[] | null = null;
      for (const v of Object.values(vectors)) {
        const staging = { x: this.player.x + v.x, y: this.player.y + v.y };
        if (sameTile(staging, to) || !destination(this.grid, staging, directionTo(staging, this.player))) continue;
        const path = findPath(this.grid, this.follower, staging, [this.player, to]);
        if (path && (!detour || path.length < detour.length)) detour = path;
      }
      if (!detour) return false;
      for (const p of detour) {
        this.steps.push({ player: null, follower: { from: followerStart, to: p }, duration: ms, elapsed: 0, run });
        followerStart = p;
      }
    }
    const trail = findPath(this.grid, followerStart, this.player, [to]);
    if (!trail || trail.length !== 1) { this.steps = []; return false; }
    this.steps.push({ player: { from: this.player, to }, follower: { from: followerStart, to: this.player }, duration: Math.abs(to.y - this.player.y) === 2 ? ms * 2 : ms, elapsed: 0, run });
    return true;
  }
  update(delta: number) {
    let remaining = Math.max(0, delta);
    while (this.steps.length && remaining > 0) {
      const step = this.steps[0]; const used = Math.min(remaining, step.duration - step.elapsed);
      step.elapsed += used; remaining -= used;
      this.followerFacing = directionTo(step.follower.from, step.follower.to);
      if (step.elapsed + 0.0001 < step.duration) break;
      this.follower = { ...step.follower.to };
      if (step.player) { this.player = { ...step.player.to }; this.completedSteps++; }
      this.steps.shift();
    }
    if (!this.busy) this.followerFacing = this.facing;
  }
  visual() {
    const step = this.steps[0]; const progress = step ? step.elapsed / step.duration : 0;
    const position = (tile: Tile, leg: Leg | null) => {
      const p = pixels(tile); if (!leg) return { ...p, hop: 0 };
      const from = pixels(leg.from), to = pixels(leg.to);
      return { x: Math.round(from.x + (to.x - from.x) * progress), y: Math.round(from.y + (to.y - from.y) * progress), hop: Math.abs(leg.to.y - leg.from.y) === 2 ? Math.round(Math.sin(progress * Math.PI) * 10) : 0 };
    };
    return { player: position(this.player, step?.player ?? null), follower: position(this.follower, step?.follower ?? null), progress, playerMoving: !!step?.player, running: !!step?.player && step.run, moving: !!step };
  }
}
function walkableSpawn(grid: Grid, player: Tile, follower: Tile) {
  return !sameTile(player, follower) && [player, follower].every(p => p.x >= 0 && p.y >= 0 && p.x < grid.width && p.y < grid.height && !grid.blocked.has(tileKey(p)));
}
