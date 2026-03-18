import { randomUUID } from 'crypto';

import { Type } from '@sinclair/typebox';

import { assertAutomationEnabled, loadConfig, type GoogleMediaConfigInput } from '../lib/config.js';
import { assertCanPublish } from '../lib/idempotency.js';
import { publishInstagramVideo } from '../lib/platforms/instagram-client.js';
import {
  getLatestRenderedVideoForRun,
  getPublishedPostByRunAndPlatform,
  getRunById,
  initStore,
  savePublishedPost,
  updateRunStatus,
} from '../lib/store.js';
import type { PublishRequest } from '../lib/types.js';

function buildCaption(caption: string, hashtags?: string[]): string {
  const normalizedHashtags = (hashtags ?? [])
    .map((hashtag) => hashtag.trim().replace(/^#*/, ''))
    .filter(Boolean)
    .map((hashtag) => `#${hashtag}`);

  return [caption.trim(), normalizedHashtags.join(' ')].filter(Boolean).join('\n\n');
}

export function createPublishInstagramTool(configOverrides: GoogleMediaConfigInput = {}) {
  return {
    name: 'publish_instagram',
    description:
      'Publish a rendered video run to Instagram Reels with idempotent tracking and dry-run support.',
    parameters: Type.Object({
      runId: Type.String({
        description: 'Tracked run ID that already has a rendered video attached.',
      }),
      caption: Type.String({
        description: 'Caption text to publish with the reel.',
        minLength: 1,
        maxLength: 2200,
      }),
      videoUrl: Type.Optional(
        Type.String({
          description: 'Publicly reachable video URL for real publishing. Optional in dry-run mode.',
          format: 'uri',
        }),
      ),
      hashtags: Type.Optional(
        Type.Array(Type.String({ minLength: 1, maxLength: 100 }), {
          description: 'Optional list of hashtags appended to the caption.',
          maxItems: 30,
        }),
      ),
    }),
    async execute(_id: string, params: PublishRequest) {
      const config = loadConfig(configOverrides);
      const store = initStore(config);

      try {
        assertAutomationEnabled(config);

        const run = getRunById(store, params.runId);
        if (!run) {
          throw new Error(`Run not found: ${params.runId}`);
        }

        const renderedVideo = getLatestRenderedVideoForRun(store, params.runId);
        if (!renderedVideo) {
          throw new Error(`Run ${params.runId} does not have a rendered video to publish.`);
        }

        const existingPublication = getPublishedPostByRunAndPlatform(store, params.runId, 'instagram');
        assertCanPublish(existingPublication, config.dryRun);

        const caption = buildCaption(params.caption, params.hashtags);
        const publicationId = randomUUID();
        const videoUrl = params.videoUrl?.trim();

        if (!config.dryRun && !videoUrl) {
          throw new Error(
            'Instagram publishing requires a public videoUrl. Local rendered files can only be used in dry-run mode.',
          );
        }

        const publishResponse = config.dryRun
          ? {
              platformPostId: `dryrun-instagram-${params.runId}`,
              permalink: undefined,
              metadata: {
                simulated: true,
              },
            }
          : await publishInstagramVideo(config, {
              caption,
              videoUrl: videoUrl!,
            });

        const publication = savePublishedPost(store, {
          id: publicationId,
          runId: params.runId,
          platform: 'instagram',
          status: config.dryRun ? 'dry_run' : 'published',
          caption,
          videoPath: renderedVideo.filePath,
          videoUrl,
          platformPostId: publishResponse.platformPostId,
          permalink: publishResponse.permalink,
          metadata: {
            ...(publishResponse.metadata ?? {}),
            hashtags: params.hashtags ?? [],
            dryRun: config.dryRun,
          },
        });

        if (!config.dryRun) {
          updateRunStatus(store, params.runId, 'published', {
            metadata: {
              instagramPublicationId: publication.id,
              instagramPlatformPostId: publication.platformPostId,
            },
          });
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  success: true,
                  publicationId: publication.id,
                  runId: params.runId,
                  platform: 'instagram',
                  status: publication.status,
                  platformPostId: publication.platformPostId,
                  permalink: publication.permalink,
                  dryRun: config.dryRun,
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  success: false,
                  runId: params.runId,
                  platform: 'instagram',
                  error: error instanceof Error ? error.message : 'Unknown error',
                },
                null,
                2,
              ),
            },
          ],
        };
      }
    },
  };
}

export const publishInstagramTool = createPublishInstagramTool();
