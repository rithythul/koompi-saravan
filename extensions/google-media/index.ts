/**
 * Google Media Tools - OpenClaw Plugin
 * 
 * Provides image generation (Nano Banana), video generation (Veo),
 * music generation (Lyria), and TTS for automated content creation.
 */

import { nanoBananaTool } from './tools/nano-banana.js';

export default function (api: {
  registerTool: (tool: any, options?: { optional?: boolean }) => void;
}) {
  // Core image generation tool
  api.registerTool(nanoBananaTool);
  
  // Future tools (to be implemented):
  // api.registerTool(veoTool, { optional: true });
  // api.registerTool(lyriaTool, { optional: true });
  // api.registerTool(ttsTool, { optional: true });
}

// Export tools for direct use
export const tools = {
  nanoBanana: nanoBananaTool
};
