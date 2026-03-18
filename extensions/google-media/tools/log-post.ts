import { randomUUID } from 'crypto';

import { Type } from '@sinclair/typebox';

import { loadConfig, type GoogleMediaConfigInput } from '../lib/config.js';
import { initStore, savePost } from '../lib/store.js';
import type { ContentVariant, Platform, ScheduleStrategy } from '../lib/types.js';

export function createLogPostTool(configOverrides: GoogleMediaConfigInput = {}) {
  return {
    name: 'log_post',
    description:
      'Record a published post in the analytics database so later metrics and schedule analysis have a complete audit trail.',
    parameters: Type.Object({
      platform: Type.Union([
        Type.Literal('tiktok'),
        Type.Literal('instagram'),
      ], { description: 'Platform where the post was published.' }),
      platformPostId: Type.Optional(
        Type.String({
          description: 'Platform-native post ID returned by the publishing API.',
        }),
      ),
      postedAt: Type.String({
        description: 'ISO timestamp when the post went live.',
      }),
      contentType: Type.String({
        description: 'Template or content variant used for the post.',
      }),
      videoPath: Type.String({
        description: 'Local path to the rendered video used for the post.',
      }),
      hookText: Type.Optional(Type.String()),
      caption: Type.Optional(Type.String()),
      hashtags: Type.Optional(Type.Array(Type.String())),
      scheduledBy: Type.Union([
        Type.Literal('optimized'),
        Type.Literal('exploration'),
        Type.Literal('manual'),
      ], { description: 'How this post timing was chosen.' }),
      confidenceScore: Type.Optional(
        Type.Number({
          minimum: 0,
          maximum: 1,
          description: 'Scheduler confidence from 0.0 to 1.0.',
        }),
      ),
      scheduledHour: Type.Optional(
        Type.Number({
          minimum: 0,
          maximum: 23,
          description: 'Optional explicit scheduled hour. Defaults to the UTC hour of postedAt.',
        }),
      ),
      runId: Type.Optional(Type.String()),
    }),
    async execute(
      _id: string,
      params: {
        platform: Platform;
        platformPostId?: string;
        postedAt: string;
        contentType: ContentVariant;
        videoPath: string;
        hookText?: string;
        caption?: string;
        hashtags?: string[];
        scheduledBy: ScheduleStrategy;
        confidenceScore?: number;
        scheduledHour?: number;
        runId?: string;
      },
    ) {
      const config = loadConfig(configOverrides);
      const store = initStore(config);
      const postedAt = new Date(params.postedAt);

      if (Number.isNaN(postedAt.getTime())) {
        throw new Error(`Invalid postedAt timestamp: ${params.postedAt}`);
      }

      const post = savePost(store, {
        id: randomUUID(),
        platform: params.platform,
        platformPostId: params.platformPostId?.trim() || undefined,
        postedAt: postedAt.toISOString(),
        contentType: params.contentType,
        videoPath: params.videoPath,
        hookText: params.hookText?.trim() || undefined,
        caption: params.caption?.trim() || undefined,
        hashtags: params.hashtags?.map((hashtag) => hashtag.trim()).filter(Boolean),
        scheduledBy: params.scheduledBy,
        confidenceScore: params.confidenceScore,
        scheduledHour: params.scheduledHour ?? postedAt.getUTCHours(),
        runId: params.runId?.trim() || undefined,
      });

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                success: true,
                postId: post.id,
                platform: post.platform,
                scheduledHour: post.scheduledHour,
                loggedAt: post.createdAt,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  };
}

export const logPostTool = createLogPostTool();
