/**
 * Base Publisher Interface
 *
 * All platform publishers implement this interface for consistent behavior.
 */

export type ContentType = 'video' | 'image' | 'carousel';

export type Platform = 'instagram' | 'tiktok' | 'youtube' | 'facebook' | 'pinterest' | 'linkedin' | 'telegram' | 'x';

export interface PublishContent {
  type: ContentType;
  mediaUrl: string;
  caption: string;
  hashtags?: string[];
  scheduleAt?: Date;
  platformOptions?: Record<string, unknown>;
}

export interface PublishResult {
  success: boolean;
  postId?: string;
  postUrl?: string;
  error?: string;
  retryable?: boolean;
  scheduledAt?: Date;
}

export interface PostStatus {
  id: string;
  status: 'pending' | 'publishing' | 'published' | 'failed' | 'scheduled';
  publishedAt?: Date;
  error?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface RateLimitInfo {
  remaining: number;
  resetAt?: Date;
}

export abstract class BasePublisher {
  abstract readonly platform: Platform;
  abstract readonly supportsScheduling: boolean;
  abstract readonly supportedContentTypes: ContentType[];

  /**
   * Publish content to the platform
   */
  abstract publish(content: PublishContent): Promise<PublishResult>;

  /**
   * Get status of a previously published post
   */
  abstract getPostStatus(postId: string): Promise<PostStatus>;

  /**
   * Delete a post
   */
  abstract deletePost(postId: string): Promise<void>;

  /**
   * Validate content before publishing
   */
  abstract validate(content: PublishContent): Promise<ValidationResult>;

  /**
   * Get current rate limit status
   */
  abstract getRateLimit(): Promise<RateLimitInfo>;

  /**
   * Check if content type is supported
   */
  supportsContentType(type: ContentType): boolean {
    return this.supportedContentTypes.includes(type);
  }

  /**
   * Format caption with hashtags
   */
  protected formatCaption(caption: string, hashtags?: string[]): string {
    if (!hashtags || hashtags.length === 0) {
      return caption;
    }
    const hashtagStr = hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`)).join(' ');
    return `${caption}\n\n${hashtagStr}`;
  }

  /**
   * Extract media ID from URL (for platforms that need uploaded media)
   */
  protected extractMediaId(url: string): string {
    // This is a placeholder - actual implementation depends on media storage
    return url.split('/').pop() ?? url;
  }
}
