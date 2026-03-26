import type { PlatformClient, SocialPost, PostResult, AnalyticsData } from '../index.js';
import type { XConfig } from '../../config.js';
import { apiRequest, PlatformApiError } from '../fetch-helper.js';
import { readFileSync } from 'fs';
import { createHmac, randomBytes } from 'crypto';

const API_BASE = 'https://api.twitter.com/2';
const UPLOAD_BASE = 'https://upload.twitter.com/1.1';
const TWEET_MAX_LENGTH = 280;

interface TweetResponse {
  data: { id: string; text: string };
}

interface TweetMetrics {
  data: {
    public_metrics: {
      retweet_count: number;
      reply_count: number;
      like_count: number;
      quote_count: number;
      impression_count: number;
    };
  };
}

interface MediaUploadResponse {
  media_id_string: string;
  processing_info?: { state: string; check_after_secs: number };
}

export class XClient implements PlatformClient {
  readonly name = 'x';

  constructor(private readonly cfg: XConfig) {}

  async post(content: SocialPost): Promise<PostResult> {
    try {
      const text = this.truncateText(content.text);
      let mediaIds: string[] | undefined;

      if (content.imageUrl || content.videoPath) {
        const mediaPath = content.videoPath ?? content.imageUrl;
        if (mediaPath) {
          const mediaId = await this.uploadMedia(mediaPath);
          mediaIds = [mediaId];
        }
      }

      const body: Record<string, unknown> = { text };
      if (mediaIds) {
        body.media = { media_ids: mediaIds };
      }

      const result = await apiRequest<TweetResponse>('x', `${API_BASE}/tweets`, {
        method: 'POST',
        headers: {
          ...this.oauthHeaders('POST', `${API_BASE}/tweets`),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      return {
        platform: this.name,
        success: true,
        postId: result.data.id,
        url: `https://x.com/i/status/${result.data.id}`,
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
    const url = `${API_BASE}/tweets/${postId}?tweet.fields=public_metrics`;
    const result = await apiRequest<TweetMetrics>('x', url, {
      headers: this.oauthHeaders('GET', url.split('?')[0]),
    });

    const m = result.data.public_metrics;
    return {
      views: m.impression_count ?? 0,
      likes: m.like_count,
      shares: m.retweet_count + m.quote_count,
      comments: m.reply_count,
      retweets: m.retweet_count,
      quotes: m.quote_count,
    };
  }

  private truncateText(text: string): string {
    if (text.length <= TWEET_MAX_LENGTH) return text;
    return text.slice(0, TWEET_MAX_LENGTH - 1) + '\u2026';
  }

  private async uploadMedia(mediaPath: string): Promise<string> {
    const isUrl = mediaPath.startsWith('http://') || mediaPath.startsWith('https://');

    let mediaData: Buffer;
    let mediaType: string;

    if (isUrl) {
      const response = await fetch(mediaPath);
      if (!response.ok) throw new Error(`Failed to fetch media: ${response.status}`);
      mediaData = Buffer.from(await response.arrayBuffer());
      mediaType = response.headers.get('content-type') ?? 'application/octet-stream';
    } else {
      mediaData = readFileSync(mediaPath) as Buffer;
      mediaType = mediaPath.endsWith('.mp4') ? 'video/mp4'
        : mediaPath.endsWith('.gif') ? 'image/gif'
        : mediaPath.endsWith('.png') ? 'image/png'
        : 'image/jpeg';
    }

    const isVideo = mediaType.startsWith('video/');
    const totalBytes = mediaData.length;

    // INIT
    const initUrl = `${UPLOAD_BASE}/media/upload.json`;
    const initParams = new URLSearchParams({
      command: 'INIT',
      total_bytes: String(totalBytes),
      media_type: mediaType,
      ...(isVideo ? { media_category: 'tweet_video' } : {}),
    });

    const initResult = await apiRequest<MediaUploadResponse>(
      'x',
      `${initUrl}?${initParams.toString()}`,
      {
        method: 'POST',
        headers: this.oauthHeaders('POST', initUrl),
      },
    );

    const mediaId = initResult.media_id_string;

    // APPEND — send in 5MB chunks
    const chunkSize = 5 * 1024 * 1024;
    for (let segment = 0; segment * chunkSize < totalBytes; segment++) {
      const chunk = mediaData.subarray(segment * chunkSize, (segment + 1) * chunkSize);
      const formData = new FormData();
      formData.append('command', 'APPEND');
      formData.append('media_id', mediaId);
      formData.append('segment_index', String(segment));
      formData.append('media_data', new Blob([new Uint8Array(chunk)]));

      await fetch(`${initUrl}`, {
        method: 'POST',
        headers: this.oauthHeaders('POST', initUrl),
        body: formData,
      });
    }

    // FINALIZE
    const finalizeParams = new URLSearchParams({
      command: 'FINALIZE',
      media_id: mediaId,
    });

    const finalizeResult = await apiRequest<MediaUploadResponse>(
      'x',
      `${initUrl}?${finalizeParams.toString()}`,
      {
        method: 'POST',
        headers: this.oauthHeaders('POST', initUrl),
      },
    );

    // Poll processing status for video
    if (finalizeResult.processing_info) {
      await this.waitForProcessing(mediaId, initUrl);
    }

    return mediaId;
  }

  private async waitForProcessing(mediaId: string, uploadUrl: string): Promise<void> {
    for (let attempt = 0; attempt < 30; attempt++) {
      const statusUrl = `${uploadUrl}?command=STATUS&media_id=${mediaId}`;
      const status = await apiRequest<MediaUploadResponse>('x', statusUrl, {
        headers: this.oauthHeaders('GET', uploadUrl),
      });

      if (!status.processing_info) return;
      if (status.processing_info.state === 'succeeded') return;
      if (status.processing_info.state === 'failed') {
        throw new Error('Media processing failed');
      }

      const waitSecs = status.processing_info.check_after_secs ?? 5;
      await new Promise(r => setTimeout(r, waitSecs * 1000));
    }

    throw new Error('Media processing timed out');
  }

  private oauthHeaders(method: string, baseUrl: string): Record<string, string> {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonce = randomBytes(16).toString('hex');

    const oauthParams: Record<string, string> = {
      oauth_consumer_key: this.cfg.apiKey,
      oauth_nonce: nonce,
      oauth_signature_method: 'HMAC-SHA1',
      oauth_timestamp: timestamp,
      oauth_token: this.cfg.accessToken,
      oauth_version: '1.0',
    };

    // Create signature base string
    const sortedParams = Object.entries(oauthParams)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');

    const signatureBase = `${method.toUpperCase()}&${encodeURIComponent(baseUrl)}&${encodeURIComponent(sortedParams)}`;
    const signingKey = `${encodeURIComponent(this.cfg.apiSecret)}&${encodeURIComponent(this.cfg.accessTokenSecret)}`;

    const signature = createHmac('sha1', signingKey)
      .update(signatureBase)
      .digest('base64');

    oauthParams.oauth_signature = signature;

    const authHeader = 'OAuth ' + Object.entries(oauthParams)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${encodeURIComponent(k)}="${encodeURIComponent(v)}"`)
      .join(', ');

    return { Authorization: authHeader };
  }
}
