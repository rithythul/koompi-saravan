/**
 * Slideshow Generator - AI-Powered Content Creation
 *
 * Generates slideshow content and renders images using Gemini AI and Playwright
 */

import { randomUUID } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { Type } from '@sinclair/typebox';

import { generateSlideContent, createSlideshowConfig, renderSlideshow, type SlideshowConfig, type GenerateSlideshowOptions, type Slide } from '../../../src/slideshow/index.js';
import { generateImages } from '../lib/gemini-client.js';
import { createRunOutputPaths, resolveSafeAssetPath } from '../lib/output-paths.js';
import { createRun, initStore, saveGeneratedAsset, updateRunStatus } from '../lib/store.js';

const STORAGE_BASE_DIR = './var/slideshows';

/**
 * Store slideshow configuration to disk
 */
async function saveSlideshowConfig(config: SlideshowConfig): Promise<void> {
  const configPath = join(config.outputDir, 'slideshow.json');
  await mkdir(config.outputDir, { recursive: true });
  await writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
}

/**
 * Load slideshow configuration from disk
 */
async function loadSlideshowConfig(slideshowId: string, baseDir: string = STORAGE_BASE_DIR): Promise<SlideshowConfig | null> {
  try {
    const configPath = join(baseDir, slideshowId, 'slideshow.json');
    const { readFile } = await import('fs/promises');
    const content = await readFile(configPath, 'utf-8');
    return JSON.parse(content) as SlideshowConfig;
  } catch {
    return null;
  }
}

/**
 * Get image pack images
 */
async function getPackImages(packId: string): Promise<string[]> {
  // Try to load from pack manager
  try {
    const { getPack } = await import('./pack-manager.js');
    const pack = await getPack(packId, { packsDir: './var/packs' });
    return pack?.images.map(img => img.url) ?? [];
  } catch {
    return [];
  }
}

/**
 * Generate slideshow with AI content and optional AI images
 */
