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

export interface TelegramConfig extends PlatformConfig {
  botToken: string;
  channelId: string;
}

export interface XConfig extends PlatformConfig {
  apiKey: string;
  apiSecret: string;
  accessTokenSecret: string;
}

export interface SarawanConfig {
  telegram: TelegramConfig;
  x: XConfig;
}

export const config: SarawanConfig = {
  telegram: {
    accessToken: env('TELEGRAM_CHANNEL_BOT_TOKEN'),
    botToken: env('TELEGRAM_CHANNEL_BOT_TOKEN'),
    channelId: env('TELEGRAM_CHANNEL_ID'),
  },
  x: {
    accessToken: env('X_ACCESS_TOKEN'),
    apiKey: env('X_API_KEY'),
    apiSecret: env('X_API_SECRET'),
    accessTokenSecret: env('X_ACCESS_TOKEN_SECRET'),
  },
};
