// WCAG 2.3.1: never more than three flashes in any one second. We stay well
// under it: a flash is refused if two already happened in the last second.
export class FlashLimiter {
  private readonly times: number[] = [];
  constructor(private readonly perSecond = 2) {}
  /** True if a flash may happen at `now` (ms); records it when allowed. */
  allow(now: number) {
    while (this.times.length && now - this.times[0] >= 1000) this.times.shift();
    if (this.times.length >= this.perSecond) return false;
    this.times.push(now);
    return true;
  }
}
