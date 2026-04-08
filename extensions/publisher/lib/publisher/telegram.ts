/**
 * Telegram Publisher
 *
 * Publishes to Telegram via Bot API.
 * Supports: Video, Image, Document.
 */

import type { GoogleMediaConfig } from '../config.js';
import { BasePublisher, type PublishContent, type PublishResult, type PostStatus, type ValidationResult, type RateLimitInfo, type ContentType } from './base.js';
import { fetchWithRetry } from '../utils/retry.js';

interface TelegramConfig {
  botToken: string;
  channelId: string;
  apiBaseUrl: string;
}

interface TelegramMessageResponse {
  ok: boolean;
  result: {
    message_id: number;
    chat: {
      id: number;
    };
  };
  description?: string;
}

export class TelegramPublisher extends BasePublisher {
  readonly platform = 'telegram' as const;
  readonly supportsScheduling = false;
  readonly supportedContentTypes: ContentType[] = ['video', 'image'];

  private config: TelegramConfig;

  constructor(config: TelegramConfig) {
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

      const caption = this.formatCaption(content.caption, content.hashtags);

      if (content.type === 'video') {
        return await this.sendVideo(content.mediaUrl, caption);
      } else {
        return await this.sendPhoto(content.mediaUrl, caption);
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

  private async sendVideo(mediaUrl: string, caption: string): Promise<PublishResult> {
    const formData = new FormData();
    formData.append('chat_id', this.config.channelId);
    formData.append('video', new URL(mediaUrl).toString());
    formData.append('caption', caption);

    const response = await fetchWithRetry(
      `${this.config.apiBaseUrl}/bot${this.config.botToken}/sendVideo`,
      {
        method: 'POST',
        body: formData,
      }
    );

    const data = await response.json() as TelegramMessageResponse;

    if (!data.ok) {
      throw new Error(`Telegram video send failed: ${data.description || 'Unknown error'}`);
    }

    const chatId = data.result.chat.id;
    const messageId = data.result.message_id;

    return {
      success: true,
      postId: String(messageId),
      postUrl: `https://t.me/${chatId.toString().replace('-100', '')}/${messageId}`,
    };
  }

  private async sendPhoto(mediaUrl: string, caption: string): Promise<PublishResult> {
    const formData = new FormData();
    formData.append('chat_id', this.config.channelId);
    formData.append('photo', new URL(mediaUrl).toString());
    formData.append('caption', caption);

    const response = await fetchWithRetry(
      `${this.config.apiBaseUrl}/bot${this.config.botToken}/sendPhoto`,
      {
        method: 'POST',
        body: formData,
      }
    );

    const data = await response.json() as TelegramMessageResponse;

    if (!data.ok) {
      throw new Error(`Telegram photo send failed: ${data.description || 'Unknown error'}`);
    }

    const chatId = data.result.chat.id;
    const messageId = data.result.message_id;

    return {
      success: true,
      postId: String(messageId),
      postUrl: `https://t.me/${chatId.toString().replace('-100', '')}/${messageId}`,
    };
  }

  async getPostStatus(postId: string): Promise<PostStatus> {
    // Telegram messages are delivered immediately
    return {
      id: postId,
      status: 'published',
    };
  }

  async deletePost(postId: string): Promise<void> {
    const response = await fetch(
      `${this.config.apiBaseUrl}/bot${this.config.botToken}/deleteMessage`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: this.config.channelId,
          message_id: postId,
        }),
      }
    );

    const data = await response.json() as TelegramMessageResponse;

    if (!data.ok) {
      throw new Error(`Failed to delete Telegram message: ${data.description || 'Unknown error'}`);
    }
  }

  async validate(content: PublishContent): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!this.supportsContentType(content.type)) {
      errors.push(`Content type ${content.type} not supported by Telegram`);
    }

    // Caption length (1024 max)
    const caption = this.formatCaption(content.caption, content.hashtags);
    if (caption.length > 1024) {
      errors.push('Caption exceeds 1024 character limit');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  async getRateLimit(): Promise<RateLimitInfo> {
    // Telegram Bot API: ~20 messages/minute to groups
    return {
      remaining: 20,
    };
  }

  private isRetryable(error: unknown): boolean {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      return message.includes('rate limit') ||
             message.includes('timeout') ||
             message.includes('5') ||
             message.includes('too many requests');
    }
    return false;
  }
}

export function createTelegramPublisher(config: GoogleMediaConfig): TelegramPublisher {
  return new TelegramPublisher({
    botToken: config.telegramBotToken ?? '',
    channelId: config.telegramChannelId ?? '',
    apiBaseUrl: 'https://api.telegram.org',
  });
}
