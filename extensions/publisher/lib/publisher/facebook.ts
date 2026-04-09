/**
 * Facebook Publisher
 *
 * Publishes to Facebook via Graph API.
 * Supports: Video, Reels, Images.
 */

import type { GoogleMediaConfig } from '../config.js';
import { BasePublisher, type PublishContent, type PublishResult, type PostStatus, type ValidationResult, type RateLimitInfo, type ContentType } from './base.js';
import { fetchWithRetry } from '../utils/retry.js';

interface FacebookConfig {
  appId: string;
  appSecret: string;
  accessToken: string;
  apiBaseUrl: string;
}

interface FacebookPostResponse {
  id: string;
  post_id?: string;
}

export class FacebookPublisher extends BasePublisher {
  readonly platform = 'facebook' as const;
  readonly supportsScheduling = true;
  readonly supportedContentTypes: ContentType[] = ['video', 'image'];

  private config: FacebookConfig;

  constructor(config: FacebookConfig) {
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

      const pageId = this.getPageIdFromToken();
      const caption = this.formatCaption(content.caption, content.hashtags);

      if (content.type === 'video') {
        return await this.publishVideo(pageId, content.mediaUrl, caption);
      } else {
        return await this.publishImage(pageId, content.mediaUrl, caption);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: message,
        retryable: this.isRetryable(error),
      };
    }
  }

  private getPageIdFromToken(): string {
    // Extract page ID from access token (format: page_id|access_token)
    const parts = this.config.accessToken.split('|');
    if (parts.length > 1) {
      return parts[0];
    }

    // Try to extract from JWT payload
    try {
      const payload = this.config.accessToken.split('.')[1];
      const decoded = JSON.parse(atob(payload));
      return decoded.page_id ?? decoded.profile_id ?? 'me';
    } catch {
      return 'me';
    }
  }

  private async publishVideo(pageId: string, mediaUrl: string, caption: string): Promise<PublishResult> {
    // For videos, we need to use the video endpoint
    const response = await fetchWithRetry(
      `${this.config.apiBaseUrl}/${pageId}/videos`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.accessToken}`,
        },
        body: new URLSearchParams({
          file_url: mediaUrl,
          description: caption,
          published: 'true',
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Facebook video publish failed: ${error}`);
    }

    const data = await response.json() as FacebookPostResponse;

    return {
      success: true,
      postId: data.id,
      postUrl: `https://facebook.com/${data.id}`,
    };
  }

  private async publishImage(pageId: string, mediaUrl: string, caption: string): Promise<PublishResult> {
    const response = await fetchWithRetry(
      `${this.config.apiBaseUrl}/${pageId}/photos`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.accessToken}`,
        },
        body: new URLSearchParams({
          url: mediaUrl,
          caption,
          published: 'true',
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Facebook image publish failed: ${error}`);
    }

    const data = await response.json() as FacebookPostResponse;

    return {
      success: true,
      postId: data.id,
      postUrl: `https://facebook.com/${data.post_id || data.id}`,
    };
  }

  async getPostStatus(postId: string): Promise<PostStatus> {
    try {
      const response = await fetch(
        `${this.config.apiBaseUrl}/${postId}?fields=status`,
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

      const data = await response.json() as { status?: string };

      return {
        id: postId,
        status: 'published', // Facebook posts are usually synchronous
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
      throw new Error(`Failed to delete Facebook post: ${response.statusText}`);
    }
  }

  async validate(content: PublishContent): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!this.supportsContentType(content.type)) {
      errors.push(`Content type ${content.type} not supported by Facebook`);
    }

    // Caption length (63206 max)
    const caption = this.formatCaption(content.caption, content.hashtags);
    if (caption.length > 63206) {
      errors.push('Caption exceeds 63206 character limit');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  async getRateLimit(): Promise<RateLimitInfo> {
    return {
      remaining: 200, // Facebook has generous limits
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

export function createFacebookPublisher(config: GoogleMediaConfig): FacebookPublisher {
  return new FacebookPublisher({
    appId: config.facebookAppId ?? '',
    appSecret: config.facebookAppSecret ?? '',
    accessToken: config.facebookAccessToken ?? '',
    apiBaseUrl: 'https://graph.facebook.com/v23.0',
  });
}
