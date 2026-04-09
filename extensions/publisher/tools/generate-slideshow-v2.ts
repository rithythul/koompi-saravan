/**
 * Generate Slideshow Tool (V2)
 *
 * AI-powered slideshow generation using Gemini Flash for content
 * and Nano Banana for image generation with text baked in.
 */

import { Type } from '@sinclair/typebox';

import { generateSlideshow, getSlideshow, listSlideshows, deleteSlideshow } from '../../../src/slideshow/orchestrator.js';

// ============================================================================
// Tool Definitions
// ============================================================================

export const generateSlideshowTool = {
  name: 'generate_slideshow',
  description: 'Generate an AI-powered slideshow for social media. Uses Gemini Flash for content generation and Nano Banana for image generation with text baked in. No separate rendering needed.',
  parameters: Type.Object({
    prompt: Type.String({
      description: 'Content prompt for the slideshow (e.g., "5 morning habits that changed my life")',
      minLength: 5,
      maxLength: 500,
    }),
    slideCount: Type.Optional(
      Type.Number({
        description: 'Number of slides to generate (default: 5, max: 10)',
        minimum: 1,
        maximum: 10,
        default: 5,
      }),
    ),
    aspectRatio: Type.Optional(
      Type.Union([
        Type.Literal('9:16'),
        Type.Literal('4:5'),
        Type.Literal('1:1'),
        Type.Literal('16:9'),
      ], {
        description: 'Slide aspect ratio (default: 9:16 for TikTok/Reels)',
      }),
    ),
    style: Type.Optional(
      Type.Union([
        Type.Literal('tiktok'),
        Type.Literal('instagram'),
        Type.Literal('educational'),
        Type.Literal('minimal'),
      ], {
        description: 'Visual style preset (default: tiktok)',
      }),
    ),
    language: Type.Optional(
      Type.String({
        description: 'Content language code (default: en)',
        default: 'en',
      }),
    ),
    timeout: Type.Optional(
      Type.Number({
        description: 'Timeout per image generation in milliseconds (default: 60000)',
        default: 60000,
      }),
    ),
  }),
};

export const getSlideshowTool = {
  name: 'get_slideshow',
  description: 'Get slideshow status and results by ID',
  parameters: Type.Object({
    slideshowId: Type.String({
      description: 'Slideshow ID',
    }),
  }),
};

export const listSlideshowsTool = {
  name: 'list_slideshows',
  description: 'List recent slideshows',
  parameters: Type.Object({
    limit: Type.Optional(
      Type.Number({
        description: 'Maximum number to return (default: 50)',
        default: 50,
      }),
    ),
  }),
};

export const deleteSlideshowTool = {
  name: 'delete_slideshow',
  description: 'Delete a slideshow by ID',
  parameters: Type.Object({
    slideshowId: Type.String({
      description: 'Slideshow ID to delete',
    }),
  }),
};

// ============================================================================
// Tool Factory Functions
// ============================================================================

export function createGenerateSlideshowTool() {
  return {
    ...generateSlideshowTool,
    execute: async (_id: string, params: {
      prompt: string;
      slideCount?: number;
      aspectRatio?: '9:16' | '4:5' | '1:1' | '16:9';
      style?: 'tiktok' | 'instagram' | 'educational' | 'minimal';
      language?: string;
      timeout?: number;
    }) => {
      const result = await generateSlideshow({
        prompt: params.prompt,
        slideCount: params.slideCount ?? 5,
        aspectRatio: params.aspectRatio ?? '9:16',
        style: params.style ?? 'tiktok',
        language: params.language ?? 'en',
        timeout: params.timeout,
      });

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    },
  };
}

export function createGetSlideshowTool() {
  return {
    ...getSlideshowTool,
    execute: async (_id: string, params: { slideshowId: string }) => {
      const slideshow = await getSlideshow(params.slideshowId);
      if (!slideshow) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ error: 'Slideshow not found', slideshowId: params.slideshowId }, null, 2),
            },
          ],
        };
      }
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(slideshow, null, 2),
          },
        ],
      };
    },
  };
}

export function createListSlideshowsTool() {
  return {
    ...listSlideshowsTool,
    execute: async (_id: string, params: { limit?: number }) => {
      const slideshows = await listSlideshows(params.limit ?? 50);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ slideshows, total: slideshows.length }, null, 2),
          },
        ],
      };
    },
  };
}

export function createDeleteSlideshowTool() {
  return {
    ...deleteSlideshowTool,
    execute: async (_id: string, params: { slideshowId: string }) => {
      const deleted = await deleteSlideshow(params.slideshowId);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ success: deleted, slideshowId: params.slideshowId }, null, 2),
          },
        ],
      };
    },
  };
}
