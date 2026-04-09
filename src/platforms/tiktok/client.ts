import type { PlatformClient, SocialPost, PostResult, AnalyticsData } from '../index.js';
import type { TikTokConfig } from '../../config.js';
import { apiRequest } from '../fetch-helper.js';
import { readFileSync, statSync } from 'fs';

const API_BASE = 'https://open.tiktokapis.com/v2';

interface TikTokInitResponse {
  data: {
    publish_id: string;
    upload_url: string;
  };
  error: {
    code: string;
    message: string;
  };
}

interface TikTokStatusResponse {
  data: {
    status: string;
    publicaly_available_post_id?: string[];
  };
  error: {
    code: string;
    message: string;
  };
}

interface TikTokVideoQueryResponse {
  data: {
    videos: Array<{
      id: string;
      title: string;
      view_count: number;
      like_count: number;
      comment_count: number;
      share_count: number;
    }>;
  };
  error: {
    code: string;
    message: string;
  };
}

export class TikTokClient implements PlatformClient {
  readonly name = 'tiktok';
  private readonly headers: Record<string, string>;

  constructor(private readonly cfg: TikTokConfig) {
    this.headers = {
      Authorization: `Bearer ${cfg.accessToken}`,
      'Content-Type': 'application/json',
    };
  }

  async post(content: SocialPost): Promise<PostResult> {
    try {
      if (!content.videoPath) {
        return {
          platform: this.name,
          success: false,
          error: 'TikTok only supports video posts',
        };
      }

      // Step 1: Initialize upload
      const videoSize = content.videoPath.startsWith('http')
        ? 0
        : statSync(content.videoPath).size;

      const initBody = {
        post_info: {
          title: content.text.slice(0, 150),
          privacy_level: 'PUBLIC_TO_EVERYONE',
          disable_duet: false,
          disable_comment: false,
          disable_stitch: false,
        },
        source_info: {
          source: content.videoPath.startsWith('http') ? 'PULL_FROM_URL' : 'FILE_UPLOAD',
          ...(content.videoPath.startsWith('http')
            ? { video_url: content.videoPath }
            : {
                video_size: videoSize,
                chunk_size: videoSize,
                total_chunk_count: 1,
              }),
        },
      };

      const initResult = await apiRequest<TikTokInitResponse>(
        'tiktok',
        `${API_BASE}/post/publish/video/init/`,
        {
          method: 'POST',
          headers: this.headers,
          body: JSON.stringify(initBody),
        },
      );

      if (initResult.error?.code && initResult.error.code !== 'ok') {
        throw new Error(`TikTok init failed: ${initResult.error.message}`);
      }

      const publishId = initResult.data.publish_id;

      // Step 2: Upload video (if file, not URL pull)
      if (!content.videoPath.startsWith('http') && initResult.data.upload_url) {
        const videoData = readFileSync(content.videoPath);
        await fetch(initResult.data.upload_url, {
          method: 'PUT',
          headers: {
            'Content-Type': 'video/mp4',
            'Content-Range': `bytes 0-${videoData.length - 1}/${videoData.length}`,
          },
          body: videoData,
        });
      }

      // Step 3: Poll for publish status
      const postId = await this.waitForPublish(publishId);

      return {
        platform: this.name,
        success: true,
        postId: postId ?? publishId,
        url: postId ? `https://www.tiktok.com/@/video/${postId}` : undefined,
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
    const result = await apiRequest<TikTokVideoQueryResponse>(
      'tiktok',
      `${API_BASE}/video/query/`,
      {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({
          filters: {
            video_ids: [postId],
          },
          fields: ['id', 'title', 'view_count', 'like_count', 'comment_count', 'share_count'],
        }),
      },
    );

    const video = result.data?.videos?.[0];
    return {
      views: video?.view_count ?? 0,
      likes: video?.like_count ?? 0,
      shares: video?.share_count ?? 0,
      comments: video?.comment_count ?? 0,
    };
  }

  private async waitForPublish(publishId: string, maxAttempts = 20): Promise<string | undefined> {
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(r => setTimeout(r, 3000));

      const result = await apiRequest<TikTokStatusResponse>(
        'tiktok',
        `${API_BASE}/post/publish/status/fetch/`,
        {
          method: 'POST',
          headers: this.headers,
          body: JSON.stringify({ publish_id: publishId }),
        },
      );

      const status = result.data?.status;
      if (status === 'PUBLISH_COMPLETE') {
        return result.data.publicaly_available_post_id?.[0];
      }
      if (status === 'FAILED') {
        throw new Error(`TikTok publish failed: ${result.error?.message ?? 'unknown'}`);
      }
    }

    throw new Error(`TikTok publish timed out for ${publishId}`);
  }
}
