/**
 * Slideshow Renderer
 *
 * Renders slides to images using Playwright
 */

import { chromium } from 'playwright';
import { mkdir } from 'fs/promises';
import { join } from 'path';
import type { Slide, SlideshowConfig, Dimensions } from './types.js';
import { getDimensions } from './types.js';

const STYLE_FONTS: Record<string, { primary: string; fallback: string }> = {
  tiktok: { primary: 'Inter, system-ui, sans-serif', fallback: 'Arial, sans-serif' },
  instagram: { primary: 'SF Pro Display, -apple-system, sans-serif', fallback: 'Helvetica, sans-serif' },
  educational: { primary: 'Georgia, serif', fallback: 'Times New Roman, serif' },
  minimal: { primary: 'Inter, system-ui, sans-serif', fallback: 'Arial, sans-serif' },
};

function generateSlideHTML(
  slide: Slide,
  dimensions: Dimensions,
  style: string,
  imageUrl?: string,
): string {
  const fonts = STYLE_FONTS[style] || STYLE_FONTS.tiktok;
  const { width, height } = dimensions;

  // Background styles based on filter
  let backgroundStyle = '';
  let overlayStyle = '';

  if (imageUrl) {
    backgroundStyle = `background-image: url('${imageUrl}'); background-size: cover; background-position: center;`;

    switch (slide.backgroundFilter) {
      case 'darken':
        overlayStyle = 'background: linear-gradient(to top, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.3) 50%, rgba(0,0,0,0.1) 100%);';
        break;
      case 'blur':
        overlayStyle = 'background: rgba(255,255,255,0.1); backdrop-filter: blur(8px);';
        break;
      case 'gradient':
        overlayStyle = 'background: linear-gradient(135deg, rgba(99,102,241,0.6) 0%, rgba(168,85,247,0.6) 100%);';
        break;
      case 'none':
        overlayStyle = '';
        break;
    }
  } else {
    // Solid color or gradient background
    const hue = (slide.index * 60) % 360;
    backgroundStyle = `background: linear-gradient(135deg, hsl(${hue}, 70%, 50%) 0%, hsl(${hue + 40}, 70%, 40%) 100%);`;
  }

  // Text positioning
  let positionClass = 'items-center justify-center text-center';
  if (slide.textPosition === 'top') {
    positionClass = 'items-start justify-center text-center pt-16';
  } else if (slide.textPosition === 'bottom') {
    positionClass = 'items-end justify-center text-center pb-16';
  }

  // Text shadow for readability
  const textShadow = imageUrl
    ? 'text-shadow: 2px 2px 8px rgba(0,0,0,0.5), 0 0 20px rgba(0,0,0,0.3);'
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Slide ${slide.index + 1}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      width: ${width}px;
      height: ${height}px;
      overflow: hidden;
      font-family: ${fonts.primary}, ${fonts.fallback};
    }
    .slide {
      width: 100%;
      height: 100%;
      ${backgroundStyle}
      position: relative;
    }
    .overlay {
      position: absolute;
      inset: 0;
      ${overlayStyle}
    }
    .content {
      position: relative;
      z-index: 10;
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
      ${positionClass}
      padding: 40px;
    }
    .text {
      color: ${slide.textColor};
      ${textShadow}
      font-weight: 700;
      line-height: 1.2;
      max-width: 90%;
    }
    .headline {
      font-size: ${width < 800 ? 36 : width < 1000 ? 48 : 56}px;
      margin-bottom: 16px;
    }
    .subtext {
      font-size: ${width < 800 ? 20 : width < 1000 ? 24 : 28}px;
      font-weight: 400;
      opacity: 0.9;
      margin-top: 8px;
    }
    .slide-number {
      position: absolute;
      bottom: 20px;
      right: 20px;
      color: rgba(255,255,255,0.5);
      font-size: 14px;
      font-weight: 500;
    }
  </style>
</head>
<body>
  <div class="slide">
    <div class="overlay"></div>
    <div class="content">
      <div class="text headline">${escapeHtml(slide.text)}</div>
      ${slide.subtext ? `<div class="text subtext">${escapeHtml(slide.subtext)}</div>` : ''}
    </div>
    <div class="slide-number">${slide.index + 1}</div>
  </div>
</body>
</html>`;
}

function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}

async function ensureDirectory(dir: string): Promise<void> {
  try {
    await mkdir(dir, { recursive: true });
  } catch {
    // Directory might already exist
  }
}

/**
 * Render a single slide to an image file
 */
export async function renderSlide(
  slide: Slide,
  outputPath: string,
  dimensions: Dimensions,
  style: string,
  imageUrl?: string,
): Promise<void> {
  const html = generateSlideHTML(slide, dimensions, style, imageUrl);

  const browser = await chromium.launch({
    headless: true,
  });

  try {
    const context = await browser.newContext({
      viewport: { width: dimensions.width, height: dimensions.height },
      deviceScaleFactor: 2,
    });

    const page = await context.newPage();
    await page.setContent(html, { waitUntil: 'networkidle' });

    await page.screenshot({
      path: outputPath,
      type: 'png',
      quality: 95,
    });

    await context.close();
  } finally {
    await browser.close();
  }
}

/**
 * Render all slides in a slideshow configuration
 */
export async function renderSlideshow(
  config: SlideshowConfig,
  imageUrls?: string[][],
): Promise<string[]> {
  const outputDir = config.outputDir;
  await ensureDirectory(outputDir);

  const dimensions = getDimensions(config.aspectRatio);
  const renderedPaths: string[] = [];

  for (const slide of config.slides) {
    const filename = `slide-${String(slide.index).padStart(3, '0')}.png`;
    const outputPath = join(outputDir, filename);

    // Get image URL for this slide if provided
    const imageUrl = imageUrls?.[slide.index]?.[0];

    await renderSlide(
      slide,
      outputPath,
      dimensions,
      config.style,
      imageUrl,
    );

    slide.generatedImagePath = outputPath;
    renderedPaths.push(outputPath);
  }

  return renderedPaths;
}

/**
 * Generate HTML preview for a slide (for web preview)
 */
export function generateSlidePreviewHTML(
  slide: Slide,
  style: string,
  imageUrl?: string,
): string {
  const dimensions = { width: 540, height: 960 }; // Smaller preview dimensions
  return generateSlideHTML(slide, dimensions, style, imageUrl);
}
