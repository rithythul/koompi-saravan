/**
 * Nano Banana - Gemini Image Generation Tool
 * Generates images for social media content
 */

import { Type } from '@sinclair/typebox';
import { generateImages } from '../lib/gemini-client.js';

export const nanoBananaTool = {
  name: 'nano_banana',
  description: 'Generate images using Gemini (Nano Banana). Creates high-quality images for social media content. Returns base64 image data.',
  parameters: Type.Object({
    prompt: Type.String({
      description: 'Image generation prompt. Be specific about style, composition, and mood.'
    }),
    count: Type.Optional(Type.Number({
      description: 'Number of images to generate (default: 1, max: 4)',
      minimum: 1,
      maximum: 4,
      default: 1
    })),
    width: Type.Optional(Type.Number({
      description: 'Image width in pixels (default: 1024)',
      default: 1024
    })),
    height: Type.Optional(Type.Number({
      description: 'Image height in pixels (default: 1024). Use 1920 for 9:16 portrait.',
      default: 1024
    })),
    savePath: Type.Optional(Type.String({
      description: 'Optional path to save the image file'
    }))
  }),
  async execute(_id: string, params: {
    prompt: string;
    count?: number;
    width?: number;
    height?: number;
    savePath?: string;
  }) {
    try {
      const images = await generateImages({
        prompt: params.prompt,
        count: params.count || 1,
        width: params.width,
        height: params.height
      });
      
      const results = images.map((img, i) => ({
        index: i,
        mimeType: img.mimeType,
        base64: img.data,
        dataUrl: `data:${img.mimeType};base64,${img.data}`
      }));
      
      // Save to file if path provided
      if (params.savePath && results.length > 0) {
        const fs = await import('fs/promises');
        const buffer = Buffer.from(results[0].base64, 'base64');
        await fs.writeFile(params.savePath, buffer);
      }
      
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            count: results.length,
            images: results.map(r => ({
              mimeType: r.mimeType,
              dataUrl: r.dataUrl.substring(0, 100) + '...[truncated]'
            })),
            savedTo: params.savePath || null
          }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          }, null, 2)
        }]
      };
    }
  }
};
