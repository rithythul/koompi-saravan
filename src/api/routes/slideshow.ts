/**
 * Slideshow Routes
 *
 * POST /api/slideshow/generate - Generate a new slideshow
 * GET /api/slideshow/:id - Get slideshow status/result
 * GET /api/slideshow/list - List recent slideshows
 * DELETE /api/slideshow/:id - Delete a slideshow
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { Bindings } from '../types.js';
import {
  generateSlideshow,
  getSlideshow,
  listSlideshows,
  deleteSlideshow,
  type GenerateSlideshowRequest,
  type SlideshowManifest,
} from '../../slideshow/index.js';
import { z } from 'zod';

const app = new Hono<{ Bindings: Bindings }>();

// Validation schemas
const generateSlideshowSchema = z.object({
  prompt: z.string().min(5).max(500),
  slideCount: z.number().min(1).max(10).optional().default(5),
  aspectRatio: z.enum(['9:16', '4:5', '1:1', '16:9']).optional().default('9:16'),
  style: z.enum(['tiktok', 'instagram', 'educational', 'minimal']).optional().default('tiktok'),
  language: z.string().optional().default('en'),
  timeout: z.number().optional().default(60000),
});

/**
 * POST /api/slideshow/generate
 */
app.post('/generate', zValidator('json', generateSlideshowSchema), async (c) => {
  try {
    const body = c.req.valid('json');

    const request: GenerateSlideshowRequest = {
      prompt: body.prompt,
      slideCount: body.slideCount,
      aspectRatio: body.aspectRatio,
      style: body.style,
      language: body.language,
      timeout: body.timeout,
    };

    const result = await generateSlideshow(request);

    if (result.success) {
      return c.json({
        success: true,
        id: result.id,
        outputDir: result.outputDir,
        slideCount: result.slides.length,
        slides: result.slides.map(s => ({
          index: s.index,
          headline: s.headline,
          subtext: s.subtext,
          imagePath: s.imagePath,
          slideType: s.slideType,
        })),
        generatedAt: result.generatedAt,
      });
    } else {
      return c.json({
        success: false,
        error: result.error,
        id: result.id,
      }, 500);
    }
  } catch (error) {
    console.error('Slideshow generation error:', error);
    return c.json({
      error: 'Generation Failed',
      message: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});

/**
 * GET /api/slideshow/:id
 */
app.get('/:id', async (c) => {
  const slideshowId = c.req.param('id');

  if (!slideshowId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slideshowId)) {
    return c.json({ error: 'Validation Error', message: 'slideshowId must be a valid UUID' }, 400);
  }

  const result = await getSlideshow(slideshowId);

  if (!result) {
    return c.json({ error: 'Not Found', message: 'Slideshow not found', slideshowId }, 404);
  }

  return c.json({
    id: result.id,
    success: result.success,
    outputDir: result.outputDir,
    slideCount: result.slides.length,
    slides: result.slides.map(s => ({
      index: s.index,
      headline: s.headline,
      subtext: s.subtext,
      imagePath: s.imagePath,
      slideType: s.slideType,
    })),
    generatedAt: result.generatedAt,
    error: result.error,
  });
});

/**
 * GET /api/slideshow/list
 */
app.get('/list', async (c) => {
  const limit = parseInt(c.req.query('limit') || '20');
  const slideshows = await listSlideshows(limit);

  return c.json({
    slideshows: slideshows.map((s: SlideshowManifest) => ({
      id: s.id,
      prompt: s.prompt,
      slideCount: s.slideCount,
      aspectRatio: s.aspectRatio,
      style: s.style,
      language: s.language,
      imageCount: s.generated.length,
      createdAt: s.createdAt,
    })),
    total: slideshows.length,
  });
});

/**
 * DELETE /api/slideshow/:id
 */
app.delete('/:id', async (c) => {
  const slideshowId = c.req.param('id');

  if (!slideshowId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slideshowId)) {
    return c.json({ error: 'Validation Error', message: 'slideshowId must be a valid UUID' }, 400);
  }

  const deleted = await deleteSlideshow(slideshowId);

  if (!deleted) {
    return c.json({ error: 'Not Found', message: 'Slideshow not found or could not be deleted', slideshowId }, 404);
  }

  return c.json({
    success: true,
    message: 'Slideshow deleted successfully',
    slideshowId,
  });
});

export default app;
