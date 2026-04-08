/**
 * Media Storage Tools - KStorage Integration
 *
 * Upload, list, and manage media files on KStorage (S3-compatible)
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { randomUUID } from 'crypto';

const execAsync = promisify(exec);

export type MediaStorageConfig = {
  kstoragePath?: string;
  defaultVisibility?: 'public' | 'private';
  publicMediaBaseUrl?: string;
};

export type UploadResult = {
  filename: string;
  objectId: string;
  visibility: 'public' | 'private';
  url: string;
  size: number;
};

export type MediaFile = {
  filename: string;
  objectId: string;
  visibility: 'public' | 'private';
  size: number;
  url?: string;
};

/**
 * Upload a file to KStorage
 */
export async function uploadMedia(
  filePath: string,
  options: {
    visibility?: 'public' | 'private';
    filename?: string;
  } = {},
  config: MediaStorageConfig = {},
): Promise<UploadResult> {
  const kstorage = config.kstoragePath || 'kstorage';
  const visibility = options.visibility || config.defaultVisibility || 'private';
  const filename = options.filename || filePath.split('/').pop() || randomUUID();

  const args = ['upload'];
  if (visibility === 'public') args.push('--public');
  args.push(filePath);
  if (options.filename) args.push(filename);

  try {
    const { stdout } = await execAsync(`${kstorage} ${args.join(' ')}`);

    // Parse output to extract objectId and URL
    // Output format: "filename  size  visibility  objectId"
    const lines = stdout.trim().split('\n');
    const lastLine = lines[lines.length - 1];
    const parts = lastLine.split(/\s+/);

    if (parts.length >= 4) {
      return {
        filename: parts[0],
        objectId: parts[3],
        visibility,
        url: visibility === 'public'
          ? `${config.publicMediaBaseUrl || 'https://cdn.koompi.cloud'}/${parts[0]}`
          : await getSignedUrl(parts[3], config),
        size: parseInt(parts[1]) || 0,
      };
    }

    throw new Error(`Unexpected output format: ${stdout}`);
  } catch (error) {
    throw new Error(`Failed to upload ${filePath}: ${error}`);
  }
}

/**
 * List media files with optional filters
 */
export async function listMedia(
  options: {
    search?: string;
    visibility?: 'public' | 'private';
    ext?: string;
    match?: string;
    all?: boolean;
  } = {},
  config: MediaStorageConfig = {},
): Promise<MediaFile[]> {
  const kstorage = config.kstoragePath || 'kstorage';
  const args = ['list', '--json'];

  if (options.search) args.push(options.search);
  if (options.visibility) args.push(`--${options.visibility}`);
  if (options.ext) args.push('--ext', options.ext);
  if (options.match) args.push('--match', options.match);
  if (options.all) args.push('--all');

  try {
    const { stdout } = await execAsync(`${kstorage} ${args.join(' ')}`);
    const files = JSON.parse(stdout);

    return files.map((f: any) => ({
      filename: f.filename || f.name,
      objectId: f.objectId || f.id,
      visibility: f.visibility || 'private',
      size: f.size || 0,
    }));
  } catch (error) {
    // If JSON parsing fails, fall back to parsing text output
    try {
      const { stdout } = await execAsync(`${kstorage} list ${options.search || ''}`);
      const lines = stdout.trim().split('\n').filter(l => !l.startsWith('---'));

      return lines.map(line => {
        const parts = line.split(/\s+/);
        return {
          filename: parts[0],
          objectId: parts[3],
          visibility: (parts[2] as 'public' | 'private') || 'private',
          size: parseInt(parts[1]) || 0,
        };
      });
    } catch (fallbackError) {
      throw new Error(`Failed to list media: ${fallbackError}`);
    }
  }
}

/**
 * Get a signed URL for a private file
 */
export async function getSignedUrl(
  objectIdOrFilename: string,
  config: MediaStorageConfig = {},
): Promise<string> {
  const kstorage = config.kstoragePath || 'kstorage';

  try {
    const { stdout } = await execAsync(`${kstorage} url "${objectIdOrFilename}"`);
    return stdout.trim();
  } catch (error) {
    throw new Error(`Failed to get signed URL for ${objectIdOrFilename}: ${error}`);
  }
}

