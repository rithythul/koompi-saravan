import fs from 'fs/promises';
import path from 'path';

import type { GoogleMediaConfig } from './config.js';

const DEFAULT_ALLOWED_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.mp4', '.json']);

function assertWithinRoot(root: string, candidate: string): void {
  const relativePath = path.relative(root, candidate);
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new Error(`Unsafe output path rejected: ${candidate}`);
  }
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function getOutputRoot(config: GoogleMediaConfig): string {
  return path.resolve(config.defaultOutputDir);
}

export async function ensureOutputRoot(config: GoogleMediaConfig): Promise<string> {
  const rootDir = getOutputRoot(config);
  await fs.mkdir(rootDir, { recursive: true });
  return rootDir;
}

export async function createRunOutputPaths(
  config: GoogleMediaConfig,
  runId: string,
  now: Date = new Date(),
): Promise<{
  rootDir: string;
  runDir: string;
  metadataPath: string;
}> {
  const rootDir = await ensureOutputRoot(config);
  const runDir = path.resolve(rootDir, formatDate(now), runId);
  assertWithinRoot(rootDir, runDir);
  await fs.mkdir(runDir, { recursive: true });

  return {
    rootDir,
    runDir,
    metadataPath: path.join(runDir, 'run.json'),
  };
}

export function sanitizeFileStem(value: string): string {
  const sanitized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '');

  return sanitized || 'asset';
}

export function resolveSafeAssetPath(
  runDir: string,
  fileName: string,
  allowedExtensions: Set<string> = DEFAULT_ALLOWED_EXTENSIONS,
): string {
  if (path.basename(fileName) !== fileName) {
    throw new Error(`Nested or relative file names are not allowed: ${fileName}`);
  }

  const extension = path.extname(fileName).toLowerCase();
  if (!allowedExtensions.has(extension)) {
    throw new Error(`Unsupported file extension: ${extension || '(none)'}`);
  }

  const resolvedPath = path.resolve(runDir, fileName);
  assertWithinRoot(runDir, resolvedPath);
  return resolvedPath;
}
