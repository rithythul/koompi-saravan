/**
 * LinkedIn Publisher
 *
 * Publishes to LinkedIn via Marketing API.
 * Supports: Video, Image (Shares and Posts).
 */

import type { GoogleMediaConfig } from '../config.js';
import { BasePublisher, type PublishContent, type PublishResult, type PostStatus, type ValidationResult, type RateLimitInfo, type ContentType } from './base.js';
import { fetchWithRetry } from '../utils/retry.js';

interface LinkedInConfig {
  clientId: string;
  clientSecret: string;
  accessToken: string;
  apiBaseUrl: string;
}

interface LinkedInPostResponse {
  id: string;
}

interface LinkedInUgcPostResponse {
  id: string;
}

export class LinkedInPublisher extends BasePublisher {
  readonly platform = 'linkedin' as const;
  readonly supportsScheduling = false;
  readonly supportedContentTypes: ContentType[] = ['video', 'image'];

  private config: LinkedInConfig;

  constructor(config: LinkedInConfig) {
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

      const personUrn = await this.getPersonUrn();
      const caption = this.formatCaption(content.caption, content.hashtags);

      if (content.type === 'video') {
        return await this.publishVideo(personUrn, content.mediaUrl, caption);
      } else {
        return await this.publishImage(personUrn, content.mediaUrl, caption);
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

  private async getPersonUrn(): Promise<string> {
    const response = await fetch(
      `${this.config.apiBaseUrl}/userinfo`,
      {
        headers: {
          'Authorization': `Bearer ${this.config.accessToken}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error('Failed to get LinkedIn user info');
    }

    const data = await response.json() as { sub: string };
    return `urn:li:person:${data.sub}`;
  }

  private async registerMediaUpload(personUrn: string, mediaUrl: string): Promise<string> {
    const response = await fetchWithRetry(
      `${this.config.apiBaseUrl}/assets?action=registerUpload`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          registerUploadRequest: {
            owner: personUrn,
            recipes: [
              {
                recipe: 'urn:li:digitalmediaAssetRecipe:feedshare-image',
              },
            ],
            serviceRelationships: [
              {
                relationshipType: 'OWNER',
                identifier: 'urn:li:userGeneratedContent',
              },
            ],
            supportedUploadMechanism: ['SYNCHRONOUS_UPLOAD'],
          },
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`LinkedIn media registration failed: ${error}`);
    }

    const data = await response.json() as {
      value: {
        asset: string;
        uploadMechanism: {
          'com.linkedin.digitalmedia.uploading.MediaUploadWebRequest': {
            uploadUrl: string;
            headers: Record<string, string>;
          };
        };
      }[];
    };

    const uploadUrl = data.value[0].uploadMechanism['com.linkedin.digitalmedia.uploading.MediaUploadWebRequest'].uploadUrl;
    const asset = data.value[0].asset;

    // Upload the media
    const mediaResponse = await fetch(mediaUrl);
    const mediaBuffer = await mediaResponse.arrayBuffer();

    await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/octet-stream',
      },
      body: mediaBuffer,
    });

    return asset;
  }

  private async publishImage(personUrn: string, mediaUrl: string, caption: string): Promise<PublishResult> {
    const asset = await this.registerMediaUpload(personUrn, mediaUrl);

    const response = await fetchWithRetry(
      `${this.config.apiBaseUrl}/ugcPosts`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          author: personUrn,
          lifecycleState: 'PUBLISHED',
          specificContent: {
            'com.linkedin.ugc.ShareContent': {
              shareCommentary: {
                text: caption,
              },
              shareMediaCategory: 'IMAGE',
              media: [
                {
                  status: 'READY',
                  description: {
                    text: caption,
                  },
                  media: asset,
                  title: {
                    text: caption.substring(0, 100),
                  },
                },
              ],
            },
          },
          visibility: {
            'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
          },
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`LinkedIn image publish failed: ${error}`);
    }

    const data = await response.json() as LinkedInUgcPostResponse;

    return {
      success: true,
      postId: data.id,
      postUrl: `https://linkedin.com/feed/update/${data.id}`,
    };
  }

  private async publishVideo(personUrn: string, mediaUrl: string, caption: string): Promise<PublishResult> {
    // For video, we use a different endpoint
    const asset = await this.registerMediaUpload(personUrn, mediaUrl);

    const response = await fetchWithRetry(
      `${this.config.apiBaseUrl}/ugcPosts`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          author: personUrn,
          lifecycleState: 'PUBLISHED',
          specificContent: {
            'com.linkedin.ugc.ShareContent': {
              shareCommentary: {
                text: caption,
              },
              shareMediaCategory: 'VIDEO',
              media: [
                {
                  status: 'READY',
                  description: {
                    text: caption,
                  },
                  media: asset,
                  title: {
                    text: caption.substring(0, 100),
                  },
                },
              ],
            },
          },
          visibility: {
            'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
          },
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`LinkedIn video publish failed: ${error}`);
    }

    const data = await response.json() as LinkedInUgcPostResponse;

    return {
      success: true,
      postId: data.id,
      postUrl: `https://linkedin.com/feed/update/${data.id}`,
    };
  }

  async getPostStatus(postId: string): Promise<PostStatus> {
    try {
      const response = await fetch(
        `${this.config.apiBaseUrl}/ugcPosts/${postId}`,
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

      const data = await response.json() as { lifecycleState: string };

      return {
        id: postId,
        status: data.lifecycleState === 'PUBLISHED' ? 'published' : 'pending',
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
      `${this.config.apiBaseUrl}/ugcPosts/${postId}`,
      {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${this.config.accessToken}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to delete LinkedIn post: ${response.statusText}`);
    }
  }

  async validate(content: PublishContent): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!this.supportsContentType(content.type)) {
      errors.push(`Content type ${content.type} not supported by LinkedIn`);
    }

    // Caption length (3000 max for posts)
    const caption = this.formatCaption(content.caption, content.hashtags);
    if (caption.length > 3000) {
      errors.push('Caption exceeds 3000 character limit');
    }

    // Hashtags should be limited
    if (content.hashtags && content.hashtags.length > 10) {
      warnings.push('More than 10 hashtags may reduce engagement');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  async getRateLimit(): Promise<RateLimitInfo> {
    return {
      remaining: 100, // ~100 posts/day
    };
  }

  private isRetryable(error: unknown): boolean {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      return message.includes('rate limit') ||
             message.includes('timeout') ||
             message.includes('5') ||
             message.includes('429');
    }
    return false;
  }
}

export function createLinkedInPublisher(config: GoogleMediaConfig): LinkedInPublisher {
  return new LinkedInPublisher({
    clientId: config.linkedinClientId ?? '',
    clientSecret: config.linkedinClientSecret ?? '',
    accessToken: config.linkedinAccessToken ?? '',
    apiBaseUrl: 'https://api.linkedin.com/v2',
  });
}