/**
 * Delete a media file
 */
export async function deleteMedia(
  objectIdOrFilename: string,
  config: MediaStorageConfig = {},
): Promise<void> {
  const kstorage = config.kstoragePath || 'kstorage';

  try {
    await execAsync(`${kstorage} delete "${objectIdOrFilename}"`);
  } catch (error) {
    throw new Error(`Failed to delete ${objectIdOrFilename}: ${error}`);
  }
}

/**
 * OpenClaw tool definition for upload
 */
export const uploadMediaTool = {
  name: 'upload_media',
  description: 'Upload a media file to KStorage (S3-compatible object storage). Returns CDN URL for public files, signed URL for private.',
  parameters: {
    type: 'object',
    properties: {
      file_path: {
        type: 'string',
        description: 'Path to the file to upload',
      },
      visibility: {
        type: 'string',
        enum: ['public', 'private'],
        description: 'Public files get CDN URLs, private files get signed URLs',
      },
      filename: {
        type: 'string',
        description: 'Custom filename (optional)',
      },
    },
    required: ['file_path'],
  },
};

/**
 * OpenClaw tool definition for list
 */
export const listMediaTool = {
  name: 'list_media',
  description: 'List media files in KStorage with optional filters. Returns filename, size, visibility, and objectId.',
  parameters: {
    type: 'object',
    properties: {
      search: {
        type: 'string',
        description: 'Search query to filter files',
      },
      visibility: {
        type: 'string',
        enum: ['public', 'private'],
        description: 'Filter by visibility',
      },
      ext: {
        type: 'string',
        description: 'Filter by file extension (e.g., mp4, png)',
      },
      match: {
        type: 'string',
        description: 'Regex pattern to match filenames',
      },
      all: {
        type: 'boolean',
        description: 'Fetch all pages (default: first 100)',
      },
    },
  },
};

/**
 * OpenClaw tool definition for signed URL
 */
export const getSignedUrlTool = {
  name: 'get_signed_url',
  description: 'Get a temporary signed URL for a private file. URL expires in 10 minutes.',
  parameters: {
    type: 'object',
    properties: {
      object_id_or_filename: {
        type: 'string',
        description: 'ObjectId or filename of the private file',
      },
    },
    required: ['object_id_or_filename'],
  },
};

/**
 * OpenClaw tool definition for delete
 */
export const deleteMediaTool = {
  name: 'delete_media',
  description: 'Delete a media file from KStorage. Use with caution - this cannot be undone.',
  parameters: {
    type: 'object',
    properties: {
      object_id_or_filename: {
        type: 'string',
        description: 'ObjectId or filename to delete',
      },
    },
    required: ['object_id_or_filename'],
  },
};

/**
 * Create tool instances with config
 */
function toMediaStorageConfig(config: any): MediaStorageConfig {
  return {
    kstoragePath: config.kstoragePath,
    defaultVisibility: config.defaultVisibility,
    publicMediaBaseUrl: config.publicMediaBaseUrl,
  };
}

export function createUploadMediaTool(config: any = {}) {
  const storageConfig = toMediaStorageConfig(config);
  return {
    ...uploadMediaTool,
    execute: async (params: any) => uploadMedia(params.file_path, params, storageConfig),
  };
}

export function createListMediaTool(config: any = {}) {
  const storageConfig = toMediaStorageConfig(config);
  return {
    ...listMediaTool,
    execute: async (params: any) => listMedia(params, storageConfig),
  };
}

export function createGetSignedUrlTool(config: any = {}) {
  const storageConfig = toMediaStorageConfig(config);
  return {
    ...getSignedUrlTool,
    execute: async (params: any) => ({
      url: await getSignedUrl(params.object_id_or_filename, storageConfig),
    }),
  };
}

export function createDeleteMediaTool(config: any = {}) {
  const storageConfig = toMediaStorageConfig(config);
  return {
    ...deleteMediaTool,
    execute: async (params: any) => {
      await deleteMedia(params.object_id_or_filename, storageConfig);
      return { deleted: true, objectId: params.object_id_or_filename };
    },
  };
}
