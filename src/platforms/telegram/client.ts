import type { PlatformClient, SocialPost, PostResult, AnalyticsData } from '../index.js';
import type { TelegramConfig } from '../../config.js';
import { apiRequest } from '../fetch-helper.js';

const API_BASE = 'https://api.telegram.org';

interface TelegramMessage {
  message_id: number;
  chat: { id: number; title?: string; username?: string };
}

interface TelegramResponse<T> {
  ok: boolean;
  result: T;
  description?: string;
}

export class TelegramClient implements PlatformClient {
  readonly name = 'telegram';

  constructor(private readonly cfg: TelegramConfig) {}

  async post(content: SocialPost): Promise<PostResult> {
    try {
      let result: TelegramResponse<TelegramMessage>;

      if (content.videoPath) {
        result = await this.sendVideo(content);
      } else if (content.imageUrl) {
        result = await this.sendPhoto(content);
      } else {
        result = await this.sendMessage(content);
      }

      if (!result.ok) {
        return {
          platform: this.name,
          success: false,
          error: result.description ?? 'Unknown Telegram API error',
        };
      }

      const messageId = result.result.message_id;
      const channelUsername = this.cfg.channelId.startsWith('@')
        ? this.cfg.channelId.slice(1)
        : null;

      return {
        platform: this.name,
        success: true,
        postId: String(messageId),
        url: channelUsername
          ? `https://t.me/${channelUsername}/${messageId}`
          : undefined,
      };
    } catch (error) {
      return {
        platform: this.name,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async getAnalytics(_postId: string): Promise<AnalyticsData> {
    // Telegram doesn't provide per-message analytics via Bot API
    // Return zeroes — future improvement could use Telegram Statistics API for large channels
    return {
      views: 0,
      likes: 0,
      shares: 0,
      comments: 0,
    };
  }

  private botUrl(method: string): string {
    return `${API_BASE}/bot${this.cfg.botToken}/${method}`;
  }

  private async sendMessage(content: SocialPost): Promise<TelegramResponse<TelegramMessage>> {
    return apiRequest<TelegramResponse<TelegramMessage>>(
      'telegram',
      this.botUrl('sendMessage'),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: this.cfg.channelId,
          text: content.text,
          parse_mode: 'Markdown',
        }),
      },
    );
  }

  private async sendPhoto(content: SocialPost): Promise<TelegramResponse<TelegramMessage>> {
    return apiRequest<TelegramResponse<TelegramMessage>>(
      'telegram',
      this.botUrl('sendPhoto'),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: this.cfg.channelId,
          photo: content.imageUrl,
          caption: content.text,
          parse_mode: 'Markdown',
        }),
      },
    );
  }

  private async sendVideo(content: SocialPost): Promise<TelegramResponse<TelegramMessage>> {
    return apiRequest<TelegramResponse<TelegramMessage>>(
      'telegram',
      this.botUrl('sendVideo'),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: this.cfg.channelId,
          video: content.videoPath,
          caption: content.text,
          parse_mode: 'Markdown',
        }),
      },
    );
  }
}
