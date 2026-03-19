/**
 * Google Media Tools - OpenClaw Plugin
 *
 * Provides generation, rendering, publishing, analytics, and planning tools
 * for automated social media content workflows.
 */

import type { GoogleMediaConfigInput } from './lib/config.js';
import { analyzePatternsTool, createAnalyzePatternsTool } from './tools/analyze-patterns.js';
import { buildDailyPlanTool, createBuildDailyPlanTool } from './tools/build-daily-plan.js';
import { createExecutePlannedPostTool, executePlannedPostTool } from './tools/execute-planned-post.js';
import { createGenerateScheduleTool, generateScheduleTool } from './tools/generate-schedule.js';
import { createLogConversionTool, logConversionTool } from './tools/log-conversion.js';
import { createLogPostTool, logPostTool } from './tools/log-post.js';
import { createNanoBananaTool, nanoBananaTool } from './tools/nano-banana.js';
import { createPlanNextPostTool, planNextPostTool } from './tools/plan-next-post.js';
import { createPullAnalyticsTool, pullAnalyticsTool } from './tools/pull-analytics.js';
import { createPublishInstagramTool, publishInstagramTool } from './tools/publish-instagram.js';
import { createPublishTikTokTool, publishTikTokTool } from './tools/publish-tiktok.js';
import { createRenderHookRevealTool, renderHookRevealTool } from './tools/render-hook-reveal.js';
import { createRunDailyPlanTool, runDailyPlanTool } from './tools/run-daily-plan.js';
import { createUpdateHourPerformanceTool, updateHourPerformanceTool } from './tools/update-hour-performance.js';

export type OpenClawTool = {
  name: string;
  description: string;
  parameters: unknown;
  execute: unknown;
};

export type OpenClawPluginApi = {
  registerTool: (tool: OpenClawTool, options?: { optional?: boolean }) => void;
};

export type OpenClawPluginContext = {
  config?: GoogleMediaConfigInput;
};

export function createRegisteredTools(configOverrides: GoogleMediaConfigInput = {}): OpenClawTool[] {
  return [
    createNanoBananaTool(configOverrides),
    createRenderHookRevealTool(configOverrides),
    createPublishInstagramTool(configOverrides),
    createPublishTikTokTool(configOverrides),
    createLogPostTool(configOverrides),
    createLogConversionTool(configOverrides),
    createPullAnalyticsTool(configOverrides),
    createAnalyzePatternsTool(configOverrides),
    createGenerateScheduleTool(configOverrides),
    createPlanNextPostTool(configOverrides),
    createBuildDailyPlanTool(configOverrides),
    createExecutePlannedPostTool(configOverrides),
    createRunDailyPlanTool(configOverrides),
    createUpdateHourPerformanceTool(configOverrides),
  ];
}

export const registeredToolNames = createRegisteredTools().map((tool) => tool.name);

export default function registerGoogleMediaPlugin(
  api: OpenClawPluginApi,
  pluginContext?: OpenClawPluginContext,
) {
  const configOverrides = pluginContext?.config ?? {};

  for (const tool of createRegisteredTools(configOverrides)) {
    api.registerTool(tool);
  }
}

// Export tools for direct use
export const tools = {
  nanoBanana: nanoBananaTool,
  renderHookReveal: renderHookRevealTool,
  publishInstagram: publishInstagramTool,
  publishTikTok: publishTikTokTool,
  logPost: logPostTool,
  logConversion: logConversionTool,
  pullAnalytics: pullAnalyticsTool,
  analyzePatterns: analyzePatternsTool,
  generateSchedule: generateScheduleTool,
  planNextPost: planNextPostTool,
  buildDailyPlan: buildDailyPlanTool,
  executePlannedPost: executePlannedPostTool,
  runDailyPlan: runDailyPlanTool,
  updateHourPerformance: updateHourPerformanceTool,
};
