import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { getPlatformClient } from '../lib/platforms/platform-factory.js';
import { generateImage } from '../lib/gemini-client.js';
import { loadConfig } from '../lib/config.js';

let mockResponses: Map<string, Response[]>;
const originalFetch = global.fetch;

beforeEach(() => {
  mockResponses = new Map();
  // @ts-ignore
  global.fetch = async (input: RequestInfo | URL, init?: RequestInit | undefined) => {
    const url = input.toString();
    console.log(`Fetch request: ${url}`);
    for (const [pattern, responses] of mockResponses.entries()) {
      // Check for exact path matches or prioritize longer patterns
      if (url.endsWith(pattern)) {
        if (responses.length > 0) {
          return responses.shift()!;
        } else {
          return new Response('Mock Queue Exhausted', { status: 404 });
        }
      }
    }
    throw new Error(`Fetch not mocked for URL: ${url}`);
  };
});

afterEach(() => {
  global.fetch = originalFetch;
});

const mockConfig = loadConfig({
  instagramAccessToken: 'mock_instagram_token',
  instagramBusinessAccountId: '12345',
  instagramApiBaseUrl: 'https://graph.facebook.com/v19.0',
  tiktokAccessToken: 'mock_tiktok_token',
  tiktokCreatorId: 'creator123',
  tiktokApiBaseUrl: 'https://open.tiktokapis.com',
  geminiApiKey: 'mock_gemini_key',
  defaultOutputDir: '/tmp/output',
  dryRun: true,
});

describe('Platform Client Integration Tests', () => {
  test('Instagram publish success', async () => {
    mockResponses.set('/media', [
      new Response(JSON.stringify({ id: 'container123' }), { status: 200 }),
    ]);
    mockResponses.set('/media_publish', [
      new Response(JSON.stringify({ id: 'post123', permalink: 'http://insta.com/post123' }), { status: 200 }),
    ]);

    const client = getPlatformClient('instagram', mockConfig);
    const result = await client.publish({
      caption: 'Test Caption',
      videoUrl: 'https://example.com/video.mp4',
    });

    expect(result.platformPostId).toBe('post123');
    expect(result.permalink).toBe('http://insta.com/post123');
  });

  test('Instagram publish 401 Unauthorized', async () => {
    mockResponses.set('/media', [
      new Response('Unauthorized', { status: 401 }),
    ]);

    const client = getPlatformClient('instagram', mockConfig);
    await expect(client.publish({
      caption: 'Test Caption',
      videoUrl: 'https://example.com/video.mp4',
    })).rejects.toThrow(/Unauthorized/);
  });

  test('Instagram publish with retry on transient error', async () => {
    mockResponses.set('/media', [
        new Response('Service Unavailable', { status: 503 }),
        new Response('Service Unavailable', { status: 503 }),
        new Response(JSON.stringify({ id: 'container123' }), { status: 200 }),
    ]);
    mockResponses.set('/media_publish', [
        new Response(JSON.stringify({ id: 'post123', permalink: 'http://insta.com/post123' }), { status: 200 }),
    ]);

    const client = getPlatformClient('instagram', mockConfig);
    const result = await client.publish({
      caption: 'Test Caption',
      videoUrl: 'https://example.com/video.mp4',
    });

    expect(result.platformPostId).toBe('post123');
  });

  test('TikTok publish success', async () => {
    mockResponses.set('/post/publish/video/init/', [
        new Response(JSON.stringify({ data: { publish_id: 'pub123', video_id: 'video123' } }), { status: 200 }),
    ]);

    const client = getPlatformClient('tiktok', mockConfig);
    const result = await client.publish({
      caption: 'Test Caption',
      videoUrl: 'https://example.com/video.mp4',
    });

    expect(result.platformPostId).toBe('video123');
  });

  test('TikTok publish 429 Rate Limited', async () => {
    mockResponses.set('/post/publish/video/init/', [
        new Response('Too Many Requests', { status: 429 }),
    ]);

    const client = getPlatformClient('tiktok', mockConfig);
    await expect(client.publish({
      caption: 'Test Caption',
      videoUrl: 'https://example.com/video.mp4',
    })).rejects.toThrow(/Too Many Requests/);
  });

  test('TikTok publish with retry on transient error', async () => {
    mockResponses.set('/post/publish/video/init/', [
        new Response('Server Error', { status: 500 }),
        new Response('Server Error', { status: 500 }),
        new Response(JSON.stringify({ data: { publish_id: 'pub123', video_id: 'video123' } }), { status: 200 }),
    ]);

    const client = getPlatformClient('tiktok', mockConfig);
    const result = await client.publish({
      caption: 'Test Caption',
      videoUrl: 'https://example.com/video.mp4',
    });

    expect(result.platformPostId).toBe('video123');
  });
});
