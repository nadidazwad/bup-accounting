/** A shuffled round visits every song once and avoids repeats between rounds. */
export class RadioPlaylist {
  private remaining: number[] = [];
  private last: number | null = null;
  private current: number | null = null;

  constructor(private readonly count: number, private readonly random = Math.random) {}

  /** Car changes and song endings always choose music, never RADIO OFF. */
  next() {
    if (!this.remaining.length) {
      this.remaining = Array.from({ length: this.count }, (_, i) => i);
      for (let i = this.remaining.length - 1; i > 0; i--) {
        const j = Math.floor(this.random() * (i + 1));
        [this.remaining[i], this.remaining[j]] = [this.remaining[j], this.remaining[i]];
      }
      if (this.remaining.length > 1 && this.remaining[0] === this.last) {
        const j = 1 + Math.floor(this.random() * (this.remaining.length - 1));
        [this.remaining[0], this.remaining[j]] = [this.remaining[j], this.remaining[0]];
      }
    }
    this.current = this.last = this.remaining.shift()!;
    return this.current;
  }

  /** R still offers RADIO OFF after the current round, then a fresh shuffle. */
  cycle() {
    if (this.current !== null && !this.remaining.length) return this.current = null;
    return this.next();
  }
}
