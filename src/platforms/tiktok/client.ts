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

interface TikTokDraftUploadResult {
  draftId: string;
  uploadUrl: string;
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

  /**
   * Upload a video as a draft to TikTok
   * @param videoPath - Local path or URL to the video
   * @param caption - Video caption (max 150 chars for TikTok)
   * @param hashtags - Optional array of hashtags
   * @param musicUrl - Optional TikTok music track URL
   * @returns Draft ID and upload URL
   */
  async uploadDraft(
    videoPath: string,
    caption: string,
    hashtags: string[] = [],
    musicUrl?: string
  ): Promise<TikTokDraftUploadResult> {
    try {
      // Step 1: Initialize upload
      const videoSize = videoPath.startsWith('http')
        ? 0
        : statSync(videoPath).size;

      const initBody = {
        post_info: {
          title: caption.slice(0, 150),
          privacy_level: 'PUBLIC_TO_EVERYONE',
          disable_duet: false,
          disable_comment: false,
          disable_stitch: false,
        },
        source_info: {
          source: videoPath.startsWith('http') ? 'PULL_FROM_URL' : 'FILE_UPLOAD',
          ...(videoPath.startsWith('http')
            ? { video_url: videoPath }
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
      const uploadUrl = initResult.data.upload_url;

      // Step 2: Upload video (if file, not URL pull)
      if (!videoPath.startsWith('http') && uploadUrl) {
        const videoData = readFileSync(videoPath);
        const uploadResponse = await fetch(uploadUrl, {
          method: 'PUT',
          headers: {
            'Content-Type': 'video/mp4',
            'Content-Range': `bytes 0-${videoData.length - 1}/${videoData.length}`,
          },
          body: videoData,
        });

        if (!uploadResponse.ok) {
          throw new Error(`Video upload failed: ${uploadResponse.statusText}`);
        }
      }

      // Step 3: Set music if provided
      if (musicUrl) {
        await this.setMusic(publishId, musicUrl);
      }

      return {
        draftId: publishId,
        uploadUrl: `https://www.tiktok.com/@/drafts/${publishId}`,
      };
    } catch (error) {
      throw new Error(`TikTok draft upload failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Attach a TikTok music track to a draft
   * @param draftId - The draft publish ID
   * @param musicUrl - TikTok music track URL
   */
  async setMusic(draftId: string, musicUrl: string): Promise<void> {
    try {
      // TikTok's Content Discovery API for music
      const musicBody = {
        music_id: musicUrl,
      };

      await apiRequest(
        'tiktok',
        `${API_BASE}/post/publish/content/init/`,
        {
          method: 'POST',
          headers: this.headers,
          body: JSON.stringify(musicBody),
        },
      );
    } catch (error) {
      throw new Error(`Failed to set music: ${error instanceof Error ? error.message : String(error)}`);
    }
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

      // TikTok doesn't support direct publishing via API
      // Upload as draft and inform user to complete in TikTok app
      const draftResult = await this.uploadDraft(
        content.videoPath,
        content.text,
        [], // Hashtags are included in the caption
      );

      return {
        platform: this.name,
        success: true,
        postId: draftResult.draftId,
        url: draftResult.uploadUrl,
        warnings: [
          'Video uploaded as TikTok draft. Open TikTok app to edit and publish.',
          'Draft ID: ' + draftResult.draftId,
        ],
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
