export class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  private readonly capacity: number;
  private readonly refillRatePerMs: number;

  constructor(capacity: number, refillRatePerHour: number) {
    this.capacity = capacity;
    this.tokens = capacity;
    this.lastRefill = Date.now();
    this.refillRatePerMs = refillRatePerHour / 3600000;
  }

  tryAcquire(): boolean {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillRatePerMs);
    this.lastRefill = now;

    if (this.tokens >= 1) {
      this.tokens--;
      return true;
    }
    return false;
  }
}
