import { type GoogleMediaConfig } from '../config.js';
import fetchWithRetry from '../fetch-with-retry.js';
import { logAudit } from '../store.js';

export interface FacebookAnalyticsInput {
  platformPostId: string;
}

export interface FacebookAnalyticsResponse {
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  reach: number;
  impressions: number;
  metadata?: Record<string, unknown>;
}

export interface FacebookPublishInput {
  caption: string;
  videoUrl: string;
}

export interface FacebookPublishResponse {
  platformPostId: string;
  permalink?: string;
  metadata?: Record<string, unknown>;
}

// Meta Graph API helper
async function callMetaGraphApi(config: GoogleMediaConfig, endpoint: string, method: 'GET' | 'POST', body?: unknown) {
    const baseUrl = config.instagramApiBaseUrl; // Reuse base URL as it's the same for Meta Graph
    const accessToken = config.facebookAccessToken;
    
    if (!accessToken) throw new Error('Facebook access token missing');

    const response = await fetchWithRetry(`${baseUrl}/${endpoint}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify({ ...body, access_token: accessToken }) : undefined,
        // Append token as query param if GET
        ...(method === 'GET' ? { /* append logic */ } : {})
    });
    
    if (!response.ok) {
        throw new Error(`Meta Graph API error: ${response.status} ${await response.text()}`);
    }
    return response.json();
}

export async function publishFacebookVideo(
  config: GoogleMediaConfig,
  input: FacebookPublishInput,
): Promise<FacebookPublishResponse> {
  const result = await callMetaGraphApi(config, 'me/videos', 'POST', {
    file_url: input.videoUrl,
    description: input.caption,
  });

  return {
    platformPostId: result.id,
    metadata: { source: 'facebook-api' },
  };
}

export async function fetchFacebookMediaMetrics(
  config: GoogleMediaConfig,
  input: FacebookAnalyticsInput,
): Promise<FacebookAnalyticsResponse> {
  const result = await callMetaGraphApi(config, `${input.platformPostId}/insights`, 'GET');
  // Logic to parse metrics from Graph API response
  return { views: 0, likes: 0, comments: 0, shares: 0, saves: 0, reach: 0, impressions: 0 };
}
