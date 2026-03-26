import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { homedir } from 'os';

function loadEnvFile(filePath: string): void {
  if (!existsSync(filePath)) return;
  const content = readFileSync(filePath, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    // Strip surrounding quotes
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

// Load secrets from ~/.secrets/openclaw.env
loadEnvFile(resolve(homedir(), '.secrets', 'openclaw.env'));

function env(key: string): string {
  return process.env[key] ?? '';
}

export interface PlatformConfig {
  accessToken: string;
  [key: string]: string;
}

export interface LinkedInConfig extends PlatformConfig {
  orgId: string;
}

export interface FacebookConfig extends PlatformConfig {
  pageId: string;
}

export interface InstagramConfig extends PlatformConfig {
  accountId: string;
}

export interface TikTokConfig extends PlatformConfig {
  clientKey: string;
}

export interface YouTubeConfig extends PlatformConfig {
  channelId: string;
}

export interface PinterestConfig extends PlatformConfig {
  boardId: string;
}

export interface SarawanConfig {
  linkedin: LinkedInConfig;
  facebook: FacebookConfig;
  instagram: InstagramConfig;
  tiktok: TikTokConfig;
  youtube: YouTubeConfig;
  pinterest: PinterestConfig;
}

export const config: SarawanConfig = {
  linkedin: {
    accessToken: env('LINKEDIN_ACCESS_TOKEN'),
    orgId: env('LINKEDIN_ORGANIZATION_ID'),
  },
  facebook: {
    accessToken: env('FACEBOOK_PAGE_ACCESS_TOKEN'),
    pageId: env('FACEBOOK_PAGE_ID'),
  },
  instagram: {
    accessToken: env('INSTAGRAM_ACCESS_TOKEN'),
    accountId: env('INSTAGRAM_BUSINESS_ACCOUNT_ID'),
  },
  tiktok: {
    accessToken: env('TIKTOK_ACCESS_TOKEN'),
    clientKey: env('TIKTOK_CLIENT_KEY'),
  },
  youtube: {
    accessToken: env('YOUTUBE_ACCESS_TOKEN'),
    channelId: env('YOUTUBE_CHANNEL_ID'),
  },
  pinterest: {
    accessToken: env('PINTEREST_ACCESS_TOKEN'),
    boardId: env('PINTEREST_BOARD_ID'),
  },
};
