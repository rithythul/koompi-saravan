/**
 * Instagram Publisher
 *
 * Publishes to Instagram Graph API (Business accounts only).
 * Supports: Reels (video), Posts (image), Carousel.
 */

import type { GoogleMediaConfig } from '../config.js';
import { BasePublisher, type PublishContent, type PublishResult, type PostStatus, type ValidationResult, type RateLimitInfo, type ContentType } from './base.js';
import { fetchWithRetry } from '../utils/retry.js';

interface InstagramConfig {
  accessToken: string;
  businessAccountId: string;
  apiBaseUrl: string;
}

interface InstagramContainer {
  id: string;
  status: string;
  code?: string;
}

interface InstagramPublishResponse {
  id: string;
  status: string;
}

export class InstagramPublisher extends BasePublisher {
  readonly platform = 'instagram' as const;
  readonly supportsScheduling = true;
  readonly supportedContentTypes: ContentType[] = ['video', 'image', 'carousel'];

  private config: InstagramConfig;

  constructor(config: InstagramConfig) {
    super();
    this.config = config;
  }

  async publish(content: PublishContent): Promise<PublishResult> {
    try {
      // Validate first
      const validation = await this.validate(content);
      if (!validation.valid) {
        return {
          success: false,
          error: validation.errors.join(', '),
          retryable: false,
        };
      }

      // Step 1: Create media container
      const containerId = await this.createContainer(content);

      // Step 2: Wait for container to be ready (Instagram processes async)
      const readyContainer = await this.waitForContainer(containerId);

      // Step 3: Publish the container
      const publishResult = await this.publishContainer(readyContainer.id);

      // Step 4: Get the post URL
      const postUrl = await this.getPostUrl(publishResult.id);

      return {
        success: true,
        postId: publishResult.id,
        postUrl,
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

  private async createContainer(content: PublishContent): Promise<string> {
    const caption = this.formatCaption(content.caption, content.hashtags);
    const isVideo = content.type === 'video';

    const body: Record<string, string> = {
      caption,
      media_type: isVideo ? 'REELS' : (content.type === 'carousel' ? 'CAROUSEL' : 'IMAGE'),
    };

    if (isVideo || content.type === 'image') {
      body.video_url = content.mediaUrl;
      body.image_url = content.mediaUrl;
    }

    // For carousel, we'd need to handle children - simplified here
    if (content.type === 'carousel') {
      body.image_url = content.mediaUrl; // First image
    }

    const response = await fetchWithRetry(
      `${this.config.apiBaseUrl}/${this.config.businessAccountId}/media`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.accessToken}`,
        },
        body: new URLSearchParams(body),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Instagram container creation failed: ${error}`);
    }

    const data = await response.json() as { id?: string };
    if (!data.id) {
      throw new Error('Instagram did not return container ID');
    }

    return data.id;
  }

  private async waitForContainer(containerId: string, maxAttempts = 20): Promise<InstagramContainer> {
    for (let i = 0; i < maxAttempts; i++) {
      const response = await fetchWithRetry(
        `${this.config.apiBaseUrl}/${containerId}?fields=status,code`,
        {
          headers: {
            'Authorization': `Bearer ${this.config.accessToken}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to check container status: ${response.statusText}`);
      }

      const container = await response.json() as InstagramContainer;

      if (container.status === 'FINISHED') {
        return container;
      }

      if (container.status === 'ERROR' || container.status === 'EXPIRED') {
        throw new Error(`Container failed with status: ${container.status}`);
      }

      // Wait before retrying
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    throw new Error('Container processing timed out');
  }

  private async publishContainer(containerId: string): Promise<InstagramPublishResponse> {
    const response = await fetchWithRetry(
      `${this.config.apiBaseUrl}/${this.config.businessAccountId}/media_publish`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.accessToken}`,
        },
        body: new URLSearchParams({
          creation_id: containerId,
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Instagram publish failed: ${error}`);
    }

    const data = await response.json();
    return data as InstagramPublishResponse;
  }

  private async getPostUrl(mediaId: string): Promise<string> {
    // Get permalink from Instagram
    const response = await fetchWithRetry(
      `${this.config.apiBaseUrl}/${mediaId}?fields=permalink`,
      {
        headers: {
          'Authorization': `Bearer ${this.config.accessToken}`,
        },
      }
    );

    if (!response.ok) {
      return `https://instagram.com/p/${mediaId}`; // Fallback
    }

    const data = await response.json() as { permalink?: string };
    return data.permalink ?? `https://instagram.com/p/${mediaId}`;
  }

  async getPostStatus(postId: string): Promise<PostStatus> {
    try {
      const response = await fetch(
        `${this.config.apiBaseUrl}/${postId}?fields=status_code`,
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

      const data = await response.json() as { status_code?: string };

      return {
        id: postId,
        status: data.status_code === 'PUBLISHED' || data.status_code === '200' ? 'published' : 'pending',
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
      `${this.config.apiBaseUrl}/${postId}`,
      {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${this.config.accessToken}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to delete Instagram post: ${response.statusText}`);
    }
  }

  async validate(content: PublishContent): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check content type support
    if (!this.supportsContentType(content.type)) {
      errors.push(`Content type ${content.type} not supported by Instagram`);
    }

    // Validate caption length (2200 max)
    const caption = this.formatCaption(content.caption, content.hashtags);
    if (caption.length > 2200) {
      errors.push('Caption exceeds 2200 character limit');
    }

    // Validate hashtags count (30 max)
    if (content.hashtags && content.hashtags.length > 30) {
      errors.push('Instagram allows maximum 30 hashtags');
    }

    // Warning for too many hashtags
    if (content.hashtags && content.hashtags.length > 15) {
      warnings.push('More than 15 hashtags may reduce engagement');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  async getRateLimit(): Promise<RateLimitInfo> {
    // Instagram uses rate limiting based on calls per hour
    // We'll track this internally or return a default
    return {
      remaining: 100, // Default, should be tracked
    };
  }

  private isRetryable(error: unknown): boolean {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      return message.includes('rate limit') ||
             message.includes('timeout') ||
             message.includes('5') ||
             message.includes('temporarily');
    }
    return false;
  }
}

export function createInstagramPublisher(config: GoogleMediaConfig): InstagramPublisher {
  return new InstagramPublisher({
    accessToken: config.instagramAccessToken ?? '',
    businessAccountId: config.instagramBusinessAccountId ?? '',
    apiBaseUrl: config.instagramApiBaseUrl,
  });
}
