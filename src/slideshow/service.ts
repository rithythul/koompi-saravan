/**
 * Slideshow Service
 *
 * High-level slideshow generation workflow using Gemini 2.0 Flash Exp
 * for image generation with text baked in.
 */

import { randomUUID } from 'crypto';
import { mkdir, writeFile, readdir, readFile } from 'fs/promises';
import { join } from 'path';
import { resolve as resolvePath } from 'path';

import { generateSlideContent, type SlideContent, type GenerateSlideContentOptions } from './ai-generator.js';
import { generateSlideImages, type GeneratedImage } from './image-generator.js';

const STORAGE_BASE_DIR = './var/slideshows';

export interface SlideshowConfig {
  id: string;
  prompt: string;
  slideCount: number;
  aspectRatio: '9:16' | '4:5' | '1:1' | '16:9';
  style: 'tiktok' | 'instagram' | 'educational' | 'minimal';
  language: string;
  status: 'pending' | 'generating' | 'completed' | 'failed';
  slides: SlideContent[];
  images: GeneratedImage[];
  outputDir: string;
  createdAt: string;
  updatedAt: string;
  error?: string;
}

export interface GenerateSlideshowOptions {
  prompt: string;
  slideCount?: number;
  aspectRatio?: '9:16' | '4:5' | '1:1' | '16:9';
  style?: 'tiktok' | 'instagram' | 'educational' | 'minimal';
  language?: string;
}

/**
 * Resolve a safe path within a base directory
 */
function resolveSafeAssetPath(base: string, ...parts: string[]): string {
  const resolved = resolvePath(base, ...parts);
  // Ensure the path is within the base directory
  if (!resolved.startsWith(resolvePath(base))) {
    throw new Error('Invalid path: outside base directory');
  }
  return resolved;
}

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
    const content = await readFile(configPath, 'utf-8');
    return JSON.parse(content) as SlideshowConfig;
  } catch {
    return null;
  }
}

/**
 * Generate slideshow with AI content and images
 */
export async function generateSlideshow(
  options: GenerateSlideshowOptions,
): Promise<{
  success: boolean;
  slideshowId: string;
  outputDir: string;
  slides: SlideContent[];
  images: GeneratedImage[];
  error?: string;
}> {
  const slideshowId = randomUUID();
  const outputDir = resolveSafeAssetPath(STORAGE_BASE_DIR, slideshowId);

  const slideCount = options.slideCount ?? 5;
  const aspectRatio = options.aspectRatio ?? '9:16';
  const style = options.style ?? 'tiktok';
  const language = options.language ?? 'en';

  const now = new Date().toISOString();

  try {
    // 1. Generate slide content via Gemini
    const slides = await generateSlideContent({
      prompt: options.prompt,
      slideCount,
      aspectRatio,
      style,
      language,
    });

    // 2. Create slideshow config
    const config: SlideshowConfig = {
      id: slideshowId,
      prompt: options.prompt,
      slideCount,
      aspectRatio,
      style,
      language,
      status: 'generating',
      slides,
      images: [],
      outputDir,
      createdAt: now,
      updatedAt: now,
    };
    await saveSlideshowConfig(config);

    // 3. Generate images for each slide (text is baked in)
    const imagePrompts = slides.map(s => s.imagePrompt);
    const images = await generateSlideImages(imagePrompts, outputDir, aspectRatio);

    if (images.length === 0) {
      throw new Error('Failed to generate any slide images');
    }

    // 4. Update config as completed
    config.status = 'completed';
    config.images = images;
    config.updatedAt = new Date().toISOString();
    await saveSlideshowConfig(config);

    return {
      success: true,
      slideshowId,
      outputDir,
      slides,
      images,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Save failed config
    try {
      const config: SlideshowConfig = {
        id: slideshowId,
        prompt: options.prompt,
        slideCount,
        aspectRatio,
        style,
        language,
        status: 'failed',
        slides: [],
        images: [],
        outputDir,
        createdAt: now,
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
      images: [],
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
    const entries = await readdir(STORAGE_BASE_DIR, { withFileTypes: true });

    const slideshows: SlideshowConfig[] = [];
    for (const entry of entries) {
      // eslint-disable-next-line @typescript-eslint/unbound-method
      if (entry.isFile() === false) {
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
