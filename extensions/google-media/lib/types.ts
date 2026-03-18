export type RunStatus = 'pending' | 'generated' | 'rendered' | 'failed';
export type AssetKind = 'image' | 'video';

export interface ContentRun {
  id: string;
  status: RunStatus;
  prompt?: string;
  outputDir: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
  metadata: Record<string, unknown>;
}

export interface GeneratedAsset {
  id: string;
  runId: string;
  kind: AssetKind;
  mimeType: string;
  filePath: string;
  fileSizeBytes: number;
  createdAt: string;
  metadata: Record<string, unknown>;
}

export interface RenderedVideo {
  id: string;
  runId: string;
  compositionId: string;
  filePath: string;
  width: number;
  height: number;
  fps: number;
  durationInFrames: number;
  createdAt: string;
  metadata: Record<string, unknown>;
}

export interface RenderRequest {
  runId?: string;
  hookText: string;
  revealText: string;
  hookColor?: string;
  revealColor?: string;
  backgroundColor?: string;
}

export interface RenderResult {
  success: boolean;
  runId: string;
  outputPath: string;
  compositionId: string;
  width?: number;
  height?: number;
  fps?: number;
  durationInFrames?: number;
  error?: string;
}
