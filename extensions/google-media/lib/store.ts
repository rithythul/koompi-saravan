import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { Database } from 'bun:sqlite';

import type { GoogleMediaConfig } from './config.js';
import { getOutputRoot } from './output-paths.js';
import type { ContentRun, GeneratedAsset, RenderedVideo, RunStatus } from './types.js';

export interface GoogleMediaStore {
  db: Database;
  dbPath: string;
}

const stores = new Map<string, GoogleMediaStore>();
const migrationsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');
const initSql = fs.readFileSync(path.join(migrationsDir, '001_init.sql'), 'utf8');

function parseMetadata(value: string): Record<string, unknown> {
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function serializeMetadata(value?: Record<string, unknown>): string {
  return JSON.stringify(value ?? {});
}

function getDatabasePath(config: GoogleMediaConfig): string {
  return path.join(path.dirname(getOutputRoot(config)), 'google-media.sqlite');
}

function openStore(dbPath: string): GoogleMediaStore {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath, { create: true });
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec(initSql);
  return { db, dbPath };
}

export function initStore(config: GoogleMediaConfig): GoogleMediaStore {
  const dbPath = getDatabasePath(config);
  const existing = stores.get(dbPath);
  if (existing) {
    return existing;
  }

  const store = openStore(dbPath);
  stores.set(dbPath, store);
  return store;
}

function mapRun(row: Record<string, unknown>): ContentRun {
  return {
    id: String(row.id),
    status: row.status as RunStatus,
    prompt: row.prompt ? String(row.prompt) : undefined,
    outputDir: String(row.output_dir),
    error: row.error ? String(row.error) : undefined,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    metadata: parseMetadata(String(row.metadata_json ?? '{}')),
  };
}

export function createRun(
  store: GoogleMediaStore,
  input: {
    id: string;
    prompt?: string;
    outputDir: string;
    status?: RunStatus;
    metadata?: Record<string, unknown>;
  },
): ContentRun {
  const now = new Date().toISOString();
  const status = input.status ?? 'pending';

  store.db
    .prepare(
      `INSERT INTO content_runs (id, status, prompt, output_dir, error, metadata_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, NULL, ?, ?, ?)`,
    )
    .run(
      input.id,
      status,
      input.prompt ?? null,
      input.outputDir,
      serializeMetadata(input.metadata),
      now,
      now,
    );

  return getRunById(store, input.id)!;
}

export function getRunById(store: GoogleMediaStore, runId: string): ContentRun | null {
  const row = store.db
    .prepare('SELECT * FROM content_runs WHERE id = ?')
    .get(runId) as Record<string, unknown> | undefined;

  return row ? mapRun(row) : null;
}

export function updateRunStatus(
  store: GoogleMediaStore,
  runId: string,
  status: RunStatus,
  options: {
    error?: string;
    metadata?: Record<string, unknown>;
  } = {},
): ContentRun {
  const existing = getRunById(store, runId);
  if (!existing) {
    throw new Error(`Run not found: ${runId}`);
  }

  const metadata = { ...existing.metadata, ...(options.metadata ?? {}) };
  const updatedAt = new Date().toISOString();

  store.db
    .prepare(
      `UPDATE content_runs
       SET status = ?,
           error = ?,
           metadata_json = ?,
           updated_at = ?
       WHERE id = ?`,
    )
    .run(
      status,
      options.error ?? null,
      serializeMetadata(metadata),
      updatedAt,
      runId,
    );

  return getRunById(store, runId)!;
}

export function saveGeneratedAsset(
  store: GoogleMediaStore,
  asset: Omit<GeneratedAsset, 'createdAt'>,
): GeneratedAsset {
  const createdAt = new Date().toISOString();
  store.db
    .prepare(
      `INSERT INTO generated_assets (id, run_id, kind, mime_type, file_path, file_size_bytes, metadata_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      asset.id,
      asset.runId,
      asset.kind,
      asset.mimeType,
      asset.filePath,
      asset.fileSizeBytes,
      serializeMetadata(asset.metadata),
      createdAt,
    );

  return {
    ...asset,
    createdAt,
  };
}

export function saveRenderedVideo(
  store: GoogleMediaStore,
  video: Omit<RenderedVideo, 'createdAt'>,
): RenderedVideo {
  const createdAt = new Date().toISOString();
  store.db
    .prepare(
      `INSERT INTO rendered_videos (id, run_id, composition_id, file_path, width, height, fps, duration_in_frames, metadata_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      video.id,
      video.runId,
      video.compositionId,
      video.filePath,
      video.width,
      video.height,
      video.fps,
      video.durationInFrames,
      serializeMetadata(video.metadata),
      createdAt,
    );

  return {
    ...video,
    createdAt,
  };
}
