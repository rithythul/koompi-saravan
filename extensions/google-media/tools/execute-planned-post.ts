import fs from 'node:fs/promises';
import { randomUUID } from 'crypto';

import { Type } from '@sinclair/typebox';

import { assertAutomationEnabled, loadConfig, type GoogleMediaConfigInput } from '../lib/config.js';
import { createRunOutputPaths, resolveSafeAssetPath } from '../lib/output-paths.js';
import { buildPublicAssetUrl } from '../lib/public-media.js';
import {
  createRun,
  getPlannedPostById,
  getPostByRunId,
  getPublishedPostByRunAndPlatform,
  initStore,
  saveGeneratedAsset,
  savePost,
  updateRunStatus,
  updatePlannedPostStatus,
} from '../lib/store.js';
import { createNanoBananaTool } from './nano-banana.js';
import { createPublishInstagramTool } from './publish-instagram.js';
import { createPublishTikTokTool } from './publish-tiktok.js';
import { createRenderHookRevealTool } from './render-hook-reveal.js';

const PLACEHOLDER_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9sX2VINAAAAASUVORK5CYII=';

function safeParseToolPayload(result: { content: Array<{ text?: string }> }): Record<string, unknown> {
  const text = result.content[0]?.text;
  if (!text) {
    throw new Error('Tool returned no text payload.');
  }

  return JSON.parse(text) as Record<string, unknown>;
}

async function createPlaceholderImageRun(
  store: ReturnType<typeof initStore>,
  config: ReturnType<typeof loadConfig>,
  prompt: string,
): Promise<{ runId: string; placeholderPath: string }> {
  const runId = randomUUID();
  const outputPaths = await createRunOutputPaths(config, runId);
  createRun(store, {
    id: runId,
    prompt,
    outputDir: outputPaths.runDir,
    metadata: {
      tool: 'execute_planned_post_placeholder',
      placeholder: true,
      dryRun: config.dryRun,
    },
  });

  const placeholderPath = resolveSafeAssetPath(outputPaths.runDir, 'image-01.png');
  const buffer = Buffer.from(PLACEHOLDER_PNG_BASE64, 'base64');
  await fs.writeFile(placeholderPath, buffer);

  saveGeneratedAsset(store, {
    id: randomUUID(),
    runId,
    kind: 'image',
    mimeType: 'image/png',
    filePath: placeholderPath,
    fileSizeBytes: buffer.byteLength,
    metadata: {
      placeholder: true,
    },
  });

  updateRunStatus(store, runId, 'generated', {
    metadata: {
      placeholder: true,
      imageCount: 1,
    },
  });

  return {
    runId,
    placeholderPath,
  };
}

