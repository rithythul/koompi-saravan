/**
 * Slideshow Module
 *
 * AI-powered slideshow generation for social media
 * Uses Gemini Flash for content and Nano Banana for image generation
 */

export * from './ai-generator.js';
export * from './image-generator.js';
export * from './service.js';
export * from './orchestrator.js';

export type { SlideshowConfig, GenerateSlideshowOptions } from './service.js';
export type { SlideContent, GenerateSlideContentOptions } from './ai-generator.js';
export type { ImageGenerationOptions, GeneratedImage } from './image-generator.js';
export type {
  GenerateSlideshowRequest,
  SlideResult,
  GenerateSlideshowResult,
  SlideshowManifest
} from './orchestrator.js';
