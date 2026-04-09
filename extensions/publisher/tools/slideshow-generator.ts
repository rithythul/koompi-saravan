/**
 * Slideshow Generator - AI-Powered Content Creation
 *
 * Generates slideshow content and images using Gemini AI.
 * Uses the new orchestrator: Gemini Flash for text, Nano Banana for images.
 */

import { Type } from '@sinclair/typebox';

import {
  generateSlideshow as orchestratorGenerate,
  getSlideshow as orchestratorGet,
  listSlideshows as orchestratorList,
  type GenerateSlideshowRequest,
} from '../../../src/slideshow/index.js';

// ============================================================================
// OpenClaw Tool Definitions
// ============================================================================

export const generateSlideshowTool = {
  name: 'generate_slideshow',
  description: 'Generate an AI-powered slideshow for social media. Creates engaging slide content with text baked into AI-generated images, ready for TikTok, Instagram, or other platforms.',
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
        description: 'Content language (default: en)',
        default: 'en',
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
        description: 'Maximum number to return (default: 20)',
        default: 20,
      }),
    ),
  }),
};

// ============================================================================
// Tool Factory Functions
// ============================================================================

export function createGenerateSlideshowTool() {
  return {
    ...generateSlideshowTool,
    execute: async (_toolCallId: string, params: unknown) => {
      const p = params as GenerateSlideshowRequest;
      const result = await orchestratorGenerate({
        prompt: p.prompt,
        slideCount: p.slideCount ?? 5,
        aspectRatio: p.aspectRatio ?? '9:16',
        style: p.style ?? 'tiktok',
        language: p.language ?? 'en',
      });
      return {
        role: 'tool' as const,
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    },
  };
}

export function createGetSlideshowTool() {
  return {
    ...getSlideshowTool,
    execute: async (_toolCallId: string, params: unknown) => {
      const { slideshowId } = params as { slideshowId: string };
      const slideshow = await orchestratorGet(slideshowId);
      return {
        role: 'tool' as const,
        content: [{ type: 'text' as const, text: JSON.stringify(slideshow ?? { error: 'Not found' }, null, 2) }],
      };
    },
  };
}

export function createListSlideshowsTool() {
  return {
    ...listSlideshowsTool,
    execute: async (_toolCallId: string, params: unknown) => {
      const { limit } = params as { limit?: number };
      const slideshows = await orchestratorList(limit ?? 20);
      return {
        role: 'tool' as const,
        content: [{ type: 'text' as const, text: JSON.stringify({ slideshows, total: slideshows.length }, null, 2) }],
      };
    },
  };
}
