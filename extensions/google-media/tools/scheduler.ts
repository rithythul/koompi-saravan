/**
 * Job Scheduler - Persistent Queue + Cron Integration
 *
 * Schedules posts for future publishing with timezone support
 */

import { promises as fs } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';

export type JobStatus = 'pending' | 'scheduled' | 'running' | 'completed' | 'failed' | 'cancelled';

export type ScheduledJob = {
  id: string;
  type: 'publish_post' | 'render_slideshow' | 'refresh_analytics' | 'generate_content';
  scheduledAt: string; // ISO timestamp
  timezone: string;
  payload: Record<string, any>;
  status: JobStatus;
  attempts: number;
  maxAttempts: number;
  lastAttemptAt?: string;
  lastError?: string;
  result?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
};

export type SchedulerConfig = {
  queueDir?: string;
  maxConcurrent?: number;
  defaultTimezone?: string;
};

/**
 * Load job queue from storage
 */
async function loadQueue(queueDir: string): Promise<Map<string, ScheduledJob>> {
  const jobs = new Map<string, ScheduledJob>();

  try {
    const files = await fs.readdir(queueDir);
    for (const file of files) {
      if (file.endsWith('.json')) {
        const content = await fs.readFile(join(queueDir, file), 'utf-8');
        const job: ScheduledJob = JSON.parse(content);
        jobs.set(job.id, job);
      }
    }
  } catch {
    await fs.mkdir(queueDir, { recursive: true });
  }

  return jobs;
}

/**
 * Save job to storage
 */
async function saveJob(job: ScheduledJob, queueDir: string): Promise<void> {
  await fs.mkdir(queueDir, { recursive: true });
  await fs.writeFile(
    join(queueDir, `${job.id}.json`),
    JSON.stringify(job, null, 2),
    'utf-8',
  );
}

/**
 * Schedule a new job
 */
export async function scheduleJob(
  type: ScheduledJob['type'],
  scheduledAt: string,
  payload: Record<string, any>,
  options: {
    timezone?: string;
    maxAttempts?: number;
  } = {},
  config: SchedulerConfig = {},
): Promise<ScheduledJob> {
  const queueDir = config.queueDir || './var/queue';
  const timezone = options.timezone || config.defaultTimezone || 'UTC';

  const job: ScheduledJob = {
    id: randomUUID(),
    type,
    scheduledAt,
    timezone,
    payload,
    status: 'scheduled',
    attempts: 0,
    maxAttempts: options.maxAttempts || 3,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await saveJob(job, queueDir);
  return job;
}

/**
 * List jobs with filters
 */
export async function listJobs(
  options: {
    status?: JobStatus[];
    type?: ScheduledJob['type'];
    scheduledAfter?: string;
    scheduledBefore?: string;
    limit?: number;
  } = {},
  config: SchedulerConfig = {},
): Promise<{ jobs: ScheduledJob[]; total: number }> {
  const queueDir = config.queueDir || './var/queue';
  const queue = await loadQueue(queueDir);
  let jobs = Array.from(queue.values());

  // Filter by status
  if (options.status) {
    jobs = jobs.filter(j => options.status!.includes(j.status));
  }

  // Filter by type
  if (options.type) {
    jobs = jobs.filter(j => j.type === options.type);
  }

  // Filter by scheduled time
  if (options.scheduledAfter) {
    const after = new Date(options.scheduledAfter);
    jobs = jobs.filter(j => new Date(j.scheduledAt) >= after);
  }
  if (options.scheduledBefore) {
    const before = new Date(options.scheduledBefore);
    jobs = jobs.filter(j => new Date(j.scheduledAt) <= before);
  }

  // Sort by scheduled time
  jobs.sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());

  const total = jobs.length;

  // Apply limit
  if (options.limit) {
    jobs = jobs.slice(0, options.limit);
  }

  return { jobs, total };
}

/**
 * Get a single job
 */
export async function getJob(
  jobId: string,
  config: SchedulerConfig = {},
): Promise<ScheduledJob | null> {
  const queueDir = config.queueDir || './var/queue';
  const queue = await loadQueue(queueDir);
  return queue.get(jobId) || null;
}

/**
 * Cancel a scheduled job
 */
export async function cancelJob(
  jobId: string,
  config: SchedulerConfig = {},
): Promise<ScheduledJob | null> {
  const queueDir = config.queueDir || './var/queue';
  const queue = await loadQueue(queueDir);
  const job = queue.get(jobId);

  if (!job) return null;
  if (job.status === 'running' || job.status === 'completed') {
    throw new Error(`Cannot cancel job in ${job.status} state`);
  }

  job.status = 'cancelled';
  job.updatedAt = new Date().toISOString();
  await saveJob(job, queueDir);
  return job;
}

/**
 * Update job status (for worker)
 */
