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
import {
  createCreateTemplateTool,
  createListTemplatesTool,
  createGetTemplateTool,
  createUpdateTemplateTool,
  createDeleteTemplateTool,
  createCreateTemplateFromSlideshowTool,
  createTemplateTool,
  listTemplatesTool,
  getTemplateTool,
  updateTemplateTool,
  deleteTemplateTool,
  createTemplateFromSlideshowTool,
} from './tools/template-manager.js';
import {
  createCreateFolderTool,
  createListFoldersTool,
  createGetFolderTool,
  createMoveFolderTool,
  createDeleteFolderTool,
  createFolderAncestorsTool,
  createFolderItemsTool,
  createFolderItemsAddTool,
  createFolderItemsRemoveTool,
  createFolderTool,
  listFoldersTool,
  getFolderTool,
  moveFolderTool,
  deleteFolderTool,
  folderAncestorsTool,
  folderItemsTool,
  folderItemsAddTool,
  folderItemsRemoveTool,
} from './tools/folder-manager.js';
import {
  createGenerateSlideshowTool,
  createRenderSlideshowTool,
  createUpdateSlideshowTool,
  generateSlideshowTool,
  renderSlideshowTool,
  updateSlideshowTool,
} from './tools/slideshow-generator.js';
import {
  createTrendBriefTool,
  trendBriefTool,
} from './tools/trend-brief.js';
import {
  createAnalyticsSummaryTool,
  createAnalyticsPostsTool,
  createCreateAnalyticsTargetTool,
  createRefreshAnalyticsTool,
  analyticsSummaryTool,
  analyticsPostsTool,
  createAnalyticsTargetTool,
  refreshAnalyticsTool,
} from './tools/analytics-aggregator.js';
import {
  createScheduleJobTool,
  createListJobsTool,
  createCancelJobTool,
  createGetJobTool,
  scheduleJobTool,
  listJobsTool,
  cancelJobTool,
  getJobTool,
} from './tools/scheduler.js';
import { createPublishTool, publishTool } from './tools/publish.js';

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
    // Template Management Tools
    createCreateTemplateTool(configOverrides),
    createListTemplatesTool(configOverrides),
    createGetTemplateTool(configOverrides),
    createUpdateTemplateTool(configOverrides),
    createDeleteTemplateTool(configOverrides),
    createCreateTemplateFromSlideshowTool(configOverrides),
    // Folder Management Tools
    createCreateFolderTool(configOverrides),
    createListFoldersTool(configOverrides),
    createGetFolderTool(configOverrides),
    createMoveFolderTool(configOverrides),
    createDeleteFolderTool(configOverrides),
    createFolderAncestorsTool(configOverrides),
    createFolderItemsTool(configOverrides),
    createFolderItemsAddTool(configOverrides),
    createFolderItemsRemoveTool(configOverrides),
    // Slideshow Generation
    createGenerateSlideshowTool(configOverrides),
    createRenderSlideshowTool(configOverrides),
    createUpdateSlideshowTool(configOverrides),
    // Trend Research
    createTrendBriefTool(configOverrides),
    // Analytics Aggregator
    createAnalyticsSummaryTool(configOverrides),
    createAnalyticsPostsTool(configOverrides),
    createCreateAnalyticsTargetTool(configOverrides),
    createRefreshAnalyticsTool(configOverrides),
    // Scheduler
    createScheduleJobTool(configOverrides),
    createListJobsTool(configOverrides),
    createCancelJobTool(configOverrides),
    createGetJobTool(configOverrides),
    // Unified Publishing
    createPublishTool(configOverrides),
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
  // Template Management
  createTemplate: createTemplateTool,
  listTemplates: listTemplatesTool,
  getTemplate: getTemplateTool,
  updateTemplate: updateTemplateTool,
  deleteTemplate: deleteTemplateTool,
  createTemplateFromSlideshow: createTemplateFromSlideshowTool,
  // Folder Management
  createFolder: createFolderTool,
  listFolders: listFoldersTool,
  getFolder: getFolderTool,
  moveFolder: moveFolderTool,
  deleteFolder: deleteFolderTool,
  folderAncestors: folderAncestorsTool,
  folderItems: folderItemsTool,
  folderItemsAdd: folderItemsAddTool,
  folderItemsRemove: folderItemsRemoveTool,
  // Slideshow Generation
  generateSlideshow: generateSlideshowTool,
  renderSlideshow: renderSlideshowTool,
  updateSlideshow: updateSlideshowTool,
  // Trend Research
  trendBrief: trendBriefTool,
  // Analytics Aggregator
  analyticsSummary: analyticsSummaryTool,
  analyticsPosts: analyticsPostsTool,
  createAnalyticsTarget: createAnalyticsTargetTool,
  refreshAnalytics: refreshAnalyticsTool,
  // Scheduler
  scheduleJob: scheduleJobTool,
  listJobs: listJobsTool,
  cancelJob: cancelJobTool,
  getJob: getJobTool,
  // Unified Publishing
  publish: publishTool,
};
