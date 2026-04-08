/**
 * Fetch with retry and exponential backoff
 */

export interface RetryOptions {
  maxAttempts?: number;
  baseDelay?: number;
  maxDelay?: number;
  backoffMultiplier?: number;
  jitter?: boolean;
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxAttempts: 3,
  baseDelay: 1000,
  maxDelay: 10000,
  backoffMultiplier: 2,
  jitter: true,
};

/**
 * Sleep with jitter
 */
function sleep(ms: number, jitter = true): Promise<void> {
  if (jitter) {
    ms = ms * (0.5 + Math.random());
  }
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Check if response should be retried
 */
function shouldRetry(response: Response, attempt: number, maxAttempts: number): boolean {
  if (attempt >= maxAttempts) {
    return false;
  }

  // Retry on 5xx errors and 429 (rate limit)
  return response.status >= 500 || response.status === 429 || response.status === 408;
}

/**
 * Fetch with exponential backoff retry
 */
export async function fetchWithRetry(
  url: string,
  init?: RequestInit,
  options: RetryOptions = {},
): Promise<Response> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastResponse: Response | null = null;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < opts.maxAttempts; attempt++) {
    try {
      const response = await fetch(url, init);

      if (!shouldRetry(response, attempt, opts.maxAttempts)) {
        return response;
      }

      lastResponse = response;

      // Calculate delay with exponential backoff
      const delay = Math.min(
        opts.baseDelay * Math.pow(opts.backoffMultiplier, attempt),
        opts.maxDelay,
      );

      await sleep(delay, opts.jitter);
    } catch (error) {
      lastError = error as Error;

      // Don't retry on certain errors
      if (error instanceof TypeError && error.message.includes('abort')) {
        throw error;
      }

      if (attempt < opts.maxAttempts - 1) {
        const delay = Math.min(
          opts.baseDelay * Math.pow(opts.backoffMultiplier, attempt),
          opts.maxDelay,
        );
        await sleep(delay, opts.jitter);
      }
    }
  }

  // All retries exhausted
  if (lastError) {
    throw lastError;
  }

  return lastResponse!;
}

/**
 * Circuit breaker for repeated failures
 */
export class CircuitBreaker {
  private failureCount = 0;
  private lastFailureTime = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';

  constructor(
    private threshold = 5,
    private resetTimeoutMs = 60000,
  ) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime > this.resetTimeoutMs) {
        this.state = 'half-open';
      } else {
        throw new Error('Circuit breaker is OPEN');
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failureCount = 0;
    this.state = 'closed';
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.threshold) {
      this.state = 'open';
    }
  }

  getState(): { state: string; failureCount: number } {
    return {
      state: this.state,
      failureCount: this.failureCount,
    };
  }

  reset(): void {
    this.failureCount = 0;
    this.state = 'closed';
    this.lastFailureTime = 0;
  }
}
