// Fixed-capacity object pool. Objects are created once and recycled, so the
// city never allocates peds, particles or decals in its update loop.
export class Pool<T> {
  readonly active: T[] = [];
  private readonly free: T[] = [];
  private created = 0;
  constructor(private readonly create: () => T, readonly capacity: number, private readonly reset?: (item: T) => void) {}

  /** An item from the pool, or null when every slot is in use. */
  acquire(): T | null {
    let item = this.free.pop();
    if (!item) {
      if (this.created >= this.capacity) return null;
      item = this.create(); this.created++;
    }
    this.active.push(item);
    return item;
  }

  release(item: T) {
    const i = this.active.indexOf(item);
    if (i < 0) return;
    // Swap-remove keeps release O(1) after the search and allocation-free.
    this.active[i] = this.active[this.active.length - 1];
    this.active.pop();
    this.reset?.(item);
    this.free.push(item);
  }

  get size() { return this.active.length; }
  get allocated() { return this.created; }
}
