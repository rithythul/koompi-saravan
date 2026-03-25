/**
 * Remotion Render API
 * 
 * Provides a programmatic interface to render videos from templates.
 * Called by OpenClaw tools to generate final MP4s.
 */

import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs/promises";
import crypto from "crypto";

export const SUPPORTED_COMPOSITIONS = ["HookReveal"] as const;

export type SupportedCompositionId = (typeof SUPPORTED_COMPOSITIONS)[number];

export interface RenderOptions {
  compositionId: SupportedCompositionId;
  inputProps: Record<string, unknown>;
  outputPath: string;
}

export interface RenderResult {
  success: boolean;
  outputPath: string;
  compositionId: SupportedCompositionId;
  width?: number;
  height?: number;
  fps?: number;
  durationInFrames?: number;
  error?: string;
}

export function getRemotionProjectRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
}

async function computeSourceHash(projectRoot: string): Promise<string> {
    const files = await fs.readdir(projectRoot, { recursive: true });
    const hashes = await Promise.all(
        files
            .filter(f => f.endsWith('.tsx') || f.endsWith('.ts') || f.endsWith('.css'))
            .map(async f => {
                const content = await fs.readFile(path.join(projectRoot, f));
                return crypto.createHash('sha256').update(content).digest('hex');
            })
    );
    return crypto.createHash('sha256').update(hashes.join('')).digest('hex');
}

export function assertSupportedCompositionId(
  compositionId: string,
): asserts compositionId is SupportedCompositionId {
  if (!SUPPORTED_COMPOSITIONS.includes(compositionId as SupportedCompositionId)) {
    throw new Error(
      `Unsupported composition id: ${compositionId}. Supported compositions: ${SUPPORTED_COMPOSITIONS.join(', ')}`,
    );
  }
}

/**
 * Render a video composition to MP4
 */
export async function renderVideo(options: RenderOptions): Promise<RenderResult> {
  try {
    assertSupportedCompositionId(options.compositionId);
    const projectRoot = getRemotionProjectRoot();
    
    // Hash source files to determine if we need to rebundle
    const sourceHash = await computeSourceHash(projectRoot);
    const hashFile = path.join(projectRoot, '.bundle-hash');
    const existingHash = await fs.readFile(hashFile, 'utf8').catch(() => '');

    let bundled;
    if (sourceHash !== existingHash) {
        console.log(`Source changed (hash: ${sourceHash}). Bundling Remotion project...`);
        bundled = await bundle({
          entryPoint: path.join(projectRoot, "root.tsx"),
          outDir: path.join(projectRoot, ".bundle"),
        });
        await fs.writeFile(hashFile, sourceHash);
    } else {
        console.log('Source unchanged. Using existing bundle.');
        bundled = path.join(projectRoot, '.bundle', 'index.js');
    }

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
      compositionId: options.compositionId,
      outputPath: options.outputPath,
      width: composition.width,
      height: composition.height,
      fps: composition.fps,
      durationInFrames: composition.durationInFrames,
    };
  } catch (error) {
    return {
      success: false,
      compositionId: options.compositionId,
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
}): Promise<RenderResult> {
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
