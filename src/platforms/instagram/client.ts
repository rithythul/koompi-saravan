import type { PlatformClient, SocialPost, PostResult, AnalyticsData } from '../index.js';
import type { InstagramConfig } from '../../config.js';
import { apiRequest } from '../fetch-helper.js';

const API_BASE = 'https://graph.facebook.com/v18.0';

interface IGContainerResponse {
  id: string;
}

interface IGPublishResponse {
  id: string;
}

interface IGMediaResponse {
  id: string;
  permalink?: string;
}

interface IGInsight {
  name: string;
  values: Array<{ value: number }>;
}

interface IGInsightsResponse {
  data: IGInsight[];
}

export class InstagramClient implements PlatformClient {
  readonly name = 'instagram';

  constructor(private readonly cfg: InstagramConfig) {}

  async post(content: SocialPost): Promise<PostResult> {
    try {
      // Step 1: Create media container
      const containerId = await this.createContainer(content);

      // Step 2: Wait for container to be ready (for video)
      if (content.videoPath) {
        await this.waitForContainer(containerId);
      }

      // Step 3: Publish
      const publishUrl = `${API_BASE}/${this.cfg.accountId}/media_publish`;
      const published = await apiRequest<IGPublishResponse>('instagram', publishUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          creation_id: containerId,
          access_token: this.cfg.accessToken,
        }),
      });

      // Get permalink
      const mediaUrl = `${API_BASE}/${published.id}?fields=permalink&access_token=${this.cfg.accessToken}`;
      const media = await apiRequest<IGMediaResponse>('instagram', mediaUrl);

      return {
        platform: this.name,
        success: true,
        postId: published.id,
        url: media.permalink,
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
    const url = `${API_BASE}/${postId}/insights?metric=impressions,reach,likes,comments,shares,saved&access_token=${this.cfg.accessToken}`;
    const result = await apiRequest<IGInsightsResponse>('instagram', url);

    const metrics = new Map<string, number>();
    for (const insight of result.data) {
      metrics.set(insight.name, insight.values[0]?.value ?? 0);
    }

    return {
      views: metrics.get('impressions') ?? 0,
      likes: metrics.get('likes') ?? 0,
      shares: metrics.get('shares') ?? 0,
      comments: metrics.get('comments') ?? 0,
      reach: metrics.get('reach') ?? 0,
      saves: metrics.get('saved') ?? 0,
    };
  }

  private async createContainer(content: SocialPost): Promise<string> {
    const url = `${API_BASE}/${this.cfg.accountId}/media`;
    const params: Record<string, string> = {
      caption: content.text,
      access_token: this.cfg.accessToken,
    };

    if (content.videoPath) {
      // Video post (Reel)
      const videoUrl = content.videoPath.startsWith('http') ? content.videoPath : content.imageUrl ?? '';
      params.media_type = 'REELS';
      params.video_url = videoUrl;
    } else if (content.imageUrl) {
      // Image post
      params.image_url = content.imageUrl;
    } else {
      throw new Error('Instagram requires either an image URL or video URL');
    }

    const result = await apiRequest<IGContainerResponse>('instagram', url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    return result.id;
  }

  private async waitForContainer(containerId: string, maxAttempts = 30): Promise<void> {
    const statusUrl = `${API_BASE}/${containerId}?fields=status_code&access_token=${this.cfg.accessToken}`;

    for (let i = 0; i < maxAttempts; i++) {
      const result = await apiRequest<{ status_code: string }>('instagram', statusUrl);

      if (result.status_code === 'FINISHED') return;
      if (result.status_code === 'ERROR') {
        throw new Error(`Instagram container processing failed for ${containerId}`);
      }

      // Wait 5 seconds between checks
      await new Promise(r => setTimeout(r, 5000));
    }

    throw new Error(`Instagram container ${containerId} timed out after ${maxAttempts * 5}s`);
  }
}
