interface FetchWithRetryOptions extends RequestInit {
  retries?: number;
  retryDelay?: number; // in milliseconds
  timeout?: number; // in milliseconds
}

async function fetchWithRetry(
  url: RequestInfo,
  options: FetchWithRetryOptions = {}
): Promise<Response> {
  const { retries = 3, retryDelay = 1000, timeout = 30000, ...fetchOptions } = options;

  for (let i = 0; i <= retries; i++) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        ...fetchOptions,
        signal: controller.signal,
      });
      clearTimeout(id);

      if (!response.ok && response.status >= 500) {
        // Retry on server errors
        if (i < retries) {
          const delay = retryDelay * Math.pow(2, i);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
      }

      return response;
    } catch (error: any) {
      clearTimeout(id);
      if (i < retries) {
        const delay = retryDelay * Math.pow(2, i); // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        throw error; // Re-throw if all retries are exhausted
      }
    }
  }
  throw new Error("Maximum retries exceeded"); 
}

export default fetchWithRetry;
