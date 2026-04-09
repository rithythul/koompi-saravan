/**
 * Slideshow Types
 *
 * Core types for AI-generated slideshow content
 */

export type SlideType = 'headline' | 'quote' | 'fact' | 'list-item' | 'call-to-action';

export type TextPosition = 'top' | 'center' | 'bottom';

export type BackgroundFilter = 'none' | 'darken' | 'blur' | 'gradient';

export type AspectRatio = '9:16' | '4:5' | '1:1' | '16:9';

export type SlideStyle = 'tiktok' | 'instagram' | 'educational' | 'minimal';

export interface Slide {
  index: number;
  text: string;
  subtext?: string;
  imagePrompt: string;
  slideType: SlideType;
  textColor: string;
  textPosition: TextPosition;
  backgroundFilter: BackgroundFilter;
  generatedImagePath?: string;
}

export interface SlideshowConfig {
  id: string;
  prompt: string;
  slideCount: number;
  aspectRatio: AspectRatio;
  style: SlideStyle;
  language: string;
  useAiImages: boolean;
  packId?: string | null;
  backgroundFilter: BackgroundFilter;
  slides: Slide[];
  status: 'pending' | 'generating' | 'rendering' | 'completed' | 'failed';
  outputDir: string;
  createdAt: string;
  updatedAt: string;
  error?: string;
}

export interface GenerateSlideshowOptions {
  prompt: string;
  slideCount?: number;
  aspectRatio?: AspectRatio;
  style?: SlideStyle;
  language?: string;
  useAiImages?: boolean;
  packId?: string | null;
  backgroundFilter?: BackgroundFilter;
}

export interface Dimensions {
  width: number;
  height: number;
}

export function getDimensions(aspectRatio: AspectRatio): Dimensions {
  const baseSize = 1080;
  switch (aspectRatio) {
    case '9:16':
      return { width: baseSize, height: Math.round(baseSize * (16 / 9)) };
    case '4:5':
      return { width: baseSize, height: Math.round(baseSize * (5 / 4)) };
    case '1:1':
      return { width: baseSize, height: baseSize };
    case '16:9':
      return { width: baseSize, height: Math.round(baseSize * (9 / 16)) };
    default:
      return { width: baseSize, height: 1920 };
  }
}
