import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { dirname } from 'path';
import { homedir } from 'os';
import { join } from 'path';
import { postToOne, postToAll } from '../platforms/manager.js';
import type { SocialPost, PostResult, PlatformName } from '../platforms/index.js';

const QUEUE_PATH = join(homedir(), '.openclaw', 'nimmit', 'memory', 'working', 'social-queue.json');
const MAX_RETRIES = 3;

export type JobStatus = 'pending' | 'sent' | 'failed';

export interface ScheduledJob {
  id: string;
  content: SocialPost;
  platforms: PlatformName[];
  scheduledAt: string; // ISO 8601
  status: JobStatus;
  attempts: number;
  results: PostResult[];
  createdAt: string;
  lastAttemptAt?: string;
  error?: string;
}

interface QueueData {
  jobs: ScheduledJob[];
}

function loadQueue(): QueueData {
  try {
    if (existsSync(QUEUE_PATH)) {
      const raw = readFileSync(QUEUE_PATH, 'utf-8');
      return JSON.parse(raw) as QueueData;
    }
  } catch {
    // Corrupted file, start fresh
  }
  return { jobs: [] };
}

function saveQueue(queue: QueueData): void {
  const dir = dirname(QUEUE_PATH);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(QUEUE_PATH, JSON.stringify(queue, null, 2), 'utf-8');
}

function generateId(): string {
  return `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function schedule(
  content: SocialPost,
  platforms: PlatformName[],
  scheduledAt: string,
): ScheduledJob {
  const queue = loadQueue();
  const job: ScheduledJob = {
    id: generateId(),
    content,
    platforms,
    scheduledAt,
    status: 'pending',
    attempts: 0,
    results: [],
    createdAt: new Date().toISOString(),
  };
  queue.jobs.push(job);
  saveQueue(queue);
  return job;
}

export function listJobs(status?: JobStatus): ScheduledJob[] {
  const queue = loadQueue();
  if (status) {
    return queue.jobs.filter(j => j.status === status);
  }
  return queue.jobs;
}

export function getJob(id: string): ScheduledJob | undefined {
  const queue = loadQueue();
  return queue.jobs.find(j => j.id === id);
}

export function removeJob(id: string): boolean {
  const queue = loadQueue();
  const idx = queue.jobs.findIndex(j => j.id === id);
  if (idx === -1) return false;
  queue.jobs.splice(idx, 1);
  saveQueue(queue);
  return true;
}

async function executeJob(job: ScheduledJob): Promise<ScheduledJob> {
  job.attempts++;
  job.lastAttemptAt = new Date().toISOString();

  try {
    let results: PostResult[];
    if (job.platforms.length === 1) {
      const result = await postToOne(job.content, job.platforms[0]);
      results = [result];
    } else {
      results = await postToAll(job.content, job.platforms);
    }

    job.results = results;
    const allSucceeded = results.every(r => r.success);
    const anySucceeded = results.some(r => r.success);

    if (allSucceeded) {
      job.status = 'sent';
    } else if (!anySucceeded && job.attempts >= MAX_RETRIES) {
      job.status = 'failed';
      job.error = results
        .filter(r => !r.success)
        .map(r => `${r.platform}: ${r.error}`)
        .join('; ');
    }
    // If partial success and retries remain, keep as pending to retry failed ones
  } catch (error) {
    if (job.attempts >= MAX_RETRIES) {
      job.status = 'failed';
      job.error = error instanceof Error ? error.message : String(error);
    }
  }

  return job;
}

export async function processDueJobs(): Promise<ScheduledJob[]> {
  const queue = loadQueue();
  const now = new Date();
  const processed: ScheduledJob[] = [];

  for (const job of queue.jobs) {
    if (job.status !== 'pending') continue;
    if (new Date(job.scheduledAt) > now) continue;
    if (job.attempts >= MAX_RETRIES) {
      job.status = 'failed';
      processed.push(job);
      continue;
    }

    const updated = await executeJob(job);
    processed.push(updated);
  }

  saveQueue(queue);
  return processed;
}

export async function retryFailed(): Promise<ScheduledJob[]> {
  const queue = loadQueue();
  const retried: ScheduledJob[] = [];

  for (const job of queue.jobs) {
    if (job.status !== 'failed') continue;
    if (job.attempts >= MAX_RETRIES) continue;

    job.status = 'pending';
    const updated = await executeJob(job);
    retried.push(updated);
  }

  saveQueue(queue);
  return retried;
}

export { QUEUE_PATH };
