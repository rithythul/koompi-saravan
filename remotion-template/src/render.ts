/**
 * Remotion Render API
 * 
 * Provides a programmatic interface to render videos from templates.
 * Called by OpenClaw tools to generate final MP4s.
 */

import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import path from "path";
import fs from "fs/promises";

export interface RenderOptions {
  compositionId: string;
  inputProps: Record<string, any>;
  outputPath: string;
  fps?: number;
  width?: number;
  height?: number;
}

/**
 * Render a video composition to MP4
 */
export async function renderVideo(options: RenderOptions): Promise<{
  success: boolean;
  outputPath: string;
  error?: string;
}> {
  try {
    const projectRoot = path.dirname(new URL(import.meta.url).pathname);
    
    // Bundle the Remotion project
    console.log(`Bundling Remotion project...`);
    const bundled = await bundle({
      entryPoint: path.join(projectRoot, "root.tsx"),
      outDir: path.join(projectRoot, ".bundle"),
    });

    // Select the composition
    const composition = await selectComposition({
      serveUrl: bundled,
      id: options.compositionId,
      inputProps: options.inputProps,
    });

    // Ensure output directory exists
    const outDir = path.dirname(options.outputPath);
    await fs.mkdir(outDir, { recursive: true });

    // Render the video
    console.log(`Rendering ${options.compositionId}...`);
    await renderMedia({
      composition,
      serveUrl: bundled,
      codec: "h264",
      outputLocation: options.outputPath,
      inputProps: options.inputProps,
      overwrite: true,
    });

    return {
      success: true,
      outputPath: options.outputPath,
    };
  } catch (error) {
    return {
      success: false,
      outputPath: options.outputPath,
      error: error instanceof Error ? error.message : "Unknown render error",
    };
  }
}

/**
 * Render a HookReveal video
 */
export async function renderHookReveal(options: {
  hookText: string;
  revealText: string;
  outputPath: string;
  hookColor?: string;
  revealColor?: string;
  backgroundColor?: string;
  imageUrl?: string;
}): Promise<{ success: boolean; outputPath: string; error?: string }> {
  return renderVideo({
    compositionId: "HookReveal",
    inputProps: {
      hookText: options.hookText,
      revealText: options.revealText,
      hookColor: options.hookColor || "#FFFFFF",
      revealColor: options.revealColor || "#FF6B35",
      backgroundColor: options.backgroundColor || "#1A1A2E",
      imageUrl: options.imageUrl,
    },
    outputPath: options.outputPath,
  });
}
