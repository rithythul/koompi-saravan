import type { PlatformClient, SocialPost, PostResult, AnalyticsData } from '../index.js';
import type { FacebookConfig } from '../../config.js';
import { apiRequest } from '../fetch-helper.js';
import { readFileSync } from 'fs';

const API_BASE = 'https://graph.facebook.com/v18.0';

interface FBPostResponse {
  id: string;
  post_id?: string;
}

interface FBInsight {
  name: string;
  values: Array<{ value: number }>;
}

interface FBInsightsResponse {
  data: FBInsight[];
}

interface FBPostDetails {
  id: string;
  shares?: { count: number };
  likes?: { summary: { total_count: number } };
  comments?: { summary: { total_count: number } };
}

export class FacebookClient implements PlatformClient {
  readonly name = 'facebook';

  constructor(private readonly cfg: FacebookConfig) {}

  async post(content: SocialPost): Promise<PostResult> {
    try {
      let result: FBPostResponse;

      if (content.videoPath) {
        result = await this.postVideo(content);
      } else if (content.imageUrl) {
        result = await this.postPhoto(content);
      } else {
        result = await this.postText(content);
      }

      const postId = result.post_id ?? result.id;
      return {
        platform: this.name,
        success: true,
        postId,
        url: `https://www.facebook.com/${postId}`,
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
    // Get post details with counts
    const detailsUrl = `${API_BASE}/${postId}?fields=shares,likes.summary(true),comments.summary(true)&access_token=${this.cfg.accessToken}`;
    const details = await apiRequest<FBPostDetails>('facebook', detailsUrl);

    // Get insights (views, reach, impressions)
    try {
      const insightsUrl = `${API_BASE}/${postId}/insights?metric=post_impressions,post_impressions_unique,post_engaged_users&access_token=${this.cfg.accessToken}`;
      const insights = await apiRequest<FBInsightsResponse>('facebook', insightsUrl);

      const insightMap = new Map<string, number>();
      for (const insight of insights.data) {
        insightMap.set(insight.name, insight.values[0]?.value ?? 0);
      }

      return {
        views: insightMap.get('post_impressions') ?? 0,
        likes: details.likes?.summary?.total_count ?? 0,
        shares: details.shares?.count ?? 0,
        comments: details.comments?.summary?.total_count ?? 0,
        reach: insightMap.get('post_impressions_unique') ?? 0,
        engaged_users: insightMap.get('post_engaged_users') ?? 0,
      };
    } catch {
      // Insights may not be available for all post types
      return {
        views: 0,
        likes: details.likes?.summary?.total_count ?? 0,
        shares: details.shares?.count ?? 0,
        comments: details.comments?.summary?.total_count ?? 0,
      };
    }
  }

  private async postText(content: SocialPost): Promise<FBPostResponse> {
    const url = `${API_BASE}/${this.cfg.pageId}/feed`;
    return apiRequest<FBPostResponse>('facebook', url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: content.text,
        access_token: this.cfg.accessToken,
      }),
    });
  }

  private async postPhoto(content: SocialPost): Promise<FBPostResponse> {
    const url = `${API_BASE}/${this.cfg.pageId}/photos`;
    return apiRequest<FBPostResponse>('facebook', url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: content.imageUrl,
        caption: content.text,
        access_token: this.cfg.accessToken,
      }),
    });
  }

  private async postVideo(content: SocialPost): Promise<FBPostResponse> {
    const url = `${API_BASE}/${this.cfg.pageId}/videos`;
    const formData = new FormData();
    formData.append('description', content.text);
    formData.append('access_token', this.cfg.accessToken);

    if (content.title) {
      formData.append('title', content.title);
    }

    if (content.videoPath) {
      if (content.videoPath.startsWith('http://') || content.videoPath.startsWith('https://')) {
        formData.append('file_url', content.videoPath);
      } else {
        const videoData = readFileSync(content.videoPath);
        formData.append('source', new Blob([videoData], { type: 'video/mp4' }), 'video.mp4');
      }
    }

    return apiRequest<FBPostResponse>('facebook', url, {
      method: 'POST',
      body: formData,
    });
  }
}
