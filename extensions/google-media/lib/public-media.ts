import path from 'path';

import type { GoogleMediaConfig } from './config.js';
import { getOutputRoot } from './output-paths.js';

function toPosixPath(value: string): string {
  return value.split(path.sep).join('/');
}

export function buildPublicAssetUrl(
  config: GoogleMediaConfig,
  filePath: string,
): string | undefined {
  const baseUrl = config.publicMediaBaseUrl?.trim();
  if (!baseUrl) {
    return undefined;
  }

  const outputRoot = getOutputRoot(config);
  const relativePath = path.relative(outputRoot, path.resolve(filePath));
  if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new Error(
      `Cannot build a public URL for ${filePath} because it is outside the managed output root ${outputRoot}.`,
    );
  }

  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const encodedRelativePath = toPosixPath(relativePath)
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');

  return new URL(encodedRelativePath, normalizedBase).toString();
}