export function createExecutePlannedPostTool(configOverrides: GoogleMediaConfigInput = {}) {
  return {
    name: 'execute_planned_post',
    description:
      'Execute one planned post end-to-end: generate the image, render the video, publish it, log the post, and update plan status.',
    parameters: Type.Object({
      plannedPostId: Type.String(),
      autoPublish: Type.Optional(
        Type.Boolean({
          default: true,
          description: 'If false, stop after generation and rendering.',
        }),
      ),
      forceVideoUrl: Type.Optional(
        Type.String({
          description: 'Optional explicit public video URL override for live publishing.',
          format: 'uri',
        }),
      ),
    }),
    async execute(
      _id: string,
      params: {
        plannedPostId: string;
        autoPublish?: boolean;
        forceVideoUrl?: string;
      },
    ) {
      const config = loadConfig(configOverrides);
      const store = initStore(config);
      const autoPublish = params.autoPublish ?? true;
      assertAutomationEnabled(config);

      const plannedPost = getPlannedPostById(store, params.plannedPostId);
      if (!plannedPost) {
        throw new Error(`Planned post not found: ${params.plannedPostId}`);
      }

      if (plannedPost.status === 'completed') {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  success: true,
                  plannedPostId: plannedPost.id,
                  skipped: true,
                  reason: 'planned post already completed',
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      updatePlannedPostStatus(store, plannedPost.id, 'queued', {
        queuedAt: new Date().toISOString(),
      });

      const nanoBananaTool = createNanoBananaTool(configOverrides);
      const renderTool = createRenderHookRevealTool(configOverrides);
      const publishTool =
        plannedPost.platform === 'instagram'
          ? createPublishInstagramTool(configOverrides)
          : createPublishTikTokTool(configOverrides);

      const imagePrompt = [
        plannedPost.hookText,
        plannedPost.caption,
        `Create a vertical social-media background for a ${plannedPost.contentType.replace(/_/g, ' ')} post.`,
      ]
        .filter(Boolean)
        .join(' ');
      const imageResult = safeParseToolPayload(
        await nanoBananaTool.execute(`planned-${plannedPost.id}-image`, {
          prompt: imagePrompt,
          count: 1,
        }),
      );

      let generationPayload = imageResult;
      if (!generationPayload.success || typeof generationPayload.runId !== 'string') {
        if (config.dryRun) {
          const placeholderRun = await createPlaceholderImageRun(store, config, imagePrompt);
          generationPayload = {
            success: true,
            runId: placeholderRun.runId,
            placeholderPath: placeholderRun.placeholderPath,
            dryRunFallback: true,
          };
        } else {
          updatePlannedPostStatus(store, plannedPost.id, 'cancelled', {
            failedAt: new Date().toISOString(),
            error: imageResult.error,
          });
          throw new Error(
            typeof imageResult.error === 'string' ? imageResult.error : 'Image generation failed.',
          );
        }
      }

      const runId = generationPayload.runId as string;
      const renderResult = safeParseToolPayload(
        await renderTool.execute(`planned-${plannedPost.id}-render`, {
          runId,
          hookText: plannedPost.hookText ?? 'Watch this',
          revealText: plannedPost.caption ?? 'New post ready',
        }),
      );

      if (!renderResult.success || typeof renderResult.outputPath !== 'string') {
        updatePlannedPostStatus(store, plannedPost.id, 'cancelled', {
          failedAt: new Date().toISOString(),
          error: renderResult.error,
          runId,
        });
        throw new Error(
          typeof renderResult.error === 'string' ? renderResult.error : 'Video rendering failed.',
        );
      }

      const outputPath = renderResult.outputPath;
      const resolvedVideoUrl =
        params.forceVideoUrl?.trim() || buildPublicAssetUrl(config, outputPath);

      let publishPayload: Record<string, unknown> | undefined;
      if (autoPublish) {
        publishPayload = safeParseToolPayload(
          await publishTool.execute(`planned-${plannedPost.id}-publish`, {
            runId,
            caption: plannedPost.caption ?? plannedPost.hookText ?? 'New post',
            videoUrl: resolvedVideoUrl,
          }),
        );

        if (!publishPayload.success) {
          updatePlannedPostStatus(store, plannedPost.id, 'cancelled', {
            failedAt: new Date().toISOString(),
            error: publishPayload.error,
            runId,
          });
          throw new Error(
            typeof publishPayload.error === 'string'
              ? publishPayload.error
              : 'Publishing failed.',
          );
        }
      }

      const existingPost = getPostByRunId(store, runId, plannedPost.platform);
      const publication = getPublishedPostByRunAndPlatform(store, runId, plannedPost.platform);
      const postedAt = new Date().toISOString();
      const loggedPost =
        existingPost ??
        savePost(store, {
          id: randomUUID(),
          platform: plannedPost.platform,
          platformPostId:
            typeof publication?.platformPostId === 'string'
              ? publication.platformPostId
              : typeof publishPayload?.platformPostId === 'string'
                ? String(publishPayload.platformPostId)
                : undefined,
          postedAt,
          contentType: plannedPost.contentType,
          videoPath: outputPath,
          hookText: plannedPost.hookText,
          caption: plannedPost.caption,
          hashtags: [],
          scheduledBy: plannedPost.scheduleStrategy,
          confidenceScore: plannedPost.confidence,
          scheduledHour: new Date(plannedPost.scheduledFor).getUTCHours(),
          runId,
        });

      const completedPlan = updatePlannedPostStatus(store, plannedPost.id, 'completed', {
        completedAt: new Date().toISOString(),
        runId,
        loggedPostId: loggedPost.id,
        outputPath,
        publicVideoUrl: resolvedVideoUrl,
        usedDryRunPlaceholderImage: Boolean(generationPayload.dryRunFallback),
      });

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                success: true,
                plannedPostId: completedPlan.id,
                runId,
                platform: completedPlan.platform,
                outputPath,
                publicVideoUrl: resolvedVideoUrl,
                postId: loggedPost.id,
                published: autoPublish,
                usedDryRunPlaceholderImage: Boolean(generationPayload.dryRunFallback),
                publicationStatus: publication?.status ?? publishPayload?.status,
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

export const executePlannedPostTool = createExecutePlannedPostTool();
