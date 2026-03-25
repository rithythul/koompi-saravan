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
import { createConfigValidatorTool, configValidatorTool } from './tools/config-validator.js';
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
import {
  createUploadMediaTool,
  createListMediaTool,
  createGetSignedUrlTool,
  createDeleteMediaTool,
  uploadMediaTool,
  listMediaTool,
  getSignedUrlTool,
  deleteMediaTool,
} from './tools/media-storage.js';
import {
  createCreatePackTool,
  createListPacksTool,
  createGetPackTool,
  createUpdatePackTool,
  createDeletePackTool,
  createAddPackImageTool,
  createDeletePackImageTool,
  createPackTool,
  listPacksTool,
  getPackTool,
  updatePackTool,
  deletePackTool,
  addPackImageTool,
  deletePackImageTool,
} from './tools/pack-manager.js';

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
    createConfigValidatorTool(),
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
    // Media Storage Tools
    createUploadMediaTool(configOverrides),
    createListMediaTool(configOverrides),
    createGetSignedUrlTool(configOverrides),
    createDeleteMediaTool(configOverrides),
    // Pack Management Tools
    createCreatePackTool(configOverrides),
    createListPacksTool(configOverrides),
    createGetPackTool(configOverrides),
    createUpdatePackTool(configOverrides),
    createDeletePackTool(configOverrides),
    createAddPackImageTool(configOverrides),
    createDeletePackImageTool(configOverrides),
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
  configValidator: configValidatorTool,
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
  // Media Storage
  uploadMedia: uploadMediaTool,
  listMedia: listMediaTool,
  getSignedUrl: getSignedUrlTool,
  deleteMedia: deleteMediaTool,
  // Pack Management
  createPack: createPackTool,
  listPacks: listPacksTool,
  getPack: getPackTool,
  updatePack: updatePackTool,
  deletePack: deletePackTool,
  addPackImage: addPackImageTool,
  deletePackImage: deletePackImageTool,
};
