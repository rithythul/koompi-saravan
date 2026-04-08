/**
 * Zod Validation Schemas
 *
 * Common validation schemas for API routes
 */

import { z } from 'zod';

// Platform names
export const PLATFORM_NAMES = [
  'telegram',
  'x',
] as const;

export const platformSchema = z.enum(PLATFORM_NAMES);

export const platformsArraySchema = z.array(z.enum(PLATFORM_NAMES)).min(1, {
  message: 'At least one platform is required',
});

// Content types
export const contentTypes = ['video', 'image', 'carousel'] as const;
export const contentTypeSchema = z.enum(contentTypes);

// Post status
export const postStatuses = ['pending', 'publishing', 'published', 'failed'] as const;
export const postStatusSchema = z.enum(postStatuses);

// Publish request schemas
export const publishContentSchema = z.object({
  type: contentTypeSchema,
  mediaUrl: z.string().url('mediaUrl must be a valid URL'),
  caption: z.string().min(1, 'caption is required').max(2200, 'caption is too long'),
  hashtags: z.array(z.string().regex(/^[a-zA-Z0-9_]+$/)).optional(),
  scheduleAt: z.string().datetime().optional(),
});

export const publishOptionsSchema = z.object({
  dryRun: z.boolean().optional(),
  validateOnly: z.boolean().optional(),
});

export const publishRequestSchema = z.object({
  platforms: platformsArraySchema,
  content: publishContentSchema,
  options: publishOptionsSchema.optional(),
});

// Analytics query schemas
export const analyticsQuerySchema = z.object({
  range: z.enum(['14d', '30d', '90d', '1y']).optional(),
  platforms: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  sortBy: z.enum(['published_at', 'views', 'likes', 'comments', 'shares', 'engagementRate']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});

// Media upload schemas
export const mediaUploadSchema = z.object({
  file: z.instanceof(File).or(z.unknown()),
});

export const mediaUrlUploadSchema = z.object({
  url: z.string().url('url must be a valid URL'),
});

// Platform validation schema
export const platformConfigSchema = z.object({
  accessToken: z.string().min(1, 'Access token is required'),
  // Platform-specific fields
  botToken: z.string().optional(),
  channelId: z.string().optional(),
  apiKey: z.string().optional(),
  apiSecret: z.string().optional(),
  accessTokenSecret: z.string().optional(),
});

// Error response types
export const errorResponseSchema = z.object({
  error: z.string(),
  message: z.string().optional(),
  validationErrors: z.array(z.object({
    field: z.string(),
    message: z.string(),
  })).optional(),
});

export type PublishRequest = z.infer<typeof publishRequestSchema>;
export type PublishContent = z.infer<typeof publishContentSchema>;
export type AnalyticsQuery = z.infer<typeof analyticsQuerySchema>;
