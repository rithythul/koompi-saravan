import { Type } from '@sinclair/typebox';
import { loadConfig } from '../lib/config.js';

export function createConfigValidatorTool() {
  return {
    name: 'config_validator',
    description: 'Verify which API credentials are set in the environment or configuration.',
    parameters: Type.Object({}),
    async execute() {
      const config = loadConfig();
      const keys = [
        'geminiApiKey',
        'instagramAccessToken',
        'instagramBusinessAccountId',
        'tiktokAccessToken',
        'tiktokCreatorId',
        'facebookAppId',
        'facebookAppSecret',
        'facebookAccessToken',
        'youtubeClientId',
        'youtubeClientSecret',
        'youtubeRefreshToken',
        'linkedinClientId',
        'linkedinClientSecret',
        'linkedinAccessToken',
        'xApiKey',
        'xApiSecret',
        'xAccessToken',
        'xAccessSecret',
        'telegramBotToken',
        'telegramChannelId'
      ] as const;

      const report: Record<string, string> = {};
      for (const key of keys) {
        report[key] = config[key as keyof typeof config] ? '✅ OK' : '❌ MISSING';
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(report, null, 2) }],
      };
    },
  };
}

export const configValidatorTool = createConfigValidatorTool();
