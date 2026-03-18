/**
 * Google Media Tools - OpenClaw Plugin
 * 
 * Provides image generation (Nano Banana), video generation (Veo),
 * music generation (Lyria), and TTS for automated content creation.
 */

import type { GoogleMediaConfigInput } from './lib/config.js';
import { analyzePatternsTool, createAnalyzePatternsTool } from './tools/analyze-patterns.js';
import { createGenerateScheduleTool, generateScheduleTool } from './tools/generate-schedule.js';
import { createLogPostTool, logPostTool } from './tools/log-post.js';
import { createNanoBananaTool, nanoBananaTool } from './tools/nano-banana.js';
import { createPullAnalyticsTool, pullAnalyticsTool } from './tools/pull-analytics.js';
import { createPublishInstagramTool, publishInstagramTool } from './tools/publish-instagram.js';
import { createPublishTikTokTool, publishTikTokTool } from './tools/publish-tiktok.js';
import { createRenderHookRevealTool, renderHookRevealTool } from './tools/render-hook-reveal.js';
import { createUpdateHourPerformanceTool, updateHourPerformanceTool } from './tools/update-hour-performance.js';

export default function (api: {
  registerTool: (tool: any, options?: { optional?: boolean }) => void;
}, pluginContext?: { config?: GoogleMediaConfigInput }) {
  const configOverrides = pluginContext?.config ?? {};

  // Core image generation tool
  api.registerTool(createNanoBananaTool(configOverrides));
  api.registerTool(createRenderHookRevealTool(configOverrides));
  api.registerTool(createPublishInstagramTool(configOverrides));
  api.registerTool(createPublishTikTokTool(configOverrides));
  api.registerTool(createLogPostTool(configOverrides));
  api.registerTool(createPullAnalyticsTool(configOverrides));
  api.registerTool(createAnalyzePatternsTool(configOverrides));
  api.registerTool(createGenerateScheduleTool(configOverrides));
  api.registerTool(createUpdateHourPerformanceTool(configOverrides));
  
  // Future tools (to be implemented):
  // api.registerTool(veoTool, { optional: true });
  // api.registerTool(lyriaTool, { optional: true });
  // api.registerTool(ttsTool, { optional: true });
}

// Export tools for direct use
export const tools = {
  nanoBanana: nanoBananaTool,
  renderHookReveal: renderHookRevealTool,
  publishInstagram: publishInstagramTool,
  publishTikTok: publishTikTokTool,
  logPost: logPostTool,
  pullAnalytics: pullAnalyticsTool,
  analyzePatterns: analyzePatternsTool,
  generateSchedule: generateScheduleTool,
  updateHourPerformance: updateHourPerformanceTool,
};
