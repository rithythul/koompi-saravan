/**
 * Retry utilities for platform publishing
 *
 * Provides auto-retry with exponential backoff for transient errors.
 */

import type { PostResult, PlatformName, SocialPost } from './index.js';
import { postToOne } from './manager.js';
import type { ErrorType } from '../api/types.js';

export const MAX_RETRIES = 3;
export const BACKOFF_DELAYS = [1000, 3000, 9000] as const; // 1s, 3s, 9s

/**
 * Transient error patterns - these should trigger auto-retry
 */
const TRANSIENT_PATTERNS = [
  'timeout', 'timed out', 'etimedout', 'esockettimedout',
  'econnreset', 'econnrefused', 'network',
  'rate limit', '429', 'too many requests',
  '503', 'service unavailable', '502', 'bad gateway',
  '504', 'gateway timeout',
  'temporary', 'try again', 'unavailable',
];

/**
 * Permanent error patterns - these should NOT trigger auto-retry
 */
const PERMANENT_PATTERNS = [
  '401', 'unauthorized', 'authentication',
  '403', 'forbidden',
  '404', 'not found',
  '400', 'bad request', 'invalid',
  'access token', 'expired token', 'invalid token',
  'permission denied', 'not allowed',
];

/**
 * Classify an error as transient or permanent based on error message
 */
export function classifyError(error: string | Error | unknown): ErrorType {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const lowerMessage = errorMessage.toLowerCase();

  // Check permanent patterns first
  for (const pattern of PERMANENT_PATTERNS) {
    if (lowerMessage.includes(pattern)) {
      return 'permanent';
    }
  }

  // Check transient patterns
  for (const pattern of TRANSIENT_PATTERNS) {
    if (lowerMessage.includes(pattern)) {
      return 'transient';
    }
  }

  // Default to permanent for unknown errors (fail safe)
  return 'permanent';
}

/**
 * Sleep for a specified duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry a single platform publish with exponential backoff
 *
 * @param content - The social post content
 * @param platform - The platform to publish to
 * @param attempt - Current attempt number (0-indexed)
 * @returns Promise<PostResult> - The publish result
 */
export async function retryPublish(
  content: SocialPost,
  platform: PlatformName,
  attempt: number = 0,
): Promise<PostResult & { retryCount: number; errorType: ErrorType }> {
  try {
    const result = await postToOne(content, platform);

    if (result.success) {
      return { ...result, retryCount: attempt, errorType: null };
    }

    // Publish failed - check if we should retry
    const errorType = classifyError(result.error);

    if (errorType === 'transient' && attempt < MAX_RETRIES - 1) {
      const delay = BACKOFF_DELAYS[attempt];
      console.log(`[Retry] Transient error for ${platform}, retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
      await sleep(delay);
      return retryPublish(content, platform, attempt + 1);
    }

    return {
      platform,
      success: false,
      error: result.error,
      retryCount: attempt,
      errorType,
    };
  } catch (error) {
    const errorType = classifyError(error);

    if (errorType === 'transient' && attempt < MAX_RETRIES - 1) {
      const delay = BACKOFF_DELAYS[attempt];
      console.log(`[Retry] Transient error for ${platform}, retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
      await sleep(delay);
      return retryPublish(content, platform, attempt + 1);
    }

    return {
      platform,
      success: false,
      error: error instanceof Error ? error.message : String(error),
      retryCount: attempt,
      errorType,
    };
  }
}

/**
 * Retry multiple platforms with auto-retry for transient errors
 *
 * @param content - The social post content
 * @param platforms - Array of platforms to publish to
 * @returns Promise<Array<PostResult & { retryCount: number; errorType: ErrorType }>>
 */
export async function retryPublishAll(
  content: SocialPost,
  platforms: PlatformName[],
): Promise<Array<PostResult & { retryCount: number; errorType: ErrorType }>> {
  const results = await Promise.allSettled(
    platforms.map(p => retryPublish(content, p))
  );

  return results.map((result) => {
    if (result.status === 'fulfilled') {
      return result.value;
    }
    // Should not happen since retryPublish catches all errors
    return {
      platform: 'unknown',
      success: false,
      error: 'Unknown error',
      retryCount: 0,
      errorType: 'permanent',
    };
  });
}
