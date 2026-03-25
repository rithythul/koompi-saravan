import { createBuildDailyPlanTool } from '../../extensions/google-media/tools/build-daily-plan.js';
import { createNanoBananaTool } from '../../extensions/google-media/tools/nano-banana.js';
import { createRenderHookRevealTool } from '../../extensions/google-media/tools/render-hook-reveal.js';
import { createPublishInstagramTool } from '../../extensions/google-media/tools/publish-instagram.js';
import { createPublishTikTokTool } from '../../extensions/google-media/tools/publish-tiktok.js';
import { loadConfig, assertAutomationEnabled, type GoogleMediaConfigInput } from '../../extensions/google-media/lib/config.js';
import { initStore, listPlannedPosts, updatePlannedPostStatus } from '../../extensions/google-media/lib/store.js';
import { buildPublicAssetUrl } from '../../extensions/google-media/lib/public-media.js';
import type { PlanningObjective, Platform, PlannedPost } from '../../extensions/google-media/lib/types.js';

export type PipelineStage = 'PLAN' | 'GENERATE_IMAGE' | 'RENDER_VIDEO' | 'PUBLISH' | 'DONE';

export interface PipelineOptions {
  date: string;
  platform: Platform | 'all';
  postCount: number;
  objective?: PlanningObjective;
  autoPublish?: boolean;
  daysBack?: number;
  explorationRate?: number;
  minGapMinutes?: number;
  activeHoursStart?: number;
  executeExistingOnly?: boolean;
  configOverrides?: GoogleMediaConfigInput;
  forceVideoUrl?: string;
}

export interface StageResult {
  stage: PipelineStage;
  success: boolean;
  durationMs: number;
  data?: Record<string, unknown>;
  error?: string;
}

export interface PostResult {
  plannedPostId: string;
  platform: string;
  stages: StageResult[];
  success: boolean;
  durationMs: number;
}

export interface PipelineResult {
  success: boolean;
  date: string;
  durationMs: number;
  posts: PostResult[];
}

function parseToolPayload(result: any): { success: boolean; [key: string]: any } {
  try {
    const parsed = typeof result === 'string' ? JSON.parse(result) : result;
    return { success: true, ...parsed };
  } catch {
    return { success: false, error: 'Failed to parse tool payload' };
  }
}

async function timedStage<T>(
  stage: PipelineStage,
  fn: () => Promise<T>,
): Promise<StageResult & { value: T }> {
  const t0 = Date.now();
  try {
    const value = await fn();
    return { stage, success: true, durationMs: Date.now() - t0, value };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { stage, success: false, durationMs: Date.now() - t0, error: message, value: undefined as T };
  }
}

export class PipelineController {
  private readonly configOverrides: GoogleMediaConfigInput;

  constructor(options?: { configOverrides?: GoogleMediaConfigInput }) {
    this.configOverrides = options?.configOverrides ?? {};
  }

  private emptyResult(date: string, objective: PlanningObjective, start: number, error?: Error): PipelineResult {
    return { success: false, date, durationMs: Date.now() - start, posts: [], error: error?.message };
  }

  private failPost(store: any, planned: PlannedPost, stages: StageResult[], results: PostResult[], start: number, error?: string) {
    updatePlannedPostStatus(store, planned.id, 'failed', { error });
    results.push({
      plannedPostId: planned.id,
      platform: planned.platform,
      stages,
      success: false,
      durationMs: Date.now() - start
    });
  }

  async run(options: PipelineOptions): Promise<PipelineResult> {
    const start = Date.now();
    const mergedConfig = { ...this.configOverrides, ...options.configOverrides };
    const config = loadConfig(mergedConfig);
    const store = initStore(config);
    const objective = options.objective ?? 'conversions';
    const autoPublish = options.autoPublish ?? true;

    try { assertAutomationEnabled(config); } catch (err) { return this.emptyResult(options.date, objective, start, err as Error); }

    let plannedPosts = listPlannedPosts(store, { date: options.date, ...(options.platform !== 'all' ? { platform: options.platform } : {}) });

    if (plannedPosts.length === 0 && !options.executeExistingOnly) {
      console.log(`[pipeline] Stage 1/4 · Building daily plan for ${options.date}...`);
      const buildTool = createBuildDailyPlanTool(mergedConfig);
      const planStage = await timedStage('PLAN', () => buildTool.execute('pipeline-plan', { 
        date: options.date, platform: options.platform, postCount: options.postCount 
      }));
      
      if (!planStage.success) return this.emptyResult(options.date, objective, start, new Error(planStage.error));
      plannedPosts = listPlannedPosts(store, { date: options.date });
    }

    const postResults: PostResult[] = [];
    for (const planned of plannedPosts) {
      const postStart = Date.now();
      const stages: StageResult[] = [];
      updatePlannedPostStatus(store, planned.id, 'queued', { queuedAt: new Date().toISOString() });

      // Stage 2: Generate Image
      const nanoBananaTool = createNanoBananaTool(mergedConfig);
      const genStage = await timedStage('GENERATE_IMAGE', () => nanoBananaTool.execute(`pipeline-${planned.id}-image`, { 
        prompt: `${planned.hookText} ${planned.caption} Create a vertical social-media background.` 
      }));
      stages.push(genStage);
      if (!genStage.success) { this.failPost(store, planned, stages, postResults, postStart, genStage.error); continue; }
      const genPayload = parseToolPayload(genStage.value);

      // Stage 3: Render Video
      const renderTool = createRenderHookRevealTool(mergedConfig);
      const renderStage = await timedStage('RENDER_VIDEO', () => renderTool.execute(`pipeline-${planned.id}-render`, { 
        runId: genPayload.runId, hookText: planned.hookText 
      }));
      stages.push(renderStage);
      if (!renderStage.success) { this.failPost(store, planned, stages, postResults, postStart, renderStage.error); continue; }
      const renderPayload = parseToolPayload(renderStage.value);
      const resolvedVideoUrl = options.forceVideoUrl?.trim() || buildPublicAssetUrl(config, renderPayload.outputPath);

      // Stage 4: Publish
      if (autoPublish) {
        const publishTool = planned.platform === 'instagram' ? createPublishInstagramTool(mergedConfig) : createPublishTikTokTool(mergedConfig);
        const pubStage = await timedStage('PUBLISH', () => publishTool.execute(`pipeline-${planned.id}-publish`, { 
          runId: genPayload.runId, caption: planned.caption, videoUrl: resolvedVideoUrl 
        }));
        stages.push(pubStage);
        if (!pubStage.success) { this.failPost(store, planned, stages, postResults, postStart, pubStage.error); continue; }
      }

      updatePlannedPostStatus(store, planned.id, 'success', { completedAt: new Date().toISOString() });
      postResults.push({ plannedPostId: planned.id, platform: planned.platform, stages, success: true, durationMs: Date.now() - postStart });
    }

    return { success: postResults.every(p => p.success), date: options.date, durationMs: Date.now() - start, posts: postResults };
  }
}
