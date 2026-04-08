/**
 * X (Twitter) Publisher
 *
 * Publishes to X via API v2.
 * Supports: Video, Image (Media upload required).
 */

import type { GoogleMediaConfig } from '../config.js';
import { BasePublisher, type PublishContent, type PublishResult, type PostStatus, type ValidationResult, type RateLimitInfo, type ContentType } from './base.js';
import { fetchWithRetry } from '../utils/retry.js';

interface XConfig {
  apiKey: string;
  apiSecret: string;
  accessToken: string;
  accessSecret: string;
  apiBaseUrl: string;
}

interface XMediaUploadResponse {
  media_id_string: string;
  media_id: number;
  size: number;
  expires_after_secs: number;
  image: {
    image_type: string;
    w: number;
    h: number;
  };
}

interface XTweetResponse {
  data: {
    id: string;
    text: string;
  };
}

interface XTweetCreateResponse {
  data: {
    id: string;
    text: string;
  };
}

export class XPublisher extends BasePublisher {
  readonly platform = 'x' as const;
  readonly supportsScheduling = false;
  readonly supportedContentTypes: ContentType[] = ['video', 'image'];

  private config: XConfig;

  constructor(config: XConfig) {
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

      // Step 1: Upload media
      const mediaId = await this.uploadMedia(content.mediaUrl, content.type);

      // Step 2: Wait for media processing
      await this.waitForMediaProcessing(mediaId);

      // Step 3: Create tweet with media
      const caption = this.formatCaption(content.caption, content.hashtags);
      return await this.createTweet(caption, mediaId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: message,
        retryable: this.isRetryable(error),
      };
    }
  }

  private async uploadMedia(mediaUrl: string, contentType: ContentType): Promise<string> {
    // Download media first
    const mediaResponse = await fetch(mediaUrl);
    if (!mediaResponse.ok) {
      throw new Error(`Failed to download media from ${mediaUrl}`);
    }

    const mediaBuffer = await mediaResponse.arrayBuffer();
    const mediaType = contentType === 'video' ? 'video/mp4' : 'image/jpeg';

    // Initialize upload
    const initResponse = await fetch(
      `${this.config.apiBaseUrl}/media/upload.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          command: 'INIT',
          total_bytes: String(mediaBuffer.byteLength),
          media_type: mediaType,
        }),
      }
    );

    if (!initResponse.ok) {
      throw new Error('X media upload initialization failed');
    }

    const initData = await initResponse.json() as { media_id_string: string };
    const mediaId = initData.media_id_string;

    // Append media data (chunked upload would be better for large files)
    const appendResponse = await fetch(
      `${this.config.apiBaseUrl}/media/upload.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          command: 'APPEND',
          media_id: mediaId,
          segment_index: '0',
          media_data: Buffer.from(mediaBuffer).toString('base64'),
        }),
      }
    );

    if (!appendResponse.ok) {
      throw new Error('X media append failed');
    }

    // Finalize upload
    const finalizeResponse = await fetch(
      `${this.config.apiBaseUrl}/media/upload.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          command: 'FINALIZE',
          media_id: mediaId,
        }),
      }
    );

    if (!finalizeResponse.ok) {
      throw new Error('X media finalize failed');
    }

    return mediaId;
  }

  private async waitForMediaProcessing(mediaId: string, maxAttempts = 30): Promise<void> {
    for (let i = 0; i < maxAttempts; i++) {
      const response = await fetch(
        `${this.config.apiBaseUrl}/media/upload.json?command=STATUS&media_id=${mediaId}`
      );

      if (!response.ok) {
        throw new Error('X media status check failed');
      }

      const data = await response.json() as {
        processing_info?: {
          state: string;
          check_after_secs?: number;
        };
      };

      const state = data.processing_info?.state;

      if (state === 'succeeded') {
        return;
      }

      if (state === 'failed') {
        throw new Error('X media processing failed');
      }

      const waitTime = (data.processing_info?.check_after_secs ?? 5) * 1000;
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }

    throw new Error('X media processing timed out');
  }

  private async createTweet(caption: string, mediaId: string): Promise<PublishResult> {
    const response = await fetchWithRetry(
      `${this.config.apiBaseUrl}/tweets`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: caption,
          media: {
            media_ids: [mediaId],
          },
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`X tweet creation failed: ${error}`);
    }

    const data = await response.json() as XTweetCreateResponse;

    return {
      success: true,
      postId: data.data.id,
      postUrl: `https://x.com/user/status/${data.data.id}`,
    };
  }

  async getPostStatus(postId: string): Promise<PostStatus> {
    try {
      const response = await fetch(
        `${this.config.apiBaseUrl}/tweets/${postId}`
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
      `${this.config.apiBaseUrl}/tweets/${postId}`,
      {
        method: 'DELETE',
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to delete X tweet: ${response.statusText}`);
    }
  }

  async validate(content: PublishContent): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!this.supportsContentType(content.type)) {
      errors.push(`Content type ${content.type} not supported by X`);
    }

    // Caption length (280 max for posts, 500 for premium users)
    const caption = this.formatCaption(content.caption, content.hashtags);
    if (caption.length > 280) {
      errors.push('Caption exceeds 280 character limit (500 for Premium users)');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  async getRateLimit(): Promise<RateLimitInfo> {
    // X has rate limits based on time windows
    return {
      remaining: 50, // Free tier: ~50 posts/day
    };
  }

  private isRetryable(error: unknown): boolean {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      return message.includes('rate limit') ||
             message.includes('timeout') ||
             message.includes('5') ||
             message.includes('429') ||
             message.includes('too many requests');
    }
    return false;
  }
}

export function createXPublisher(config: GoogleMediaConfig): XPublisher {
  return new XPublisher({
    apiKey: config.xApiKey ?? '',
    apiSecret: config.xApiSecret ?? '',
    accessToken: config.xAccessToken ?? '',
    accessSecret: config.xAccessSecret ?? '',
    apiBaseUrl: 'https://api.twitter.com/2',
  });
}
