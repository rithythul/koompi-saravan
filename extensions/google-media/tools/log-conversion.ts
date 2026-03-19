import { randomUUID } from 'crypto';

import { Type } from '@sinclair/typebox';

import { loadConfig, type GoogleMediaConfigInput } from '../lib/config.js';
import {
  getPostById,
  getPostByPlatformPostId,
  getPostByRunId,
  initStore,
  saveConversionEvent,
} from '../lib/store.js';
import type { ConversionType, Platform } from '../lib/types.js';

function resolvePostId(params: {
  explicitPostId?: string;
  runId?: string;
  platform?: Platform;
  platformPostId?: string;
}, store: ReturnType<typeof initStore>): string {
  if (params.explicitPostId) {
    const post = getPostById(store, params.explicitPostId);
    if (!post) {
      throw new Error(`Post not found: ${params.explicitPostId}`);
    }
    return post.id;
  }

  if (params.platform && params.platformPostId) {
    const post = getPostByPlatformPostId(store, params.platform, params.platformPostId);
    if (!post) {
      throw new Error(
        `No post found for ${params.platform} platformPostId ${params.platformPostId}.`,
      );
    }
    return post.id;
  }

  if (params.runId) {
    const post = getPostByRunId(store, params.runId, params.platform);
    if (!post) {
      throw new Error(`No post found for run ${params.runId}.`);
    }
    return post.id;
  }

  throw new Error('Provide postId, runId, or platform + platformPostId to log a conversion.');
}

export function createLogConversionTool(configOverrides: GoogleMediaConfigInput = {}) {
  return {
    name: 'log_conversion',
    description:
      'Record a downstream conversion event and attach it to a tracked post so future planning can optimize for business outcomes.',
    parameters: Type.Object({
      postId: Type.Optional(Type.String()),
      runId: Type.Optional(Type.String()),
      platform: Type.Optional(
        Type.Union([Type.Literal('tiktok'), Type.Literal('instagram')]),
      ),
      platformPostId: Type.Optional(Type.String()),
      eventType: Type.Union([
        Type.Literal('lead'),
        Type.Literal('signup'),
        Type.Literal('purchase'),
        Type.Literal('click'),
        Type.Literal('dm'),
        Type.Literal('other'),
      ]),
      occurredAt: Type.String({ description: 'ISO timestamp for when the conversion happened.' }),
      value: Type.Optional(Type.Number({ description: 'Optional revenue or attributed value.' })),
      currency: Type.Optional(Type.String({ minLength: 3, maxLength: 3 })),
      quantity: Type.Optional(Type.Number({ minimum: 1, maximum: 100000, default: 1 })),
      source: Type.Optional(Type.String({ description: 'Optional attribution source label.' })),
      notes: Type.Optional(Type.String({ description: 'Optional freeform note.' })),
    }),
    async execute(
      _id: string,
      params: {
        postId?: string;
        runId?: string;
        platform?: Platform;
        platformPostId?: string;
        eventType: ConversionType;
        occurredAt: string;
        value?: number;
        currency?: string;
        quantity?: number;
        source?: string;
        notes?: string;
      },
    ) {
      const config = loadConfig(configOverrides);
      const store = initStore(config);
      const occurredAt = new Date(params.occurredAt);

      if (Number.isNaN(occurredAt.getTime())) {
        throw new Error(`Invalid occurredAt timestamp: ${params.occurredAt}`);
      }

      const postId = resolvePostId(
        {
          explicitPostId: params.postId?.trim() || undefined,
          runId: params.runId?.trim() || undefined,
          platform: params.platform,
          platformPostId: params.platformPostId?.trim() || undefined,
        },
        store,
      );

      const conversion = saveConversionEvent(store, {
        id: randomUUID(),
        postId,
        occurredAt: occurredAt.toISOString(),
        eventType: params.eventType,
        value: params.value,
        currency: params.currency?.toUpperCase(),
        quantity: params.quantity ?? 1,
        metadata: {
          source: params.source,
          notes: params.notes,
        },
      });

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                success: true,
                conversionId: conversion.id,
                postId: conversion.postId,
                eventType: conversion.eventType,
                quantity: conversion.quantity,
                value: conversion.value,
                createdAt: conversion.createdAt,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  };
}

export const logConversionTool = createLogConversionTool();
