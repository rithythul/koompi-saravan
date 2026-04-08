/**
 * Pinterest Publisher
 *
 * Publishes to Pinterest via API v5.
 * Supports: Video, Image (Pins).
 */

import type { GoogleMediaConfig } from '../config.js';
import { BasePublisher, type PublishContent, type PublishResult, type PostStatus, type ValidationResult, type RateLimitInfo, type ContentType } from './base.js';
import { fetchWithRetry } from '../utils/retry.js';

interface PinterestConfig {
  accessToken: string;
  apiBaseUrl: string;
}

interface PinterestPinResponse {
  id: string;
  url: string;
}

export class PinterestPublisher extends BasePublisher {
  readonly platform = 'pinterest' as const;
  readonly supportsScheduling = false;
  readonly supportedContentTypes: ContentType[] = ['video', 'image'];

  private config: PinterestConfig;
  private DEFAULT_BOARD_ID = 'your-board-id'; // User should provide this

  constructor(config: PinterestConfig) {
    super();
    this.config = config;
  }

  async publish(content: PublishContent): Promise<PublishResult> {
    try {
      const validation = await this.validate(content);
      if (!validation.valid) {
        return {
          success: false,
          error: validation.errors.join(', '),
          retryable: false,
        };
      }

      const boardId = (content.platformOptions?.boardId as string) ?? this.DEFAULT_BOARD_ID;
      const caption = this.formatCaption(content.caption, content.hashtags);

      const response = await fetchWithRetry(
        `${this.config.apiBaseUrl}/pins`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.config.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            board_id: boardId,
            media_source: {
              source_type: content.type === 'video' ? 'video_url' : 'image_url',
              url: content.mediaUrl,
            },
            title: caption.substring(0, 100),
            description: caption,
            link: content.platformOptions?.link as string ?? 'https://sarawan.social',
          }),
        }
      );

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Pinterest publish failed: ${error}`);
      }

      const data = await response.json() as PinterestPinResponse;

      return {
        success: true,
        postId: data.id,
        postUrl: data.url,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: message,
        retryable: this.isRetryable(error),
      };
    }
  }

  async getPostStatus(postId: string): Promise<PostStatus> {
    try {
      const response = await fetch(
        `${this.config.apiBaseUrl}/pins/${postId}`,
        {
          headers: {
            'Authorization': `Bearer ${this.config.accessToken}`,
          },
        }
      );

      if (!response.ok) {
        return {
          id: postId,
          status: 'failed',
          error: `Failed to get status: ${response.statusText}`,
        };
      }

      return {
        id: postId,
        status: 'published',
      };
    } catch {
      return {
        id: postId,
        status: 'failed',
        error: 'Unknown error',
      };
    }
  }

  async deletePost(postId: string): Promise<void> {
    const response = await fetch(
      `${this.config.apiBaseUrl}/pins/${postId}`,
      {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${this.config.accessToken}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to delete Pinterest pin: ${response.statusText}`);
    }
  }

  async validate(content: PublishContent): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!this.supportsContentType(content.type)) {
      errors.push(`Content type ${content.type} not supported by Pinterest`);
    }

    // Title length (100 max)
    if (content.caption.length > 100) {
      warnings.push('Caption will be truncated to 100 characters for title');
    }

    // Description length (500 max)
    const fullCaption = this.formatCaption(content.caption, content.hashtags);
    if (fullCaption.length > 500) {
      errors.push('Caption exceeds 500 character limit');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  async getRateLimit(): Promise<RateLimitInfo> {
    return {
      remaining: 100, // ~100 calls/hour
    };
  }

  private isRetryable(error: unknown): boolean {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      return message.includes('rate limit') ||
             message.includes('timeout') ||
             message.includes('5');
    }
    return false;
  }
}

export function createPinterestPublisher(config: GoogleMediaConfig): PinterestPublisher {
  return new PinterestPublisher({
    accessToken: config.pinterestAccessToken ?? '',
    apiBaseUrl: config.pinterestApiBaseUrl ?? 'https://api.pinterest.com/v5',
  });
}
