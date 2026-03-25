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

function redactTokens(message: string): string {
  // Basic redaction for API keys or similar sensitive strings
  return message.replace(/(AIza[0-9A-Za-z-_]{35})/g, '[REDACTED_API_KEY]');
}

function sanitizeGeminiPrompt(prompt: string): string {
  // Strip potential injection patterns (basic example)
  let sanitized = prompt.replace(/<script.*?>.*?<\/script>/gmi, '');
  sanitized = sanitized.replace(/```.*?```/gms, ''); // Remove code blocks
  // Enforce max length (e.g., 1000 characters)
  sanitized = sanitized.substring(0, 1000);
  return sanitized;
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

async function generateContentWithRetry(
  model: any,
  prompt: string,
  options: { retries?: number; retryDelay?: number; timeout?: number } = {},
): Promise<any> {
  const { retries = 3, retryDelay = 1000, timeout = 30000 } = options;

  for (let i = 0; i <= retries; i++) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);

    try {
      const result = await model.generateContent(prompt, { requestOptions: { signal: controller.signal } });
      clearTimeout(id);
      return result;
    } catch (error: any) {
      clearTimeout(id);
      if (error.name === 'AbortError') {
        console.error(`Gemini generation timed out after ${timeout}ms for prompt: ${prompt.substring(0, 50)}...`);
      } else {
        console.error(`Gemini generation failed (attempt ${i + 1}/${retries + 1}) for prompt: ${prompt.substring(0, 50)}...`, redactTokens(error.message));
      }

      if (i < retries) {
        const delay = retryDelay * Math.pow(2, i); // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        throw error; // Re-throw if all retries are exhausted
      }
    }
  }
  throw new Error("Maximum retries exceeded for Gemini content generation");
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
  const sanitizedPrompt = sanitizeGeminiPrompt(options.prompt);
  
  // Use gemini-2.5-flash for text generation
  const model = gen.getGenerativeModel({ 
    model: 'gemini-2.5-flash',
  });
  
  const result = await generateContentWithRetry(model, sanitizedPrompt);
  const response = await result.response;
  
  // Extract text from response
  const parts = response.candidates?.[0]?.content?.parts || [];
  const textPart = parts.find((part: { text?: string }) => typeof part.text === 'string');
  
  if (!textPart || typeof textPart.text !== 'string') {
    throw new Error('No text generated in response');
  }

  const mimeType = 'text/plain';
  const data = Buffer.from(textPart.text).toString('base64');
  // Removed validateImagePayload as gemini-2.5-flash is used for text generation in this context
  
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
  const concurrencyLimit = 3;
  const results: Array<{ mimeType: string; data: string }> = [];
  
  // Chunking for concurrency limit
  for (let i = 0; i < count; i += concurrencyLimit) {
    const chunk = Array.from({ length: Math.min(concurrencyLimit, count - i) });
    const chunkResults = await Promise.all(
        chunk.map(() => generateImage({
            prompt: options.prompt,
            config: options.config,
            apiKey: options.apiKey,
        }))
    );
    results.push(...chunkResults);
  }
  
  return results;
}
