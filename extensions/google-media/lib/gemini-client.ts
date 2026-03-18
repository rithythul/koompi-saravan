/**
 * Shared Gemini API client for Google Media tools
 */

import { GoogleGenerativeAI } from '@google/generative-ai';

let client: GoogleGenerativeAI | null = null;

export function getGeminiClient(apiKey?: string): GoogleGenerativeAI {
  if (client) return client;
  
  const key = apiKey || process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error('GEMINI_API_KEY not set. Pass apiKey or set environment variable.');
  }
  
  client = new GoogleGenerativeAI(key);
  return client;
}

/**
 * Generate an image using Gemini's image generation capability
 */
export async function generateImage(options: {
  prompt: string;
  width?: number;
  height?: number;
  apiKey?: string;
}): Promise<{ mimeType: string; data: string }> {
  const gen = getGeminiClient(options.apiKey);
  
  // Use gemini-2.0-flash-exp for image generation
  const model = gen.getGenerativeModel({ 
    model: 'gemini-2.0-flash-exp',
    generationConfig: {
      responseModalities: ['image', 'text'],
    }
  });
  
  const result = await model.generateContent(options.prompt);
  const response = await result.response;
  
  // Extract image from response
  const parts = response.candidates?.[0]?.content?.parts || [];
  const imagePart = parts.find(p => p.inlineData?.mimeType?.startsWith('image/'));
  
  if (!imagePart?.inlineData) {
    throw new Error('No image generated in response');
  }
  
  return {
    mimeType: imagePart.inlineData.mimeType || 'image/png',
    data: imagePart.inlineData.data || '',
  };
}

/**
 * Generate multiple images
 */
export async function generateImages(options: {
  prompt: string;
  count?: number;
  width?: number;
  height?: number;
  apiKey?: string;
}): Promise<Array<{ mimeType: string; data: string }>> {
  const count = options.count || 1;
  const results = [];
  
  for (let i = 0; i < count; i++) {
    const image = await generateImage(options);
    results.push(image);
  }
  
  return results;
}
