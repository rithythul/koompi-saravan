/**
 * Shared Gemini API client for Google Media tools
 */

import { GoogleGenerativeAI } from '@google/generative-ai';

import { loadConfig, requireGeminiApiKey, type GoogleMediaConfigInput } from './config.js';

const IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const clientsByKey = new Map<string, GoogleGenerativeAI>();

export function getGeminiClient(
  configOverrides: GoogleMediaConfigInput = {},
  apiKeyOverride?: string,
): GoogleGenerativeAI {
  const config = loadConfig(configOverrides);
  const apiKey = requireGeminiApiKey(config, apiKeyOverride);

  const existing = clientsByKey.get(apiKey);
  if (existing) {
    return existing;
  }

  const client = new GoogleGenerativeAI(apiKey);
  clientsByKey.set(apiKey, client);
  return client;
}

function validateImagePayload(mimeType: string, data: string): void {
  if (!IMAGE_MIME_TYPES.has(mimeType)) {
    throw new Error(`Unsupported image MIME type returned by Gemini: ${mimeType}`);
  }

  const buffer = Buffer.from(data, 'base64');
  if (buffer.byteLength === 0) {
    throw new Error('Gemini returned an empty image payload.');
  }

  if (buffer.byteLength > MAX_IMAGE_BYTES) {
    throw new Error(`Gemini returned an image larger than ${MAX_IMAGE_BYTES} bytes.`);
  }
}

/**
 * Generate an image using Gemini's image generation capability
 */
export async function generateImage(options: {
  prompt: string;
  config?: GoogleMediaConfigInput;
  apiKey?: string;
}): Promise<{ mimeType: string; data: string }> {
  const gen = getGeminiClient(options.config, options.apiKey);
  
  // Use gemini-2.0-flash-exp for image generation
  const model = gen.getGenerativeModel({ 
    model: 'gemini-2.0-flash-exp',
    generationConfig: {
      responseModalities: ['image', 'text'],
    } as never,
  });
  
  const result = await model.generateContent(options.prompt);
  const response = await result.response;
  
  // Extract image from response
  const parts = response.candidates?.[0]?.content?.parts || [];
  const imagePart = parts.find((part) => Boolean(part.inlineData?.mimeType?.startsWith('image/')));
  
  if (!imagePart?.inlineData) {
    throw new Error('No image generated in response');
  }

  const mimeType = imagePart.inlineData.mimeType || 'image/png';
  const data = imagePart.inlineData.data || '';
  validateImagePayload(mimeType, data);
  
  return {
    mimeType,
    data,
  };
}

/**
 * Generate multiple images
 */
export async function generateImages(options: {
  prompt: string;
  count?: number;
  config?: GoogleMediaConfigInput;
  apiKey?: string;
}): Promise<Array<{ mimeType: string; data: string }>> {
  const count = options.count || 1;
  const results: Array<{ mimeType: string; data: string }> = [];
  
  for (let i = 0; i < count; i++) {
    const image = await generateImage({
      prompt: options.prompt,
      config: options.config,
      apiKey: options.apiKey,
    });
    results.push(image);
  }
  
  return results;
}
