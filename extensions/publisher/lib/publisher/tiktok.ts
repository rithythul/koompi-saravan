/**
 * TikTok Publisher
 *
 * Publishes to TikTok via Content Posting API.
 * Supports: Video only (images not supported for main feed).
 */

import type { GoogleMediaConfig } from '../config.js';
import { BasePublisher, type PublishContent, type PublishResult, type PostStatus, type ValidationResult, type RateLimitInfo, type ContentType } from './base.js';
import { fetchWithRetry } from '../utils/retry.js';

interface TikTokConfig {
  accessToken: string;
  creatorId: string;
  apiBaseUrl: string;
}

interface TikTokPublishResponse {
  data: {
    publish_id: string;
    video_url?: string;
    embed_url?: string;
  };
}

interface TikTokPublishStatus {
  data: {
    status: 'PUBLISHING' | 'PUBLISHED' | 'FAILED';
    public_post_url?: string;
    error_code?: string;
    error_message?: string;
  };
}

export class TikTokPublisher extends BasePublisher {
  readonly platform = 'tiktok' as const;
  readonly supportsScheduling = false; // TikTok doesn't support scheduled posts via API
  readonly supportedContentTypes: ContentType[] = ['video']; // Only video

  private config: TikTokConfig;

  constructor(config: TikTokConfig) {
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

      // Step 1: Initiate upload
      const publishUrl = await this.initiateUpload(content);

      // Step 2: Upload video to the returned URL
      await this.uploadVideo(publishUrl, content.mediaUrl);

      // Step 3: Get publish ID from URL and check status
      const publishId = this.extractPublishId(publishUrl);

      // Step 4: Poll for completion
      const result = await this.waitForPublish(publishId);

      return {
        success: true,
        postId: publishId,
        postUrl: result.public_post_url,
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

  private async initiateUpload(content: PublishContent): Promise<string> {
    const caption = this.formatCaption(content.caption, content.hashtags);

    const response = await fetchWithRetry(
      `${this.config.apiBaseUrl}/post/publish/inbox/video/init/`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          target_info: {
            target_handle: this.config.creatorId,
          },
          source_info: {
            source: 'PUBLISHER_API',
          },
          video: {
            video_url: content.mediaUrl,
          },
          post_info: {
            caption,
            // TikTok-specific options from platformOptions
            ...(content.platformOptions?.privacy ? { privacy_level: content.platformOptions.privacy as string } : {}),
            ...(content.platformOptions?.commentDisabled ? { comment_disabled: true } : {}),
            ...(content.platformOptions?.duetDisabled ? { duet_disabled: true } : {}),
            ...(content.platformOptions?.stitchDisabled ? { stitch_disabled: true } : {}),
          },
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`TikTok upload initiation failed: ${error}`);
    }

    const data = await response.json() as { data: { publish_id: string; upload_url: string } };
    return data.data.upload_url;
  }

  private async uploadVideo(uploadUrl: string, mediaUrl: string): Promise<void> {
    // Download the video first
    const videoResponse = await fetch(mediaUrl);
    if (!videoResponse.ok) {
      throw new Error(`Failed to download video from ${mediaUrl}`);
    }

    const videoBuffer = await videoResponse.arrayBuffer();

    // Upload to TikTok
    const uploadResponse = await fetchWithRetry(
      uploadUrl,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'video/mp4',
          'Content-Length': String(videoBuffer.byteLength),
        },
        body: videoBuffer,
      }
    );

    if (!uploadResponse.ok) {
      throw new Error(`TikTok video upload failed: ${uploadResponse.statusText}`);
    }
  }

  private extractPublishId(uploadUrl: string): string {
    // Extract publish_id from upload URL
    const match = uploadUrl.match(/publish_id=([^&]+)/);
    if (!match) {
      throw new Error('Could not extract publish ID from upload URL');
    }
    return match[1];
  }

  private async waitForPublish(publishId: string, maxAttempts = 30): Promise<TikTokPublishStatus['data']> {
    for (let i = 0; i < maxAttempts; i++) {
      const response = await fetch(
        `${this.config.apiBaseUrl}/post/publish/status/?publish_id=${publishId}`,
        {
          headers: {
            'Authorization': `Bearer ${this.config.accessToken}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to check publish status: ${response.statusText}`);
      }

      const result = await response.json() as TikTokPublishStatus;

      if (result.data.status === 'PUBLISHED') {
        return result.data;
      }

      if (result.data.status === 'FAILED') {
        throw new Error(`TikTok publish failed: ${result.data.error_message || 'Unknown error'}`);
      }

      // Wait before polling again (2 seconds)
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    throw new Error('TikTok publish timed out');
  }

  async getPostStatus(postId: string): Promise<PostStatus> {
    try {
      const response = await fetch(
        `${this.config.apiBaseUrl}/post/publish/status/?publish_id=${postId}`,
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

      const result = await response.json() as TikTokPublishStatus;

      if (result.data.status === 'FAILED') {
        return {
          id: postId,
          status: 'failed',
          error: result.data.error_message,
        };
      }

      return {
        id: postId,
        status: result.data.status === 'PUBLISHED' ? 'published' : 'publishing',
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
    // TikTok doesn't support deleting posts via API
    throw new Error('TikTok does not support post deletion via API. Please delete manually in the app.');
  }

  async validate(content: PublishContent): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // TikTok only supports video
    if (content.type !== 'video') {
      errors.push('TikTok only supports video content, not ' + content.type);
    }

    // Caption length (150-500 characters recommended)
    const caption = this.formatCaption(content.caption, content.hashtags);
    if (caption.length > 500) {
      warnings.push('Caption exceeds 500 characters (may be truncated)');
    }

    // Hashtag limit (5 recommended, but more allowed)
    if (content.hashtags && content.hashtags.length > 5) {
      warnings.push('More than 5 hashtags may reduce engagement');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  async getRateLimit(): Promise<RateLimitInfo> {
    // TikTok has a daily limit of ~20 posts
    return {
      remaining: 20, // Should be tracked internally
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

export function createTikTokPublisher(config: GoogleMediaConfig): TikTokPublisher {
  return new TikTokPublisher({
    accessToken: config.tiktokAccessToken ?? '',
    creatorId: config.tiktokCreatorId ?? '',
    apiBaseUrl: config.tiktokApiBaseUrl,
  });
}
