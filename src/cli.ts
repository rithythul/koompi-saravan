#!/usr/bin/env bun
import type { PlatformName, SocialPost } from './platforms/index.js';
import { postToOne, postToAll, getAnalyticsAll, ALL_PLATFORMS } from './platforms/manager.js';
import { schedule, listJobs, processDueJobs } from './scheduler/index.js';

const VALID_PLATFORMS = new Set<string>(ALL_PLATFORMS);

function parseArgs(args: string[]): Map<string, string> {
  const parsed = new Map<string, string>();
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith('--')) {
        parsed.set(key, next);
        i++;
      } else {
        parsed.set(key, 'true');
      }
    }
  }
  return parsed;
}

function parsePlatforms(value: string): PlatformName[] {
  if (value === 'all') return [...ALL_PLATFORMS];
  const platforms = value.split(',').map(p => p.trim());
  for (const p of platforms) {
    if (!VALID_PLATFORMS.has(p)) {
      console.error(`Unknown platform: ${p}`);
      console.error(`Valid platforms: ${ALL_PLATFORMS.join(', ')}`);
      process.exit(1);
    }
  }
  return platforms as PlatformName[];
}

async function handlePost(flags: Map<string, string>): Promise<void> {
  const platformStr = flags.get('platform');
  const text = flags.get('text');

  if (!platformStr || !text) {
    console.error('Usage: bun run src/cli.ts post --platform <platform|all> --text "message" [--image-url URL] [--video-path PATH] [--title TITLE]');
    process.exit(1);
  }

  const platforms = parsePlatforms(platformStr);
  const content: SocialPost = {
    text,
    imageUrl: flags.get('image-url'),
    videoPath: flags.get('video-path'),
    title: flags.get('title'),
  };

  console.log(`Posting to: ${platforms.join(', ')}`);

  if (platforms.length === 1) {
    const result = await postToOne(content, platforms[0]);
    console.log(JSON.stringify(result, null, 2));
  } else {
    const results = await postToAll(content, platforms);
    for (const result of results) {
      const icon = result.success ? '\u2713' : '\u2717';
      console.log(`  ${icon} ${result.platform}: ${result.success ? result.url ?? result.postId : result.error}`);
    }
  }
}

async function handleAnalytics(flags: Map<string, string>): Promise<void> {
  const platformStr = flags.get('platform');
  const postId = flags.get('post-id');

  if (!platformStr || !postId) {
    console.error('Usage: bun run src/cli.ts analytics --platform <platform> --post-id <id>');
    process.exit(1);
  }

  const platforms = parsePlatforms(platformStr);
  const queries = platforms.map(p => ({ platform: p, postId: postId }));
  const results = await getAnalyticsAll(queries);

  for (const result of results) {
    console.log(`\n${result.platform} (${result.postId}):`);
    if (result.error) {
      console.log(`  Error: ${result.error}`);
    } else if (result.data) {
      for (const [key, value] of Object.entries(result.data)) {
        console.log(`  ${key}: ${value}`);
      }
    }
  }
}

async function handleSchedule(flags: Map<string, string>): Promise<void> {
  const platformStr = flags.get('platform');
  const text = flags.get('text');
  const time = flags.get('time');

  if (!platformStr || !text || !time) {
    console.error('Usage: bun run src/cli.ts schedule --platform <platform|all> --text "message" --time "ISO8601"');
    process.exit(1);
  }

  const platforms = parsePlatforms(platformStr);
  const content: SocialPost = {
    text,
    imageUrl: flags.get('image-url'),
    videoPath: flags.get('video-path'),
    title: flags.get('title'),
  };

  const job = schedule(content, platforms, time);
  console.log(`Scheduled job: ${job.id}`);
  console.log(`  Platforms: ${platforms.join(', ')}`);
  console.log(`  Time: ${time}`);
}

async function handleQueue(flags: Map<string, string>): Promise<void> {
  const action = flags.get('action') ?? 'list';

  if (action === 'list') {
    const status = flags.get('status') as 'pending' | 'sent' | 'failed' | undefined;
    const jobs = listJobs(status);
    if (jobs.length === 0) {
      console.log('No jobs in queue');
      return;
    }
    for (const job of jobs) {
      console.log(`  [${job.status}] ${job.id} — ${job.platforms.join(',')} at ${job.scheduledAt}`);
    }
  } else if (action === 'process') {
    const processed = await processDueJobs();
    console.log(`Processed ${processed.length} jobs`);
    for (const job of processed) {
      console.log(`  [${job.status}] ${job.id}`);
    }
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];
  const flags = parseArgs(args.slice(1));

  switch (command) {
    case 'post':
      await handlePost(flags);
      break;
    case 'analytics':
      await handleAnalytics(flags);
      break;
    case 'schedule':
      await handleSchedule(flags);
      break;
    case 'queue':
      await handleQueue(flags);
      break;
    default:
      console.log(`Sarawan Social CLI

Commands:
  post        Post to social platforms
  analytics   Get post analytics
  schedule    Schedule a future post
  queue       Manage job queue

Examples:
  bun run src/cli.ts post --platform telegram --text "Hello from Nimmit"
  bun run src/cli.ts post --platform all --text "Cross-post" --image-url https://example.com/img.jpg
  bun run src/cli.ts analytics --platform x --post-id 123
  bun run src/cli.ts schedule --platform all --text "Post at 9am" --time "2026-04-09T09:00:00+07:00"
  bun run src/cli.ts queue --action list
  bun run src/cli.ts queue --action process`);
      break;
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
