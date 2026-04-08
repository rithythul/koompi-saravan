/**
 * Slideshow Generator - Advanced Content Generation
 *
 * Multi-template slideshow generation with text positioning, styling, and background controls
 */

import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import { join } from 'path';

export type SlideType = 'image_pack' | 'custom_image' | 'solid_color' | 'gradient';

export type TextStyle = {
  fontSize?: 'small' | 'default' | 'large' | number;
  fontWeight?: 'normal' | 'bold' | 'black';
  textAlign?: 'left' | 'center' | 'right';
  textColor?: string;
  textWidth?: 'default' | 'narrow' | 'wide';
  position?: {
    x: number;
    y: number;
  };
};

export type BackgroundFilter = {
  type: 'darken' | 'blur' | 'gradient_overlay';
  intensity?: number; // 0-100
  color?: string;
};

export type Slide = {
  id: string;
  index: number;
  type: SlideType;
  imageUrl?: string;
  backgroundColor?: string;
  gradientColors?: [string, string];
  backgroundFilter?: BackgroundFilter;
  text: string;
  textElements?: Array<{
    id: string;
    content: string;
    x: number;
    y: number;
    fontSize?: number;
    width?: number;
  }>;
  textStyle: TextStyle;
};

export type SlideshowConfig = {
  id: string;
  name?: string;
  aspectRatio: '9:16' | '4:5' | '1:1' | '16:9';
  slides: Slide[];
  style: 'tiktok' | 'instagram' | 'professional' | 'minimal';
  language: string;
  status: 'draft' | 'rendering' | 'rendered' | 'failed';
  renderedUrls?: string[];
  createdAt: string;
  updatedAt: string;
};

export type SlideshowGeneratorOptions = {
  prompt: string;
  packId?: string;
  slides?: number;
  aspectRatio?: '9:16' | '4:5' | '1:1' | '16:9';
  style?: 'tiktok' | 'instagram' | 'professional' | 'minimal';
  language?: string;
  slideConfig?: {
    totalSlides: number;
    slideTypes: SlideType[];
    pinnedImages?: Record<number, string>;
    customImages?: Record<number, { imageUrl: string; imageId?: string }>;
    slideTexts?: Record<number, string>;
    packAssignments?: Record<number, string>;
  };
};

/**
 * Generate a slideshow from prompt or manual config
 */
