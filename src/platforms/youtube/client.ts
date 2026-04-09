import type { PlatformClient, SocialPost, PostResult, AnalyticsData } from '../index.js';
import type { YouTubeConfig } from '../../config.js';
import { apiRequest } from '../fetch-helper.js';
import { readFileSync } from 'fs';

const API_BASE = 'https://www.googleapis.com';

interface YTUploadResponse {
  id: string;
  snippet: {
    title: string;
    channelId: string;
  };
  status: {
    uploadStatus: string;
    privacyStatus: string;
  };
}

interface YTVideoStatistics {
  viewCount: string;
  likeCount: string;
  commentCount: string;
  favoriteCount: string;
}

interface YTVideoResponse {
  items: Array<{
    id: string;
    statistics: YTVideoStatistics;
  }>;
}

export class YouTubeClient implements PlatformClient {
  readonly name = 'youtube';
  private readonly headers: Record<string, string>;

  constructor(private readonly cfg: YouTubeConfig) {
    this.headers = {
      Authorization: `Bearer ${cfg.accessToken}`,
    };
  }

  async post(content: SocialPost): Promise<PostResult> {
    try {
      if (!content.videoPath) {
        return {
          platform: this.name,
          success: false,
          error: 'YouTube requires a video file',
        };
      }

      const title = content.title ?? content.text.slice(0, 100);
      const description = content.text;

      // Step 1: Init resumable upload
      const initUrl = `${API_BASE}/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status`;
      const metadata = {
        snippet: {
          title,
          description,
          categoryId: '22', // People & Blogs
          channelId: this.cfg.channelId,
        },
        status: {
          privacyStatus: 'public',
          selfDeclaredMadeForKids: false,
        },
      };

      const initResponse = await fetch(initUrl, {
        method: 'POST',
        headers: {
          ...this.headers,
          'Content-Type': 'application/json',
          'X-Upload-Content-Type': 'video/mp4',
        },
        body: JSON.stringify(metadata),
      });

      if (!initResponse.ok) {
        const errText = await initResponse.text();
        throw new Error(`YouTube upload init failed: ${initResponse.status} ${errText}`);
      }

      const uploadUrl = initResponse.headers.get('Location');
      if (!uploadUrl) {
        throw new Error('YouTube did not return upload URL');
      }

      // Step 2: Upload video
      let videoBody: BodyInit;
      if (content.videoPath.startsWith('http://') || content.videoPath.startsWith('https://')) {
        const resp = await fetch(content.videoPath);
        videoBody = await resp.arrayBuffer();
      } else {
        videoBody = readFileSync(content.videoPath);
      }

      const uploadResponse = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          ...this.headers,
          'Content-Type': 'video/mp4',
        },
        body: videoBody,
      });

      if (!uploadResponse.ok) {
        const errText = await uploadResponse.text();
        throw new Error(`YouTube upload failed: ${uploadResponse.status} ${errText}`);
      }

      const result = (await uploadResponse.json()) as YTUploadResponse;

      return {
        platform: this.name,
        success: true,
        postId: result.id,
        url: `https://www.youtube.com/watch?v=${result.id}`,
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
    const url = `${API_BASE}/youtube/v3/videos?part=statistics&id=${postId}`;
    const result = await apiRequest<YTVideoResponse>('youtube', url, {
      headers: this.headers,
    });

    const stats = result.items?.[0]?.statistics;
    return {
      views: parseInt(stats?.viewCount ?? '0', 10),
      likes: parseInt(stats?.likeCount ?? '0', 10),
      shares: 0, // YouTube API doesn't expose share count
      comments: parseInt(stats?.commentCount ?? '0', 10),
      favorites: parseInt(stats?.favoriteCount ?? '0', 10),
    };
  }
}