export async function generateSlideshow(
  options: GenerateSlideshowOptions & { config?: any },
): Promise<{
  success: boolean;
  slideshowId: string;
  outputDir: string;
  slides: Slide[];
  imagePaths: string[];
  error?: string;
}> {
  const slideshowId = randomUUID();
  const outputDir = resolveSafeAssetPath(STORAGE_BASE_DIR, slideshowId);

  const slideCount = options.slideCount ?? 5;
  const useAiImages = options.useAiImages ?? true;
  const packId = options.packId;

  try {
    // 1. Generate slide content via Gemini
    const slides = await generateSlideContent({
      prompt: options.prompt,
      slideCount,
      style: options.style ?? 'tiktok',
      language: options.language ?? 'en',
    });

    // 2. Create slideshow config
    const config = createSlideshowConfig(
      {
        ...options,
        slideCount,
        useAiImages,
        packId,
      },
      slides,
      outputDir,
    );
    config.status = 'generating';
    await saveSlideshowConfig(config);

    // 3. Generate images if needed
    const imageUrls: string[][] = [];

    if (useAiImages && !packId) {
      // Generate images via Gemini for each slide
      config.status = 'rendering';
      await saveSlideshowConfig(config);

      for (const slide of slides) {
        try {
          const images = await generateImages({
            prompt: slide.imagePrompt,
            count: 1,
          });

          if (images.length > 0) {
            const imageBuffer = Buffer.from(images[0].data, 'base64');
            const imagePath = resolveSafeAssetPath(outputDir, `slide-${String(slide.index).padStart(3, '0')}-bg.png`);
            await mkdir(outputDir, { recursive: true });
            await writeFile(imagePath, imageBuffer);
            imageUrls[slide.index] = [imagePath];
            slide.generatedImagePath = imagePath;
          }
        } catch (error) {
          console.error(`Failed to generate image for slide ${slide.index}:`, error);
          // Continue without image for this slide
        }
      }
    } else if (packId) {
      // Use images from pack
      const packImages = await getPackImages(packId);
      for (let i = 0; i < slides.length; i++) {
        if (packImages.length > 0) {
          // Cycle through pack images
          const imgUrl = packImages[i % packImages.length];
          imageUrls[i] = [imgUrl];
        }
      }
    }

    // 4. Render slides with text overlays
    const renderedPaths = await renderSlideshow(config, imageUrls.length > 0 ? imageUrls : undefined);

    // 5. Update config as completed
    config.status = 'completed';
    config.renderedUrls = renderedPaths;
    await saveSlideshowConfig(config);

    return {
      success: true,
      slideshowId,
      outputDir,
      slides,
      imagePaths: renderedPaths,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Save failed config
    try {
      const config: SlideshowConfig = {
        id: slideshowId,
        prompt: options.prompt,
        slideCount,
        aspectRatio: options.aspectRatio ?? '9:16',
        style: options.style ?? 'tiktok',
        language: options.language ?? 'en',
        useAiImages,
        packId,
        backgroundFilter: options.backgroundFilter ?? 'darken',
        slides: [],
        status: 'failed',
        outputDir,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        error: errorMessage,
      };
      await saveSlideshowConfig(config);
    } catch {
      // Ignore save errors
    }

    return {
      success: false,
      slideshowId,
      outputDir,
      slides: [],
      imagePaths: [],
      error: errorMessage,
    };
  }
}

/**
 * Get slideshow status and result
 */
export async function getSlideshow(slideshowId: string): Promise<SlideshowConfig | null> {
  return loadSlideshowConfig(slideshowId, STORAGE_BASE_DIR);
}

/**
 * List recent slideshows
 */
export async function listSlideshows(limit: number = 20): Promise<SlideshowConfig[]> {
  try {
    const { readdir } = await import('fs/promises');
    const entries = await readdir(STORAGE_BASE_DIR, { withFileTypes: true });

    const slideshows: SlideshowConfig[] = [];
    for (const entry of entries) {
      if (entry.isDirectory) {
        const config = await loadSlideshowConfig(entry.name, STORAGE_BASE_DIR);
        if (config) {
          slideshows.push(config);
        }
      }
    }

    // Sort by creation date, newest first
    slideshows.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return slideshows.slice(0, limit);
  } catch {
    return [];
  }
}

// ============================================================================
// OpenClaw Tool Definitions
// ============================================================================

export const generateSlideshowTool = {
  name: 'generate_slideshow',
  description: 'Generate an AI-powered slideshow for social media. Creates engaging slide content with text and images, ready for TikTok, Instagram, or other platforms.',
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
    useAiImages: Type.Optional(
      Type.Boolean({
        description: 'Generate AI images for each slide (default: true)',
        default: true,
      }),
    ),
    packId: Type.Optional(
      Type.String({
        description: 'Optional image pack ID to use instead of AI-generated images',
      }),
    ),
    backgroundFilter: Type.Optional(
      Type.Union([
        Type.Literal('none'),
        Type.Literal('darken'),
        Type.Literal('blur'),
        Type.Literal('gradient'),
      ], {
        description: 'Background filter for text readability (default: darken)',
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

export function createGenerateSlideshowTool(config: any = {}) {
  return {
    ...generateSlideshowTool,
    execute: async (params: any) => {
      const result = await generateSlideshow({
        prompt: params.prompt,
        slideCount: params.slideCount,
        aspectRatio: params.aspectRatio,
        style: params.style,
        language: params.language,
        useAiImages: params.useAiImages,
        packId: params.packId,
        backgroundFilter: params.backgroundFilter,
        config,
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

export function createGetSlideshowTool(config: any = {}) {
  return {
    ...getSlideshowTool,
    execute: async (params: any) => {
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

export function createListSlideshowsTool(config: any = {}) {
  return {
    ...listSlideshowsTool,
    execute: async (params: any) => {
      const slideshows = await listSlideshows(params.limit);
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
