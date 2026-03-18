/**
 * Google Media Tools - OpenClaw Plugin
 * 
 * Provides image generation (Nano Banana), video generation (Veo),
 * music generation (Lyria), and TTS for automated content creation.
 */

import type { GoogleMediaConfigInput } from './lib/config.js';
import { createNanoBananaTool, nanoBananaTool } from './tools/nano-banana.js';
import { createRenderHookRevealTool, renderHookRevealTool } from './tools/render-hook-reveal.js';

export default function (api: {
  registerTool: (tool: any, options?: { optional?: boolean }) => void;
}, pluginContext?: { config?: GoogleMediaConfigInput }) {
  const configOverrides = pluginContext?.config ?? {};

  // Core image generation tool
  api.registerTool(createNanoBananaTool(configOverrides));
  api.registerTool(createRenderHookRevealTool(configOverrides));
  
  // Future tools (to be implemented):
  // api.registerTool(veoTool, { optional: true });
  // api.registerTool(lyriaTool, { optional: true });
  // api.registerTool(ttsTool, { optional: true });
}

// Export tools for direct use
export const tools = {
  nanoBanana: nanoBananaTool,
  renderHookReveal: renderHookRevealTool,
};
