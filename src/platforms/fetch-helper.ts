export interface ApiResponse<T = unknown> {
  ok: boolean;
  status: number;
  data: T;
}

export class PlatformApiError extends Error {
  constructor(
    public readonly platform: string,
    public readonly status: number,
    public readonly body: string,
    public readonly endpoint: string,
  ) {
    super(`[${platform}] API error ${status} on ${endpoint}: ${body}`);
    this.name = 'PlatformApiError';
  }
}

export async function apiRequest<T = unknown>(
  platform: string,
  url: string,
  options: RequestInit & { retries?: number; retryDelay?: number } = {},
): Promise<T> {
  const { retries = 3, retryDelay = 1000, ...fetchOptions } = options;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);

    try {
      const response = await fetch(url, {
        ...fetchOptions,
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (response.status === 429) {
        // Rate limited — respect Retry-After or exponential backoff
        const retryAfter = response.headers.get('Retry-After');
        const delay = retryAfter ? parseInt(retryAfter, 10) * 1000 : retryDelay * Math.pow(2, attempt);
        if (attempt < retries) {
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
      }

      if (response.status >= 500 && attempt < retries) {
        await new Promise(r => setTimeout(r, retryDelay * Math.pow(2, attempt)));
        continue;
      }

      const text = await response.text();
      if (!response.ok) {
        throw new PlatformApiError(platform, response.status, text, url);
      }

      return text ? (JSON.parse(text) as T) : ({} as T);
    } catch (error) {
      clearTimeout(timeout);
      if (error instanceof PlatformApiError) throw error;
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, retryDelay * Math.pow(2, attempt)));
        continue;
      }
      throw error;
    }
  }

  throw new Error(`[${platform}] Max retries exceeded for ${url}`);
}
