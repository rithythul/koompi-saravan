/**
 * Image Generator
 *
 * Generates slide images using Gemini Nano Banana.
 * Each image has text baked in - no separate text overlay needed.
 */

import { randomUUID } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { GoogleGenerativeAI } from '@google/generative-ai';

export interface ImageGenerationOptions {
  imagePrompt: string;
  outputDir: string;
  slideIndex: number;
  aspectRatio: '9:16' | '4:5' | '1:1' | '16:9';
  timeout?: number;
}

export interface GeneratedImage {
  slideIndex: number;
  imagePath: string;
  mimeType: string;
  fileSize: number;
}

const ASPECT_RATIO_DIMENSIONS: Record<string, { width: number; height: number }> = {
  '9:16': { width: 1080, height: 1920 },
  '4:5': { width: 1080, height: 1350 },
  '1:1': { width: 1080, height: 1080 },
  '16:9': { width: 1920, height: 1080 },
};

function getGeminiClient(): GoogleGenerativeAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is required for image generation');
  }
  return new GoogleGenerativeAI(apiKey);
}

/**
 * Generate a single slide image using Gemini
 */
export async function generateSlideImage(options: ImageGenerationOptions): Promise<GeneratedImage> {
  const { imagePrompt, outputDir, slideIndex, aspectRatio, timeout = 60000 } = options;
  const client = getGeminiClient();

  const dimensions = ASPECT_RATIO_DIMENSIONS[aspectRatio];
  const enhancedPrompt = `${imagePrompt}

Image specifications:
- Dimensions: ${dimensions.width}x${dimensions.height}px
- Aspect ratio: ${aspectRatio}
- High quality, sharp details
- Text must be clearly readable
- Professional social media quality`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const model = client.getGenerativeModel({
      model: 'gemini-2.0-flash-exp',
    });

    const result = await model.generateContent(enhancedPrompt);
    clearTimeout(timeoutId);

    const response = await result.response;
    const parts = response.candidates?.[0]?.content?.parts || [];

    // Look for inline data (image) in the response
    const imagePart = parts.find((part: any) => part.inlineData);

    if (!imagePart || !imagePart.inlineData) {
      throw new Error('No image data in Gemini response');
    }

    const { data, mimeType } = imagePart.inlineData;

    if (!data) {
      throw new Error('Empty image data from Gemini');
    }

    // Ensure output directory exists
    await mkdir(outputDir, { recursive: true });

    // Determine file extension
    const ext = mimeType === 'image/jpeg' ? '.jpg' : mimeType === 'image/webp' ? '.webp' : '.png';
    const filename = `slide-${String(slideIndex).padStart(3, '0')}${ext}`;
    const imagePath = join(outputDir, filename);

    // Write image to disk
    const buffer = Buffer.from(data, 'base64');
    await writeFile(imagePath, buffer);

    return {
      slideIndex,
      imagePath,
      mimeType: mimeType || 'image/png',
      fileSize: buffer.length,
    };
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Image generation timed out after ${timeout}ms for slide ${slideIndex}`);
    }
    throw error;
  }
}

/**
 * Generate multiple slide images in parallel
 */
export async function generateSlideImages(
  imagePrompts: string[],
  outputDir: string,
  aspectRatio: '9:16' | '4:5' | '1:1' | '16:9',
  timeout: number = 60000,
): Promise<GeneratedImage[]> {
  // Use Promise.allSettled to avoid failing all images if one fails
  const results = await Promise.allSettled(
    imagePrompts.map((prompt, index) =>
      generateSlideImage({
        imagePrompt: prompt,
        outputDir,
        slideIndex: index,
        aspectRatio,
        timeout,
      })
    )
  );

  const generated: GeneratedImage[] = [];
  const failures: number[] = [];

  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      generated.push(result.value);
    } else {
      failures.push(index);
      console.error(`Failed to generate image for slide ${index}:`, result.reason);
    }
  });

  if (failures.length > 0) {
    console.warn(`Failed to generate ${failures.length} of ${imagePrompts.length} slide images`);
  }

  return generated;
}