export async function generateSlideshow(
  options: SlideshowGeneratorOptions,
  config: { outputDir: string; packsDir: string } = { outputDir: './var/outputs', packsDir: './var/packs' },
): Promise<SlideshowConfig> {
  const slideCount = options.slides || options.slideConfig?.totalSlides || 5;
  const aspectRatio = options.aspectRatio || '9:16';
  const style = options.style || 'tiktok';
  const language = options.language || 'en';

  const slideshow: SlideshowConfig = {
    id: randomUUID(),
    aspectRatio,
    slides: [],
    style,
    language,
    status: 'draft',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // Generate slides based on config or AI prompt
  if (options.slideConfig) {
    // Manual/mixed mode
    for (let i = 0; i < options.slideConfig.totalSlides; i++) {
      const slideType = options.slideConfig.slideTypes[i] || 'image_pack';
      const slide: Slide = {
        id: randomUUID(),
        index: i,
        type: slideType,
        text: options.slideConfig.slideTexts?.[i] || '',
        textStyle: getDefaultTextStyle(style),
      };

      if (slideType === 'custom_image' && options.slideConfig.customImages?.[i]) {
        slide.imageUrl = options.slideConfig.customImages[i].imageUrl;
      } else if (slideType === 'image_pack') {
        const packId = options.slideConfig.packAssignments?.[i] || options.packId;
        const pinnedUrl = options.slideConfig.pinnedImages?.[i];
        if (pinnedUrl) {
          slide.imageUrl = pinnedUrl;
        }
        // If no pinned image, mark for later assignment
      }

      slideshow.slides.push(slide);
    }
  } else {
    // AI mode - generate from prompt
    for (let i = 0; i < slideCount; i++) {
      const slide: Slide = {
        id: randomUUID(),
        index: i,
        type: 'image_pack',
        text: '', // Will be filled by AI
        textStyle: getDefaultTextStyle(style),
      };
      slideshow.slides.push(slide);
    }

    // TODO: Call Gemini to generate slide text from prompt
    // Use the 5-slide narrative arc: hook → problem → shift → proof → CTA
  }

  return slideshow;
}

/**
 * Render a slideshow to images via Remotion
 */
export async function renderSlideshow(
  slideshowId: string,
  config: { outputDir: string } = { outputDir: './var/outputs' },
): Promise<{ renderedUrls: string[] }> {
  // TODO: Call Remotion to render each slide
  // 1. Load slideshow config
  // 2. For each slide, compose image + text + filters
  // 3. Render to PNG/JPEG
  // 4. Upload to storage
  // 5. Return URLs

  throw new Error('Slideshow rendering not yet implemented');
}

/**
 * Update a slideshow
 */
export async function updateSlideshow(
  slideshowId: string,
  updates: {
    name?: string;
    slides?: Slide[];
    status?: SlideshowConfig['status'];
  },
  config: { outputDir: string } = { outputDir: './var/outputs' },
): Promise<SlideshowConfig> {
  // TODO: Load slideshow, apply updates, save
  throw new Error('Slideshow update not yet implemented');
}

/**
 * Get default text style for a given style preset
 */
function getDefaultTextStyle(style: 'tiktok' | 'instagram' | 'professional' | 'minimal'): TextStyle {
  const defaults: Record<string, TextStyle> = {
    tiktok: {
      fontSize: 'default',
      fontWeight: 'bold',
      textAlign: 'center',
      textColor: '#FFFFFF',
      textWidth: 'narrow',
    },
    instagram: {
      fontSize: 'default',
      fontWeight: 'normal',
      textAlign: 'center',
      textColor: '#FFFFFF',
    },
    professional: {
      fontSize: 'small',
      fontWeight: 'normal',
      textAlign: 'left',
      textColor: '#000000',
    },
    minimal: {
      fontSize: 'default',
      fontWeight: 'normal',
      textAlign: 'center',
      textColor: '#FFFFFF',
    },
  };

  return defaults[style] || defaults.tiktok;
}

/**
 * OpenClaw tool definitions
 */
export const generateSlideshowTool = {
  name: 'generate_slideshow',
  description: 'Generate a slideshow from a prompt (AI mode) or manual config. Supports 5-slide narrative arc with pinned images.',
  parameters: {
    type: 'object',
    properties: {
      prompt: {
        type: 'string',
        description: 'Content prompt for AI-generated slideshow',
      },
      pack_id: {
        type: 'string',
        description: 'Image pack ID for backgrounds',
      },
      slides: {
        type: 'number',
        description: 'Number of slides (1-10, default: 5)',
      },
      aspect_ratio: {
        type: 'string',
        enum: ['9:16', '4:5', '1:1', '16:9'],
        description: 'Slide aspect ratio (default: 9:16)',
      },
      style: {
        type: 'string',
        enum: ['tiktok', 'instagram', 'professional', 'minimal'],
        description: 'Visual style preset (default: tiktok)',
      },
      slide_config_json: {
        type: 'string',
        description: 'JSON string with manual slide configuration',
      },
    },
  },
};

export const renderSlideshowTool = {
  name: 'render_slideshow',
  description: 'Render a slideshow to images via Remotion. Returns CDN URLs for each slide.',
  parameters: {
    type: 'object',
    properties: {
      slideshow_id: {
        type: 'string',
        description: 'Slideshow ID to render',
      },
    },
    required: ['slideshow_id'],
  },
};

export const updateSlideshowTool = {
  name: 'update_slideshow',
  description: 'Update slideshow slides, text, style, or status. Use to fix readability issues before rendering.',
  parameters: {
    type: 'object',
    properties: {
      slideshow_id: {
        type: 'string',
        description: 'Slideshow ID to update',
      },
      slides_json: {
        type: 'string',
        description: 'JSON array of updated slides',
      },
      status: {
        type: 'string',
        enum: ['draft', 'rendering', 'rendered', 'failed'],
        description: 'New status',
      },
    },
    required: ['slideshow_id'],
  },
};

export function createGenerateSlideshowTool(config: any = {}) {
  return {
    ...generateSlideshowTool,
    execute: async (params: any) => {
      let slideConfig = undefined;
      if (params.slide_config_json) {
        slideConfig = JSON.parse(params.slide_config_json);
      }
      return generateSlideshow(
        {
          prompt: params.prompt,
          packId: params.pack_id,
          slides: params.slides,
          aspectRatio: params.aspect_ratio,
          style: params.style,
          slideConfig,
        },
        { outputDir: config.defaultOutputDir, packsDir: config.packsDir },
      );
    },
  };
}

export function createRenderSlideshowTool(config: any = {}) {
  return {
    ...renderSlideshowTool,
    execute: async (params: any) => {
      return renderSlideshow(params.slideshow_id, { outputDir: config.defaultOutputDir });
    },
  };
}

export function createUpdateSlideshowTool(config: any = {}) {
  return {
    ...updateSlideshowTool,
    execute: async (params: any) => {
      const updates: any = {};
      if (params.slides_json) {
        updates.slides = JSON.parse(params.slides_json);
      }
      if (params.status) {
        updates.status = params.status;
      }
      return updateSlideshow(params.slideshow_id, updates, { outputDir: config.defaultOutputDir });
    },
  };
}
