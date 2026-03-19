import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';

import { Type } from '@sinclair/typebox';

import { assertAutomationEnabled, loadConfig, type GoogleMediaConfigInput } from '../lib/config.js';
import { createRunOutputPaths, resolveSafeAssetPath } from '../lib/output-paths.js';
import { createRun, getRunById, initStore, saveRenderedVideo, updateRunStatus } from '../lib/store.js';
import type { RenderRequest } from '../lib/types.js';
import type { RenderResult } from '../../../remotion-template/src/render.js';
import { renderHookReveal } from '../../../remotion-template/src/render.js';

const DRY_RUN_MP4_PLACEHOLDER = Buffer.from('dry-run-remotion-render');

export function createRenderHookRevealTool(configOverrides: GoogleMediaConfigInput = {}) {
  return {
    name: 'render_hook_reveal',
    description:
      'Render the HookReveal Remotion composition into a managed MP4 output and attach it to a tracked run.',
    parameters: Type.Object({
      runId: Type.Optional(
        Type.String({
          description: 'Existing run ID to attach the render to. If omitted, a new tracked run is created.',
        }),
      ),
      hookText: Type.String({
        description: 'Opening hook text for the short video.',
        minLength: 3,
        maxLength: 160,
      }),
      revealText: Type.String({
        description: 'Reveal text that lands after the hook.',
        minLength: 3,
        maxLength: 220,
      }),
      hookColor: Type.Optional(Type.String({ description: 'Optional hook text color as a CSS value.' })),
      revealColor: Type.Optional(Type.String({ description: 'Optional reveal text color as a CSS value.' })),
      backgroundColor: Type.Optional(Type.String({ description: 'Optional background color as a CSS value.' })),
    }),
    async execute(_id: string, params: RenderRequest) {
      const config = loadConfig(configOverrides);
      const store = initStore(config);
      let runId = params.runId ?? null;

      try {
        assertAutomationEnabled(config);

        let run = runId ? getRunById(store, runId) : null;
        if (!runId || !run) {
          runId = randomUUID();
          const outputPaths = await createRunOutputPaths(config, runId);
          run = createRun(store, {
            id: runId,
            outputDir: outputPaths.runDir,
            metadata: {
              tool: 'render_hook_reveal',
              dryRun: config.dryRun,
            },
          });
        }

        const outputPath = resolveSafeAssetPath(run.outputDir, 'hook-reveal.mp4');
        const renderResult: RenderResult = config.dryRun
          ? await (async () => {
              await fs.writeFile(outputPath, DRY_RUN_MP4_PLACEHOLDER);
              return {
                success: true,
                compositionId: 'HookReveal' as const,
                outputPath,
                width: 1080,
                height: 1920,
                fps: 30,
                durationInFrames: 150,
              };
            })()
          : await renderHookReveal({
              hookText: params.hookText,
              revealText: params.revealText,
              outputPath,
              hookColor: params.hookColor,
              revealColor: params.revealColor,
              backgroundColor: params.backgroundColor,
            });

        if (!renderResult.success) {
          throw new Error(renderResult.error || 'Unknown Remotion render error');
        }

        const fileStats = await fs.stat(outputPath);
        const renderId = randomUUID();
        saveRenderedVideo(store, {
          id: renderId,
          runId,
          compositionId: renderResult.compositionId,
          filePath: outputPath,
          width: renderResult.width || 0,
          height: renderResult.height || 0,
          fps: renderResult.fps || 0,
          durationInFrames: renderResult.durationInFrames || 0,
          metadata: {
            fileSizeBytes: fileStats.size,
          },
        });

        const summaryPath = resolveSafeAssetPath(run.outputDir, 'render.json');
        await fs.writeFile(
          summaryPath,
          JSON.stringify(
            {
              runId,
              renderId,
              compositionId: renderResult.compositionId,
              outputPath,
              width: renderResult.width,
              height: renderResult.height,
              fps: renderResult.fps,
              durationInFrames: renderResult.durationInFrames,
              fileSizeBytes: fileStats.size,
            },
            null,
            2,
          ),
        );

        updateRunStatus(store, runId, 'rendered', {
          metadata: {
            compositionId: renderResult.compositionId,
            outputPath,
            renderSummaryPath: summaryPath,
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
                  renderId,
                  outputPath,
                  fileSizeBytes: fileStats.size,
                  compositionId: renderResult.compositionId,
                  width: renderResult.width,
                  height: renderResult.height,
                  fps: renderResult.fps,
                  durationInFrames: renderResult.durationInFrames,
                  dryRun: config.dryRun,
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

export const renderHookRevealTool = createRenderHookRevealTool();
