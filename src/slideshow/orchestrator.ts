/**
 * Slideshow Orchestrator
 *
 * Coordinates AI content generation and image generation
 * to produce complete slideshows with text baked into images.
 */

import { randomUUID } from 'crypto';
import { mkdir, writeFile, readFile, readdir, rm } from 'fs/promises';
import { join } from 'path';

import { generateSlideContent, generateFallbackSlides, type SlideContent } from './ai-generator.js';
import { generateSlideImages, type GeneratedImage } from './image-generator.js';

export interface GenerateSlideshowRequest {
  prompt: string;
  slideCount: number;
  aspectRatio: '9:16' | '4:5' | '1:1' | '16:9';
  style: 'tiktok' | 'instagram' | 'educational' | 'minimal';
  language?: string;
  outputDir?: string;
  timeout?: number;
}

export interface SlideResult {
  index: number;
  headline: string;
  subtext?: string;
  imagePrompt: string;
  imagePath?: string;
  imageUrl?: string;
  slideType: 'hook' | 'reveal' | 'fact' | 'list-item' | 'cta';
  style: string;
}

export interface GenerateSlideshowResult {
  id: string;
  slides: SlideResult[];
  manifest: SlideContent[];
  outputDir: string;
  success: boolean;
  error?: string;
  generatedAt: string;
}

export interface SlideshowManifest {
  id: string;
  prompt: string;
  slideCount: number;
  aspectRatio: string;
  style: string;
  language: string;
  slides: SlideContent[];
  generated: SlideResult[];
  outputDir: string;
  createdAt: string;
}

const DEFAULT_OUTPUT_DIR = './var/slideshows';

/**
 * Generate a complete slideshow
 */
export async function generateSlideshow(request: GenerateSlideshowRequest): Promise<GenerateSlideshowResult> {
  const id = randomUUID();
  const outputDir = request.outputDir ?? join(DEFAULT_OUTPUT_DIR, id);
  const timeout = request.timeout ?? 60000;

  const generatedAt = new Date().toISOString();

  try {
    // Ensure output directory exists
    await mkdir(outputDir, { recursive: true });

    // Step 1: Generate slide content via Gemini Flash
    let slideContents: SlideContent[];
    try {
      slideContents = await generateSlideContent({
        prompt: request.prompt,
        slideCount: request.slideCount,
        aspectRatio: request.aspectRatio,
        style: request.style,
        language: request.language ?? 'en',
      });
    } catch (error) {
      console.error('AI content generation failed, using fallback:', error);
      slideContents = generateFallbackSlides({
        prompt: request.prompt,
        slideCount: request.slideCount,
        aspectRatio: request.aspectRatio,
        style: request.style,
        language: request.language ?? 'en',
      });
    }

    // Step 2: Generate images via Nano Banana (parallel)
    const imagePrompts = slideContents.map(s => s.imagePrompt);
    const generatedImages = await generateSlideImages(
      imagePrompts,
      outputDir,
      request.aspectRatio,
      timeout,
    );

    // Step 3: Map images to slides
    const imageMap = new Map(generatedImages.map(img => [img.slideIndex, img]));

    const slides: SlideResult[] = slideContents.map((content, index) => {
      const imageData = imageMap.get(index);
      return {
        index,
        headline: content.headline,
        subtext: content.subtext,
        imagePrompt: content.imagePrompt,
        imagePath: imageData?.imagePath,
        slideType: content.slideType,
        style: content.style,
      };
    });

    // Step 4: Save manifest
    const manifest: SlideshowManifest = {
      id,
      prompt: request.prompt,
      slideCount: request.slideCount,
      aspectRatio: request.aspectRatio,
      style: request.style,
      language: request.language ?? 'en',
      slides: slideContents,
      generated: slides,
      outputDir,
      createdAt: generatedAt,
    };

    await saveManifest(manifest, outputDir);

    return {
      id,
      slides,
      manifest: slideContents,
      outputDir,
      success: true,
      generatedAt,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Save failed manifest
    try {
      const failedManifest: Partial<SlideshowManifest> = {
        id,
        prompt: request.prompt,
        slideCount: request.slideCount,
        aspectRatio: request.aspectRatio,
        style: request.style,
        language: request.language ?? 'en',
        slides: [],
        generated: [],
        outputDir,
        createdAt: generatedAt,
      };
      await saveManifest(failedManifest as SlideshowManifest, outputDir);
    } catch {
      // Ignore save errors
    }

    return {
      id,
      slides: [],
      manifest: [],
      outputDir,
      success: false,
      error: errorMessage,
      generatedAt,
    };
  }
}

/**
 * Save slideshow manifest to disk
 */
async function saveManifest(manifest: SlideshowManifest, outputDir: string): Promise<void> {
  const manifestPath = join(outputDir, 'manifest.json');
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
}

/**
 * Load slideshow manifest from disk
 */
export async function loadSlideshowManifest(id: string): Promise<SlideshowManifest | null> {
  try {
    const manifestPath = join(DEFAULT_OUTPUT_DIR, id, 'manifest.json');
    const content = await readFile(manifestPath, 'utf-8');
    return JSON.parse(content) as SlideshowManifest;
  } catch {
    return null;
  }
}

/**
 * List all slideshows
 */
export async function listSlideshows(limit = 50): Promise<SlideshowManifest[]> {
  try {
    const entries = await readdir(DEFAULT_OUTPUT_DIR, { withFileTypes: true });

    const slideshows: SlideshowManifest[] = [];
    for (const entry of entries) {
      // eslint-disable-next-line @typescript-eslint/unbound-method
      if (entry.isDirectory) {
        const manifest = await loadSlideshowManifest(entry.name);
        if (manifest) {
          slideshows.push(manifest);
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

/**
 * Get slideshow by ID
 */
export async function getSlideshow(id: string): Promise<GenerateSlideshowResult | null> {
  const manifest = await loadSlideshowManifest(id);
  if (!manifest) {
    return null;
  }

  return {
    id: manifest.id,
    slides: manifest.generated,
    manifest: manifest.slides,
    outputDir: manifest.outputDir,
    success: manifest.generated.length > 0,
    generatedAt: manifest.createdAt,
  };
}

/**
 * Delete slideshow by ID
 */
export async function deleteSlideshow(id: string): Promise<boolean> {
  try {
    const slideshowDir = join(DEFAULT_OUTPUT_DIR, id);
    await rm(slideshowDir, { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
}
