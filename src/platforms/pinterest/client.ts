import type { PlatformClient, SocialPost, PostResult, AnalyticsData } from '../index.js';
import type { PinterestConfig } from '../../config.js';
import { apiRequest } from '../fetch-helper.js';

const API_BASE = 'https://api.pinterest.com/v5';

interface PinResponse {
  id: string;
  link?: string;
}

interface PinAnalyticsResponse {
  id: string;
  pin_metrics: {
    all_time: {
      impression: number;
      save: number;
      pin_click: number;
      outbound_click: number;
    };
  };
}

interface BoardListResponse {
  items: Array<{
    id: string;
    name: string;
    description: string;
  }>;
  bookmark?: string;
}

export class PinterestClient implements PlatformClient {
  readonly name = 'pinterest';
  private readonly headers: Record<string, string>;

  constructor(private readonly cfg: PinterestConfig) {
    this.headers = {
      Authorization: `Bearer ${cfg.accessToken}`,
      'Content-Type': 'application/json',
    };
  }

  async post(content: SocialPost): Promise<PostResult> {
    try {
      if (!content.imageUrl) {
        return {
          platform: this.name,
          success: false,
          error: 'Pinterest requires an image URL',
        };
      }

      const pinData: Record<string, unknown> = {
        board_id: this.cfg.boardId,
        title: content.title ?? content.text.slice(0, 100),
        description: content.text,
        media_source: {
          source_type: 'image_url',
          url: content.imageUrl,
        },
      };

      const result = await apiRequest<PinResponse>('pinterest', `${API_BASE}/pins`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(pinData),
      });

      return {
        platform: this.name,
        success: true,
        postId: result.id,
        url: `https://www.pinterest.com/pin/${result.id}/`,
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
    const url = `${API_BASE}/pins/${postId}?pin_metrics=true`;
    const result = await apiRequest<PinAnalyticsResponse>('pinterest', url, {
      headers: this.headers,
    });

    const metrics = result.pin_metrics?.all_time;
    return {
      views: metrics?.impression ?? 0,
      likes: 0, // Pinterest uses saves, not likes
      shares: metrics?.save ?? 0,
      comments: 0,
      clicks: metrics?.pin_click ?? 0,
      outbound_clicks: metrics?.outbound_click ?? 0,
    };
  }

  async listBoards(): Promise<Array<{ id: string; name: string; description: string }>> {
    const result = await apiRequest<BoardListResponse>('pinterest', `${API_BASE}/boards`, {
      headers: this.headers,
    });
    return result.items;
  }
}
