/**
 * YouTube Publisher
 *
 * Publishes to YouTube Shorts via Data API v3.
 * Supports: Video (Shorts format).
 */

import type { GoogleMediaConfig } from '../config.js';
import { BasePublisher, type PublishContent, type PublishResult, type PostStatus, type ValidationResult, type RateLimitInfo, type ContentType } from './base.js';
import { fetchWithRetry } from '../utils/retry.js';

interface YouTubeConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  apiBaseUrl: string;
}

interface YouTubeUploadResponse {
  id: string;
}

interface YouTubeVideo {
  id: string;
  snippet: {
    title: string;
      description: string;
      tags?: string[];
  };
  status: {
    uploadStatus: string;
    privacyStatus: string;
  };
}

export class YouTubePublisher extends BasePublisher {
  readonly platform = 'youtube' as const;
  readonly supportsScheduling = true;
  readonly supportedContentTypes: ContentType[] = ['video'];

  private config: YouTubeConfig;
  private accessToken: string | null = null;
  private tokenExpiresAt: number | null = null;

  constructor(config: YouTubeConfig) {
    super();
    this.config = config;
  }

  /**
   * Get fresh access token using refresh token
   */
  private async getAccessToken(): Promise<string> {
    if (this.accessToken && this.tokenExpiresAt && Date.now() < this.tokenExpiresAt) {
      return this.accessToken;
    }

    const response = await fetch(
      'https://oauth2.googleapis.com/token',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          refresh_token: this.config.refreshToken,
          grant_type: 'refresh_token',
        }),
      }
    );

    if (!response.ok) {
      throw new Error('Failed to refresh YouTube access token');
    }

    const data = await response.json() as { access_token: string; expires_in: number };
    this.accessToken = data.access_token;
    this.tokenExpiresAt = Date.now() + (data.expires_in - 300) * 1000; // 5min buffer

    return this.accessToken;
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

      const token = await this.getAccessToken();

      // Step 1: Initiate resumable upload
      const uploadUrl = await this.initiateUpload(token, content);

      // Step 2: Upload video
      const videoId = await this.uploadVideo(uploadUrl, content.mediaUrl);

      // Step 3: Set as Short (vertical videos are auto-detected, but we can add #Shorts)
      await this.updateVideoMetadata(token, videoId, content);

      return {
        success: true,
        postId: videoId,
        postUrl: `https://youtube.com/short/${videoId}`,
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

  private async initiateUpload(token: string, content: PublishContent): Promise<string> {
    const caption = this.formatCaption(content.caption, content.hashtags);

    const response = await fetchWithRetry(
      `${this.config.apiBaseUrl}/upload?uploadType=resumable&part=snippet,status`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          snippet: {
            title: caption.substring(0, 100), // Title from first 100 chars
            description: caption,
            tags: content.hashtags,
            categoryId: '24', // Entertainment
          },
          status: {
            privacyStatus: (content.platformOptions?.privacy as string) ?? 'public',
            selfDeclaredMadeForKids: false,
          },
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`YouTube upload initiation failed: ${error}`);
    }

    const uploadUrl = response.headers.get('Location');
    if (!uploadUrl) {
      throw new Error('YouTube did not return upload URL');
    }

    return uploadUrl;
  }

  private async uploadVideo(uploadUrl: string, mediaUrl: string): Promise<string> {
    // Download the video
    const videoResponse = await fetch(mediaUrl);
    if (!videoResponse.ok) {
      throw new Error(`Failed to download video from ${mediaUrl}`);
    }

    const videoBuffer = await videoResponse.arrayBuffer();
    const totalBytes = videoBuffer.byteLength;

    // Upload to YouTube
    const uploadResponse = await fetchWithRetry(
      uploadUrl,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'video/mp4',
          'Content-Length': String(totalBytes),
          'Content-Range': `bytes 0-${totalBytes - 1}/${totalBytes}`,
        },
        body: videoBuffer,
      }
    );

    if (!uploadResponse.ok) {
      const error = await uploadResponse.text();
      throw new Error(`YouTube video upload failed: ${error}`);
    }

    const data = await uploadResponse.json() as YouTubeUploadResponse;
    return data.id;
  }

  private async updateVideoMetadata(token: string, videoId: string, content: PublishContent): Promise<void> {
    // Ensure #Shorts is in tags for proper categorization
    const tags = [...(content.hashtags ?? []), '#Shorts'];

    await fetch(
      `${this.config.apiBaseUrl}/videos?part=snippet&id=${videoId}`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: videoId,
          snippet: {
            title: content.caption.substring(0, 100),
            description: this.formatCaption(content.caption, content.hashtags),
            tags,
            categoryId: '24',
          },
        }),
      }
    );
  }

  async getPostStatus(postId: string): Promise<PostStatus> {
    try {
      const token = await this.getAccessToken();

      const response = await fetch(
        `${this.config.apiBaseUrl}/videos?part=status,snippet&id=${postId}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
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

      const data = await response.json() as { items: YouTubeVideo[] };

      if (!data.items || data.items.length === 0) {
        return {
          id: postId,
          status: 'failed',
          error: 'Video not found',
        };
      }

      const video = data.items[0];

      return {
        id: postId,
        status: video.status.uploadStatus === 'uploaded' ? 'published' : 'pending',
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
    const token = await this.getAccessToken();

    const response = await fetch(
      `${this.config.apiBaseUrl}/videos?id=${postId}`,
      {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to delete YouTube video: ${response.statusText}`);
    }
  }

  async validate(content: PublishContent): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // YouTube only supports video
    if (content.type !== 'video') {
      errors.push('YouTube only supports video content, not ' + content.type);
    }

    // Title length (100 max)
    if (content.caption.length > 100) {
      warnings.push('Caption will be truncated to 100 characters for title');
    }

    // Description length (5000 max)
    const fullCaption = this.formatCaption(content.caption, content.hashtags);
    if (fullCaption.length > 5000) {
      errors.push('Caption exceeds 5000 character limit');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  async getRateLimit(): Promise<RateLimitInfo> {
    // YouTube uses quota units (100/day default, upload = ~100 units)
    return {
      remaining: 100, // Should be tracked internally
    };
  }

  private isRetryable(error: unknown): boolean {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      return message.includes('rate limit') ||
             message.includes('timeout') ||
             message.includes('5') ||
             message.includes('quota') ||
             message.includes('temporarily');
    }
    return false;
  }
}

export function createYouTubePublisher(config: GoogleMediaConfig): YouTubePublisher {
  return new YouTubePublisher({
    clientId: config.youtubeClientId ?? '',
    clientSecret: config.youtubeClientSecret ?? '',
    refreshToken: config.youtubeRefreshToken ?? '',
    apiBaseUrl: 'https://www.googleapis.com/youtube/v3',
  });
}
