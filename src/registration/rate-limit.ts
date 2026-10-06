export class RateLimiter {
  private readonly attempts = new Map<string, { count: number; expiresAt: number }>();

  constructor(private readonly limit = 5, private readonly windowMs = 60000) {}

  allow(key: string, now = Date.now()) {
    for (const [ip, attempt] of this.attempts) {
      if (attempt.expiresAt <= now) this.attempts.delete(ip);
    }
    const previous = this.attempts.get(key);
    if (previous && previous.count >= this.limit) return false;
    // Bound memory use even when many distinct addresses are submitted.
    if (!previous && this.attempts.size >= 10000) return false;
    this.attempts.set(key, { count: (previous?.count ?? 0) + 1, expiresAt: previous?.expiresAt ?? now + this.windowMs });
    return true;
  }
}