export async function updateJobStatus(
  jobId: string,
  status: JobStatus,
  options: {
    error?: string;
    result?: Record<string, any>;
  } = {},
  config: SchedulerConfig = {},
): Promise<ScheduledJob | null> {
  const queueDir = config.queueDir || './var/queue';
  const queue = await loadQueue(queueDir);
  const job = queue.get(jobId);

  if (!job) return null;

  job.status = status;
  job.updatedAt = new Date().toISOString();

  if (status === 'running' || status === 'failed') {
    job.lastAttemptAt = new Date().toISOString();
    job.attempts += 1;
  }

  if (options.error) job.lastError = options.error;
  if (options.result) job.result = options.result;

  await saveJob(job, queueDir);
  return job;
}

/**
 * Get due jobs (ready to execute)
 */
export async function getDueJobs(
  config: SchedulerConfig = {},
): Promise<ScheduledJob[]> {
  const queueDir = config.queueDir || './var/queue';
  const queue = await loadQueue(queueDir);
  const now = new Date();

  return Array.from(queue.values()).filter(job => {
    if (job.status !== 'scheduled') return false;
    if (new Date(job.scheduledAt) > now) return false;
    if (job.attempts >= job.maxAttempts) return false;
    return true;
  });
}

/**
 * OpenClaw tool definitions
 */
export const scheduleJobTool = {
  name: 'schedule_job',
  description: 'Schedule a job (publish, render, refresh, generate) for future execution.',
  parameters: {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        enum: ['publish_post', 'render_slideshow', 'refresh_analytics', 'generate_content'],
        description: 'Job type',
      },
      scheduled_at: {
        type: 'string',
        description: 'ISO timestamp when to execute (e.g., 2026-03-26T09:00:00Z)',
      },
      payload_json: {
        type: 'string',
        description: 'JSON string with job parameters',
      },
      timezone: {
        type: 'string',
        description: 'Timezone for scheduling (default: UTC)',
      },
    },
    required: ['type', 'scheduled_at', 'payload_json'],
  },
};

export const listJobsTool = {
  name: 'list_jobs',
  description: 'List scheduled jobs with filters.',
  parameters: {
    type: 'object',
    properties: {
      status: {
        type: 'string',
        description: 'Comma-separated status filter (pending,scheduled,running,completed,failed,cancelled)',
      },
      type: {
        type: 'string',
        enum: ['publish_post', 'render_slideshow', 'refresh_analytics', 'generate_content'],
      },
      limit: {
        type: 'number',
        description: 'Max results (default: 50)',
      },
    },
  },
};

export const cancelJobTool = {
  name: 'cancel_job',
  description: 'Cancel a scheduled job.',
  parameters: {
    type: 'object',
    properties: {
      job_id: {
        type: 'string',
        description: 'Job ID to cancel',
      },
    },
    required: ['job_id'],
  },
};

export const getJobTool = {
  name: 'get_job',
  description: 'Get job details and status.',
  parameters: {
    type: 'object',
    properties: {
      job_id: {
        type: 'string',
        description: 'Job ID',
      },
    },
    required: ['job_id'],
  },
};

export function createScheduleJobTool(config: any = {}) {
  const schedulerConfig: SchedulerConfig = {
    queueDir: config.queueDir || join(config.defaultOutputDir || './var/outputs', 'queue'),
    defaultTimezone: config.defaultTimezone,
  };

  return {
    ...scheduleJobTool,
    execute: async (params: any) => {
      const payload = JSON.parse(params.payload_json);
      return scheduleJob(params.type, params.scheduled_at, payload, { timezone: params.timezone }, schedulerConfig);
    },
  };
}

export function createListJobsTool(config: any = {}) {
  const schedulerConfig: SchedulerConfig = {
    queueDir: config.queueDir || join(config.defaultOutputDir || './var/outputs', 'queue'),
  };

  return {
    ...listJobsTool,
    execute: async (params: any) => {
      const status = params.status?.split(',') as JobStatus[] | undefined;
      return listJobs({ ...params, status }, schedulerConfig);
    },
  };
}

export function createCancelJobTool(config: any = {}) {
  const schedulerConfig: SchedulerConfig = {
    queueDir: config.queueDir || join(config.defaultOutputDir || './var/outputs', 'queue'),
  };

  return {
    ...cancelJobTool,
    execute: async (params: any) => {
      return cancelJob(params.job_id, schedulerConfig);
    },
  };
}

export function createGetJobTool(config: any = {}) {
  const schedulerConfig: SchedulerConfig = {
    queueDir: config.queueDir || join(config.defaultOutputDir || './var/outputs', 'queue'),
  };

  return {
    ...getJobTool,
    execute: async (params: any) => {
      return getJob(params.job_id, schedulerConfig);
    },
  };
}
