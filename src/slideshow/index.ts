/**
 * Slideshow Module
 *
 * AI-powered slideshow generation for social media
 * Uses Gemini Flash for content and Nano Banana for image generation
 */

// Content and image generation
export * from './ai-generator.js';
export * from './image-generator.js';

// High-level orchestration (use this for API/tool integration)
export * from './orchestrator.js';

// Internal utilities (not typically used directly)
export { getDimensions, type Dimensions, type AspectRatio, type SlideStyle } from './types.js';
