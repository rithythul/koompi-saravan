import { afterEach, describe, expect, test } from 'bun:test';

import { loadConfig } from '../lib/config.js';
import { fetchInstagramMediaMetrics } from '../lib/platforms/instagram-client.js';
import { fetchTikTokVideoMetrics } from '../lib/platforms/tiktok-client.js';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('platform analytics clients', () => {
  test('fetchInstagramMediaMetrics normalizes Graph API insights', async () => {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          data: [
            { name: 'plays', values: [{ value: 2100 }] },
            { name: 'likes', values: [{ value: 133 }] },
            { name: 'comments', values: [{ value: 12 }] },
            { name: 'shares', values: [{ value: 21 }] },
            { name: 'saved', values: [{ value: 19 }] },
            { name: 'reach', values: [{ value: 2500 }] },
            { name: 'impressions', values: [{ value: 2800 }] },
            { name: 'ig_reels_avg_watch_time', values: [{ value: 11.4 }] },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )) as unknown as typeof fetch;

    const metrics = await fetchInstagramMediaMetrics(
      loadConfig({
        instagramAccessToken: 'token',
        instagramBusinessAccountId: 'account',
      }),
      { platformPostId: '1789' },
    );

    expect(metrics.views).toBe(2100);
    expect(metrics.likes).toBe(133);
    expect(metrics.shares).toBe(21);
    expect(metrics.avgWatchTimeSeconds).toBe(11.4);
    expect(metrics.metadata?.source).toBe('instagram-api');
  });

  test('fetchTikTokVideoMetrics normalizes video query payloads', async () => {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          data: {
            videos: [
              {
                id: 'video-1',
                view_count: 5400,
                like_count: 320,
                comment_count: 28,
                share_count: 40,
                save_count: 26,
                completion_rate: 0.64,
                average_watch_duration: 13.8,
                reach: 5700,
                impression_count: 6200,
              },
            ],
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )) as unknown as typeof fetch;

    const metrics = await fetchTikTokVideoMetrics(
      loadConfig({
        tiktokAccessToken: 'token',
        tiktokCreatorId: 'creator-1',
      }),
      { platformPostId: 'video-1' },
    );

    expect(metrics.views).toBe(5400);
    expect(metrics.likes).toBe(320);
    expect(metrics.completionRate).toBe(0.64);
    expect(metrics.avgWatchTimeSeconds).toBe(13.8);
    expect(metrics.metadata?.source).toBe('tiktok-api');
  });
});
