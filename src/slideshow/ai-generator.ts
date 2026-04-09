/**
 * AI Slide Content Generator
 *
 * Generates slide content using Gemini Flash API.
 * Each slide includes a detailed image prompt with text baked in.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';

export interface SlideContent {
  index: number;
  headline: string;
  subtext?: string;
  imagePrompt: string;
  slideType: 'hook' | 'reveal' | 'fact' | 'list-item' | 'cta';
  style: string;
}

export interface GenerateSlideContentOptions {
  prompt: string;
  slideCount: number;
  aspectRatio: '9:16' | '4:5' | '1:1' | '16:9';
  style: 'tiktok' | 'instagram' | 'educational' | 'minimal';
  language?: string;
}

const STYLE_PRESETS: Record<string, string> = {
  tiktok: 'Bold sans-serif text, vibrant colors, dark or gradient background, modern social media carousel style, high contrast text overlay, viral aesthetic',
  instagram: 'Clean aesthetic, soft colors, minimalist layout, lifestyle photography style, elegant typography, premium feel',
  educational: 'Professional layout, clean typography, infographic style, trustworthy colors, structured information, academic presentation',
  minimal: 'Lots of whitespace, single accent color, ultra-clean typography, Scandinavian design aesthetic, simple composition',
};

const NARRATIVE_ARC_PROMPT = `Structure the content using a proven viral narrative arc:
- Slide 1: HOOK - Grab attention immediately with a provocative statement, question, or surprising fact
- Slide 2: PROBLEM/CONTEXT - Identify the pain point, curiosity gap, or set the scene
- Slide 3: SHIFT/REVELATION - The insight, "aha" moment, or key information
- Slide 4: PROOF/EXAMPLE - Evidence, examples, or actionable steps
- Slide 5: CTA - Call to action or closing thought that inspires engagement

For more than 5 slides, expand the middle sections with additional examples or steps.`;

const PLATFORM_GUIDELINES: Record<string, string> = {
  tiktok: 'TikTok photo carousel: vertical 9:16 format, fast-paced visual storytelling, bold typography that pops on small screens, use trending visual motifs.',
  instagram: 'Instagram carousel: square or vertical format, polished aesthetic, cohesive color palette, typography that matches brand voice, use negative space effectively.',
  educational: 'Educational content: clear hierarchy, readable fonts, data visualization when relevant, trustworthy color scheme, focus on clarity over flashiness.',
  minimal: 'Minimal design: single focal point per slide, generous whitespace, limited color palette, let the text breathe, impactful simplicity.',
};

function getGeminiClient(): GoogleGenerativeAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is required for AI slide generation');
  }
  return new GoogleGenerativeAI(apiKey);
}

function buildContentPrompt(options: GenerateSlideContentOptions): string {
  const { prompt, slideCount, aspectRatio, style, language = 'en' } = options;

  const stylePreset = STYLE_PRESETS[style];
  const platformGuideline = PLATFORM_GUIDELINES[style];
  const dimensions = getAspectRatioDimensions(aspectRatio);

  const languageInstruction = language === 'en'
    ? 'Respond in English.'
    : `Respond in ${language === 'es' ? 'Spanish' : language === 'fr' ? 'French' : language === 'zh' ? 'Chinese' : language === 'ja' ? 'Japanese' : language}.`;

  return `You are an expert social media content strategist specializing in viral carousel content.

TASK: Generate ${slideCount} slides for a photo carousel based on the user's topic.

PLATFORM & STYLE: ${platformGuideline}

VISUAL STYLE: ${stylePreset}

ASPECT RATIO: ${aspectRatio} (${dimensions.width}x${dimensions.height}px)

${languageInstruction}

${slideCount >= 3 ? NARRATIVE_ARC_PROMPT : 'Create engaging, varied content that flows naturally from slide to slide.'}

USER TOPIC: ${prompt}

OUTPUT FORMAT (valid JSON only, no markdown, no code blocks):
{
  "slides": [
    {
      "index": 0,
      "headline": "Short punchy headline (max 8 words)",
      "subtext": "Optional supporting text (max 15 words)",
      "imagePrompt": "Detailed prompt for AI image generation. MUST include the exact headline text to be baked into the image. Describe the full visual: background, text placement, colors, mood, lighting, composition. The image should look like a finished social media slide with text already on it.",
      "slideType": "hook|reveal|fact|list-item|cta"
    }
  ]
}

IMAGE PROMPT GUIDELINES:
- Each imagePrompt must create a COMPLETE slide with text baked in
- Include the exact headline text in quotes within the prompt
- Specify text position (top/center/bottom), size, color, and font style
- Describe background: solid color, gradient, pattern, or photo style
- Include style keywords: "${stylePreset}"
- Mention dimensions for proper aspect ratio
- Example: "A vertical 9:16 social media slide with bold white text 'MORNING HABITS' centered on a vibrant gradient background from purple to pink. Modern sans-serif font, high contrast, clean aesthetic, TikTok carousel style. 1080x1920px."

CONTENT GUIDELINES:
- Headlines: maximum 8 words, punchy and memorable
- Subtext: maximum 15 words, provides context or elaboration
- Vary slide types for engagement (hook, reveal, fact, list-item, cta)
- First slide should be a hook that grabs attention
- Last slide should have a call-to-action`;
}

function getAspectRatioDimensions(aspectRatio: string): { width: number; height: number } {
  switch (aspectRatio) {
    case '9:16':
      return { width: 1080, height: 1920 };
    case '4:5':
      return { width: 1080, height: 1350 };
    case '1:1':
      return { width: 1080, height: 1080 };
    case '16:9':
      return { width: 1920, height: 1080 };
    default:
      return { width: 1080, height: 1920 };
  }
}

interface GeminiSlideResponse {
  index: number;
  headline: string;
  subtext?: string;
  imagePrompt: string;
  slideType: string;
}

interface GeminiResponse {
  slides: GeminiSlideResponse[];
}

function parseSlideType(text: string): 'hook' | 'reveal' | 'fact' | 'list-item' | 'cta' {
  const normalized = text.toLowerCase().trim();
  if (normalized.includes('hook')) return 'hook';
  if (normalized.includes('reveal')) return 'reveal';
  if (normalized.includes('fact') || normalized.includes('stat')) return 'fact';
  if (normalized.includes('list') || normalized.includes('step') || normalized.includes('item')) return 'list-item';
  if (normalized.includes('cta') || normalized.includes('call-to-action') || normalized.includes('action')) return 'cta';
  return 'fact';
}

async function parseGeminiResponse(responseText: string): Promise<GeminiSlideResponse[]> {
  let cleanedText = responseText.trim();

  // Remove markdown code blocks if present
  if (cleanedText.startsWith('```json')) {
    cleanedText = cleanedText.slice(7);
  } else if (cleanedText.startsWith('```')) {
    cleanedText = cleanedText.slice(3);
  }
  if (cleanedText.endsWith('```')) {
    cleanedText = cleanedText.slice(0, -3);
  }
  cleanedText = cleanedText.trim();

  let parsed: GeminiResponse;
  try {
    parsed = JSON.parse(cleanedText) as GeminiResponse;
  } catch (error) {
    throw new Error(`Failed to parse Gemini response as JSON: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (!parsed.slides || !Array.isArray(parsed.slides)) {
    throw new Error('Invalid Gemini response: missing or invalid slides array');
  }

  return parsed.slides.map((slide, i) => ({
    index: slide.index ?? i,
    headline: slide.headline,
    subtext: slide.subtext,
    imagePrompt: slide.imagePrompt,
    slideType: slide.slideType,
  }));
}

/**
 * Generate slide content using Gemini Flash
 */
