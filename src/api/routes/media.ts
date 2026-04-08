/**
 * Media Routes
 *
 * POST /api/media/upload - Upload media to storage
 * GET /api/media - List uploaded media
 * GET /api/media/:id - Get media details
 * DELETE /api/media/:id - Delete media
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { Bindings } from '../types.js';
import { mkdir, writeFile, stat } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { mediaUrlUploadSchema } from '../lib/validation.js';

const app = new Hono<{ Bindings: Bindings }>();

// Media storage directory
const MEDIA_DIR = process.env.MEDIA_DIR || join(process.cwd(), 'var', 'media');

// Ensure media directory exists
async function ensureMediaDir(): Promise<void> {
  if (!existsSync(MEDIA_DIR)) {
    await mkdir(MEDIA_DIR, { recursive: true });
  }
}

// Media file metadata
interface MediaFile {
  id: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  url: string;
  createdAt: string;
}

// In-memory media registry (in production, use a database)
const mediaRegistry = new Map<string, MediaFile>();

/**
 * POST /api/media/upload
 *
 * Upload media to local storage
 */
app.post('/upload', async (c) => {
  try {
    await ensureMediaDir();

    const body = await c.req.parseBody();
    const file = body.file as File;

    if (!file || !(file instanceof File)) {
      return c.json({
        error: 'Validation Error',
        message: 'No file provided. Use multipart/form-data with a "file" field.',
      }, 400);
    }

    // Validate file size (default 100MB max)
    const maxSize = parseInt(process.env.MAX_UPLOAD_SIZE || '104857600', 10);
    if (file.size > maxSize) {
      return c.json({
        error: 'Validation Error',
        message: `File size exceeds maximum allowed size of ${maxSize} bytes`,
      }, 400);
    }

    // Validate file type
    const allowedTypes = (process.env.ALLOWED_MEDIA_TYPES || 'image/*,video/*').split(',');
    const isAllowed = allowedTypes.some(type => {
      if (type.endsWith('/*')) {
        return file.type.startsWith(type.slice(0, -1));
      }
      return file.type === type;
    });

    if (!isAllowed) {
      return c.json({
        error: 'Validation Error',
        message: `File type ${file.type} is not allowed`,
      }, 400);
    }

    // Generate unique filename
    const id = crypto.randomUUID();
    const ext = file.name.split('.').pop() || '';
    const filename = `${id}.${ext}`;
    const filePath = join(MEDIA_DIR, filename);

    // Save file
    const buffer = await file.arrayBuffer();
    await writeFile(filePath, new Uint8Array(buffer));

    // Get file stats
    const stats = await stat(filePath);

    // Create media record
    const mediaRecord: MediaFile = {
      id,
      filename,
      originalName: file.name,
      mimeType: file.type,
      size: stats.size,
      url: `/api/media/${id}`,
      createdAt: new Date().toISOString(),
    };

    mediaRegistry.set(id, mediaRecord);

    return c.json({
      id: mediaRecord.id,
      filename: mediaRecord.filename,
      originalName: mediaRecord.originalName,
      mimeType: mediaRecord.mimeType,
      size: mediaRecord.size,
      url: mediaRecord.url,
      createdAt: mediaRecord.createdAt,
    });
  } catch (error) {
    console.error('Upload error:', error);
    return c.json({
      error: 'Upload Failed',
      message: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});

/**
 * POST /api/media/upload-url
 *
 * Upload media from URL (fetches and stores locally)
 */
app.post('/upload-url', zValidator('json', mediaUrlUploadSchema), async (c) => {
  try {
    const { url } = c.req.valid('json');

    await ensureMediaDir();

    // Fetch the file from URL
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Sarawan-Social/1.0' },
    });

    if (!response.ok) {
      return c.json({
        error: 'Upload Failed',
        message: `Failed to fetch URL: ${response.status} ${response.statusText}`,
      }, 400);
    }

    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    const buffer = await response.arrayBuffer();

    // Validate file size
    const maxSize = parseInt(process.env.MAX_UPLOAD_SIZE || '104857600', 10);
    if (buffer.byteLength > maxSize) {
      return c.json({
        error: 'Validation Error',
        message: `File size exceeds maximum allowed size of ${maxSize} bytes`,
      }, 400);
    }

    // Generate unique filename
    const id = crypto.randomUUID();
    const ext = contentType.split('/')[1]?.split(';')[0] || 'bin';
    const filename = `${id}.${ext}`;
    const filePath = join(MEDIA_DIR, filename);

    // Save file
    await writeFile(filePath, new Uint8Array(buffer));

    // Create media record
    const urlParts = new URL(url);
    const originalName = urlParts.pathname.split('/').pop() || 'download';

    const mediaRecord: MediaFile = {
      id,
      filename,
      originalName,
      mimeType: contentType,
      size: buffer.byteLength,
      url: `/api/media/${id}`,
      createdAt: new Date().toISOString(),
    };

    mediaRegistry.set(id, mediaRecord);

    return c.json({
      id: mediaRecord.id,
      filename: mediaRecord.filename,
      originalName: mediaRecord.originalName,
      mimeType: mediaRecord.mimeType,
      size: mediaRecord.size,
      url: mediaRecord.url,
      createdAt: mediaRecord.createdAt,
      sourceUrl: url,
    });
  } catch (error) {
    console.error('URL upload error:', error);
    return c.json({
      error: 'Upload Failed',
      message: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});

/**
 * GET /api/media
 *
 * List uploaded media
 */
app.get('/', async (c) => {
  const limit = parseInt(c.req.query('limit') || '50');
  const offset = parseInt(c.req.query('offset') || '0');
  const type = c.req.query('type'); // 'video' | 'image'

  let media = Array.from(mediaRegistry.values());

  // Filter by type if specified
  if (type) {
    media = media.filter(m => m.mimeType.startsWith(type));
  }

  // Sort by creation date (newest first)
  media.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const total = media.length;
  const paginated = media.slice(offset, offset + limit);

  return c.json({
    media: paginated,
    total,
    limit,
    offset,
  });
});

/**
 * GET /api/media/:id
 *
 * Get media details
 */
app.get('/:id', async (c) => {
  const id = c.req.param('id');
  const media = mediaRegistry.get(id);

  if (!media) {
    return c.json({
      error: 'Not Found',
      message: 'Media not found',
      id,
    }, 404);
  }

  return c.json(media);
});

/**
 * GET /api/media/:id/file
 *
 * Get the actual file
 */
app.get('/:id/file', async (c) => {
  const id = c.req.param('id');
  const media = mediaRegistry.get(id);

  if (!media) {
    return c.json({ error: 'Not Found', message: 'Media not found' }, 404);
  }

  const filePath = join(MEDIA_DIR, media.filename);

  if (!existsSync(filePath)) {
    return c.json({ error: 'Not Found', message: 'File not found on disk' }, 404);
  }

  const file = Bun.file(filePath);
  return new Response(file);
});

/**
 * DELETE /api/media/:id
 *
 * Delete media
 */
app.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const media = mediaRegistry.get(id);

  if (!media) {
    return c.json({
      error: 'Not Found',
      message: 'Media not found',
      id,
    }, 404);
  }

  const filePath = join(MEDIA_DIR, media.filename);

  // Delete file from disk
  try {
    if (existsSync(filePath)) {
      await Bun.write(filePath, ''); // Truncate file
      // Note: Bun doesn't have a direct delete, using truncate for now
      // In production with Node.js, use rm() from fs/promises
    }
  } catch (error) {
    console.error('Failed to delete file:', error);
  }

  // Remove from registry
  mediaRegistry.delete(id);

  return c.json({
    message: 'Media deleted successfully',
    id,
  });
});

/**
 * GET /api/media/:id/url
 *
 * Get signed URL for media (returns direct URL for now)
 */
app.get('/:id/url', async (c) => {
  const id = c.req.param('id');
  const expiresIn = parseInt(c.req.query('expiresIn') || '3600');

  const media = mediaRegistry.get(id);

  if (!media) {
    return c.json({
      error: 'Not Found',
      message: 'Media not found',
      id,
    }, 404);
  }

  // For local storage, just return the file URL
  // In production with S3, generate a presigned URL
  const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3001}`;

  return c.json({
    url: `${baseUrl}${media.url}/file`,
    expiresIn,
    expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
  });
});

export default app;
