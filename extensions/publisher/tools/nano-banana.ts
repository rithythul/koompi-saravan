/**
 * Nano Banana - Gemini Image Generation Tool
 * Generates images for social media content
 */

import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';

import { Type } from '@sinclair/typebox';

import { assertAutomationEnabled, loadConfig, type GoogleMediaConfigInput } from '../lib/config.js';
import { generateImages } from '../lib/gemini-client.js';
import { createRunOutputPaths, resolveSafeAssetPath } from '../lib/output-paths.js';
import { createRun, initStore, saveGeneratedAsset, updateRunStatus } from '../lib/store.js';

function mimeTypeToExtension(mimeType: string): string {
  switch (mimeType) {
    case 'image/jpeg':
      return '.jpg';
    case 'image/webp':
      return '.webp';
    case 'image/png':
    default:
      return '.png';
  }
}

export function createNanoBananaTool(configOverrides: GoogleMediaConfigInput = {}) {
  return {
    name: 'nano_banana',
    description:
      'Generate images using Gemini (Nano Banana). Saves generated image files to the managed output directory and returns run metadata.',
    parameters: Type.Object({
      prompt: Type.String({
        description: 'Image generation prompt. Be specific about style, composition, and mood.',
        minLength: 10,
        maxLength: 2000,
      }),
      count: Type.Optional(
        Type.Number({
          description: 'Number of images to generate (default: 1, max: 4)',
          minimum: 1,
          maximum: 4,
          default: 1,
        }),
      ),
    }),
    async execute(
      _id: string,
      params: {
        prompt: string;
        count?: number;
      },
    ) {
      const config = loadConfig(configOverrides);
      const store = initStore(config);
      let runId: string | null = null;

      try {
        assertAutomationEnabled(config);

        runId = randomUUID();
        const outputPaths = await createRunOutputPaths(config, runId);
        createRun(store, {
          id: runId,
          prompt: params.prompt,
          outputDir: outputPaths.runDir,
          metadata: {
            tool: 'nano_banana',
            count: params.count ?? 1,
            dryRun: config.dryRun,
          },
        });

        const images = await generateImages({
          prompt: params.prompt,
          count: params.count || 1,
          config,
        });

        const results = [];
        for (const [index, image] of images.entries()) {
          const extension = mimeTypeToExtension(image.mimeType);
          const filePath = resolveSafeAssetPath(
            outputPaths.runDir,
            `image-${String(index + 1).padStart(2, '0')}${extension}`,
          );
          const buffer = Buffer.from(image.data, 'base64');
          await fs.writeFile(filePath, buffer);
          const fileStats = await fs.stat(filePath);

          const assetId = randomUUID();
          saveGeneratedAsset(store, {
            id: assetId,
            runId,
            kind: 'image',
            mimeType: image.mimeType,
            filePath,
            fileSizeBytes: fileStats.size,
            metadata: { index },
          });

          results.push({
            assetId,
            index,
            mimeType: image.mimeType,
            filePath,
            fileSizeBytes: fileStats.size,
          });
        }

        const summaryPath = resolveSafeAssetPath(outputPaths.runDir, 'run.json');
        await fs.writeFile(
          summaryPath,
          JSON.stringify(
            {
              runId,
              status: 'generated',
              prompt: params.prompt,
              imageCount: results.length,
              images: results,
            },
            null,
            2,
          ),
        );

        updateRunStatus(store, runId, 'generated', {
          metadata: {
            imageCount: results.length,
            summaryPath,
          },
        });

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  success: true,
                  runId,
                  outputDir: outputPaths.runDir,
                  dryRun: config.dryRun,
                  images: results.map((result) => ({
                    assetId: result.assetId,
                    mimeType: result.mimeType,
                    filePath: result.filePath,
                    fileSizeBytes: result.fileSizeBytes,
                  })),
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (error) {
        if (runId) {
          updateRunStatus(store, runId, 'failed', {
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  success: false,
                  runId,
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

export const nanoBananaTool = createNanoBananaTool();