export async function generateSlideContent(options: GenerateSlideContentOptions): Promise<SlideContent[]> {
  const client = getGeminiClient();
  const prompt = buildContentPrompt(options);

  try {
    const model = client.getGenerativeModel({
      model: 'gemini-2.0-flash-exp',
      generationConfig: {
        temperature: 0.8,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 8192,
        responseMimeType: 'application/json',
      },
    });

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    if (!text) {
      throw new Error('No content generated from Gemini API');
    }

    const geminiSlides = await parseGeminiResponse(text);
    const style = STYLE_PRESETS[options.style];

    return geminiSlides.map((gs, i) => ({
      index: i,
      headline: gs.headline,
      subtext: gs.subtext,
      imagePrompt: gs.imagePrompt,
      slideType: parseSlideType(gs.slideType),
      style,
    }));
  } catch (error) {
    console.error('Gemini slide generation failed:', error);
    throw error;
  }
}

/**
 * Fallback slide generation when AI fails
 */
export function generateFallbackSlides(options: GenerateSlideContentOptions): SlideContent[] {
  const { prompt, slideCount, style, aspectRatio } = options;
  const stylePreset = STYLE_PRESETS[style];
  const dimensions = getAspectRatioDimensions(aspectRatio);
  const slides: SlideContent[] = [];

  for (let i = 0; i < slideCount; i++) {
    const slideNum = i + 1;
    let headline: string;
    let subtext: string | undefined;
    let slideType: 'hook' | 'reveal' | 'fact' | 'list-item' | 'cta';

    if (i === 0) {
      headline = `${prompt}`;
      subtext = 'Swipe to learn more →';
      slideType = 'hook';
    } else if (i === slideCount - 1) {
      headline = 'Follow for more!';
      subtext = 'Save & share this post';
      slideType = 'cta';
    } else {
      headline = `Part ${slideNum}: ${prompt}`;
      slideType = 'fact';
    }

    slides.push({
      index: i,
      headline,
      subtext,
      imagePrompt: `A social media slide ${dimensions.width}x${dimensions.height}px with bold text "${headline}"${subtext ? ` and smaller text "${subtext}"` : ''}. ${stylePreset}. Clean, professional design.`,
      slideType,
      style: stylePreset,
    });
  }

  return slides;
}
