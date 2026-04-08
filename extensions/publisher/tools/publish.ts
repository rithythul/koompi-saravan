/**
 * Unified Publish Tool
 *
 * Publishes content to one or more social media platforms.
 */

import type { GoogleMediaConfig } from '../lib/config.js';
import { loadConfig, assertAutomationEnabled } from '../lib/config.js';
import { createPublisher, getSupportedPlatforms, type PublishContent, type Platform } from '../lib/publisher/index.js';
import { CircuitBreaker } from '../lib/utils/retry.js';

export interface PublishRequest {
  platforms: Platform[];
  content: {
    type: 'video' | 'image' | 'carousel';
    mediaUrl: string;
    caption: string;
    hashtags?: string[];
    scheduleAt?: string; // ISO date string
  };
  options?: {
    dryRun?: boolean;
    validateOnly?: boolean;
    maxConcurrency?: number;
  };
}

export interface PublishResult {
  platform: Platform;
  success: boolean;
  postId?: string;
  postUrl?: string;
  error?: string;
  warnings?: string[];
}

export interface BatchPublishResult {
  results: PublishResult[];
  summary: {
    total: number;
    successful: number;
    failed: number;
    skipped: number;
  };
}

/**
 * Publish to multiple platforms
 */
export async function publishToPlatforms(
  request: PublishRequest,
  configOverrides: Partial<GoogleMediaConfig> = {},
): Promise<BatchPublishResult> {
  const config = loadConfig(configOverrides);
  assertAutomationEnabled(config);

  const results: PublishResult[] = [];
  let successful = 0;
  let failed = 0;
  let skipped = 0;

  // Circuit breakers per platform
  const circuitBreakers = new Map<Platform, CircuitBreaker>();

  // Convert content
  const content: PublishContent = {
    type: request.content.type,
    mediaUrl: request.content.mediaUrl,
    caption: request.content.caption,
    hashtags: request.content.hashtags,
    scheduleAt: request.content.scheduleAt ? new Date(request.content.scheduleAt) : undefined,
  };

  // Process each platform
  for (const platform of request.platforms) {
    try {
      // Check if platform is supported
      if (!getSupportedPlatforms().includes(platform)) {
        results.push({
          platform,
          success: false,
          error: `Platform ${platform} is not supported`,
        });
        failed++;
        continue;
      }

      // Get or create circuit breaker
      if (!circuitBreakers.has(platform)) {
        circuitBreakers.set(platform, new CircuitBreaker(5, 60000));
      }

      const circuitBreaker = circuitBreakers.get(platform)!;

      // Check circuit breaker
      const breakerState = circuitBreaker.getState();
      if (breakerState.state === 'open') {
        results.push({
          platform,
          success: false,
          error: `Circuit breaker is open for ${platform} due to repeated failures`,
        });
        skipped++;
        continue;
      }

      // Create publisher
      const publisher = createPublisher(platform, config);

      // Validate only mode
      if (request.options?.validateOnly) {
        const validation = await publisher.validate(content);
        results.push({
          platform,
          success: validation.valid,
          warnings: validation.warnings,
          error: validation.errors.length > 0 ? validation.errors.join(', ') : undefined,
        });
        if (validation.valid) {
          successful++;
        } else {
          failed++;
        }
        continue;
      }

      // Execute publish through circuit breaker
      const result = await circuitBreaker.execute(async () => {
        return await publisher.publish(content);
      });

      results.push({
        platform,
        success: result.success,
        postId: result.postId,
        postUrl: result.postUrl,
        error: result.error,
      });

      if (result.success) {
        successful++;
      } else {
        failed++;
      }
    } catch (error) {
      results.push({
        platform,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
      failed++;
    }
  }

  return {
    results,
    summary: {
      total: request.platforms.length,
      successful,
      failed,
      skipped,
    },
  };
}

/**
 * OpenClaw tool definition
 */
export const publishTool = {
  name: 'publish',
  description: 'Publish content to one or more social media platforms (Telegram, X)',
  parameters: {
    type: 'object',
    properties: {
      platforms: {
        type: 'array',
        items: {
          type: 'string',
          enum: ['telegram', 'x'],
        },
        description: 'List of platforms to publish to',
      },
      content: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['video', 'image', 'carousel'],
            description: 'Content type',
          },
          mediaUrl: {
            type: 'string',
            description: 'URL of the media to publish',
          },
          caption: {
            type: 'string',
            description: 'Caption/text for the post',
          },
          hashtags: {
            type: 'array',
            items: { type: 'string' },
            description: 'Hashtags (without # symbol)',
          },
          scheduleAt: {
            type: 'string',
            format: 'date-time',
            description: 'ISO datetime for scheduled posting (if supported)',
          },
        },
        required: ['type', 'mediaUrl', 'caption'],
      },
      options: {
        type: 'object',
        properties: {
          dryRun: {
            type: 'boolean',
            description: 'Validate without publishing',
          },
          validateOnly: {
            type: 'boolean',
            description: 'Only validate content, do not publish',
          },
          maxConcurrency: {
            type: 'number',
            description: 'Max concurrent publishes (default: 3)',
          },
        },
      },
    },
    required: ['platforms', 'content'],
  },
};

/**
 * Create the publish tool with config
 */
export function createPublishTool(configOverrides: Partial<GoogleMediaConfig> = {}) {
  return {
    ...publishTool,
    execute: async (toolCallId: string, params: unknown) => {
      const request = params as PublishRequest;
      const result = await publishToPlatforms(request, configOverrides);
      return {
        role: 'tool' as const,
        content: [{ type: 'text' as const, text: JSON.stringify(result) }],
      };
    },
  };
}
