import type { PlatformClient, SocialPost, PostResult, AnalyticsData } from '../index.js';
import type { LinkedInConfig } from '../../config.js';
import { apiRequest } from '../fetch-helper.js';
import { readFileSync } from 'fs';

const API_BASE = 'https://api.linkedin.com/v2';

interface UgcPostResponse {
  id: string;
}

interface RegisterUploadResponse {
  value: {
    uploadMechanism: {
      'com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest': {
        uploadUrl: string;
      };
    };
    asset: string;
  };
}

interface ShareStatistic {
  totalShareStatistics: {
    shareCount: number;
    clickCount: number;
    likeCount: number;
    commentCount: number;
    impressionCount: number;
    engagement: number;
  };
}

interface ShareStatisticsResponse {
  elements: ShareStatistic[];
}

export class LinkedInClient implements PlatformClient {
  readonly name = 'linkedin';
  private readonly headers: Record<string, string>;

  constructor(private readonly cfg: LinkedInConfig) {
    this.headers = {
      Authorization: `Bearer ${cfg.accessToken}`,
      'Content-Type': 'application/json',
      'X-Restli-Protocol-Version': '2.0.0',
    };
  }

  async post(content: SocialPost): Promise<PostResult> {
    try {
      let mediaAsset: string | undefined;

      if (content.imageUrl) {
        mediaAsset = await this.uploadImage(content.imageUrl);
      }

      const body = this.buildPostBody(content.text, mediaAsset);
      const result = await apiRequest<UgcPostResponse>('linkedin', `${API_BASE}/ugcPosts`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(body),
      });

      const postId = result.id;
      return {
        platform: this.name,
        success: true,
        postId,
        url: `https://www.linkedin.com/feed/update/${postId}`,
      };
    } catch (error) {
      return {
        platform: this.name,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async getAnalytics(postId: string): Promise<AnalyticsData> {
    const url = `${API_BASE}/organizationalEntityShareStatistics?q=organizationalEntity&organizationalEntity=urn:li:organization:${this.cfg.orgId}&shares[0]=${postId}`;
    const result = await apiRequest<ShareStatisticsResponse>('linkedin', url, {
      method: 'GET',
      headers: this.headers,
    });

    const stats = result.elements[0]?.totalShareStatistics;
    return {
      views: stats?.impressionCount ?? 0,
      likes: stats?.likeCount ?? 0,
      shares: stats?.shareCount ?? 0,
      comments: stats?.commentCount ?? 0,
      clicks: stats?.clickCount ?? 0,
    };
  }

  private async uploadImage(imageSource: string): Promise<string> {
    // Step 1: Register upload
    const registerBody = {
      registerUploadRequest: {
        recipes: ['urn:li:digitalmediaRecipe:feedshare-image'],
        owner: `urn:li:organization:${this.cfg.orgId}`,
        serviceRelationships: [
          {
            relationshipType: 'OWNER',
            identifier: 'urn:li:userGeneratedContent',
          },
        ],
      },
    };

    const registration = await apiRequest<RegisterUploadResponse>(
      'linkedin',
      `${API_BASE}/assets?action=registerUpload`,
      {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(registerBody),
      },
    );

    const uploadUrl =
      registration.value.uploadMechanism[
        'com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'
      ].uploadUrl;
    const asset = registration.value.asset;

    // Step 2: Upload image binary
    let imageData: ArrayBuffer;
    if (imageSource.startsWith('http://') || imageSource.startsWith('https://')) {
      const resp = await fetch(imageSource);
      imageData = await resp.arrayBuffer();
    } else {
      imageData = readFileSync(imageSource).buffer as ArrayBuffer;
    }

    await apiRequest('linkedin', uploadUrl, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${this.cfg.accessToken}`,
        'Content-Type': 'application/octet-stream',
      },
      body: imageData,
    });

    return asset;
  }

  private buildPostBody(text: string, mediaAsset?: string): Record<string, unknown> {
    const mediaContent = mediaAsset
      ? {
          shareMediaCategory: 'IMAGE',
          media: [
            {
              status: 'READY',
              media: mediaAsset,
            },
          ],
        }
      : { shareMediaCategory: 'NONE' };

    return {
      author: `urn:li:organization:${this.cfg.orgId}`,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: { text },
          ...mediaContent,
        },
      },
      visibility: {
        'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
      },
    };
  }
}
