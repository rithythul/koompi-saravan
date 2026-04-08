export interface CircuitBreakerOptions {
  failureThreshold: number;
  cooldownMs: number;
}

export class CircuitBreaker {
  private failures = 0;
  private lastFailureTime: number | null = null;
  private state: 'CLOSED' | 'OPEN' = 'CLOSED';

  constructor(private options: CircuitBreakerOptions) {}

  canCall(): boolean {
    if (this.state === 'OPEN') {
      if (Date.now() - (this.lastFailureTime ?? 0) > this.options.cooldownMs) {
        this.state = 'CLOSED';
        this.failures = 0;
        return true;
      }
      return false;
    }
    return true;
  }

  recordFailure() {
    this.failures++;
    this.lastFailureTime = Date.now();
    if (this.failures >= this.options.failureThreshold) {
      this.state = 'OPEN';
    }
  }

  recordSuccess() {
    this.failures = 0;
    this.state = 'CLOSED';
  }
}
