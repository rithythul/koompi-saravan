import path from 'path';

export interface GoogleMediaConfig {
  geminiApiKey?: string;
  defaultOutputDir: string;
  dryRun: boolean;
  killSwitch: boolean;
  publicMediaBaseUrl?: string;
  instagramAccessToken?: string;
  instagramBusinessAccountId?: string;
  instagramApiBaseUrl: string;
  tiktokAccessToken?: string;
  tiktokCreatorId?: string;
  tiktokApiBaseUrl: string;
}

export type GoogleMediaConfigInput = Partial<GoogleMediaConfig>;

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);
const FALSE_VALUES = new Set(['0', 'false', 'no', 'off']);

function parseBoolean(value: string | boolean | undefined): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return undefined;

  const normalized = value.trim().toLowerCase();
  if (TRUE_VALUES.has(normalized)) return true;
  if (FALSE_VALUES.has(normalized)) return false;
  return undefined;
}

function resolveOutputDir(value?: string): string {
  return path.resolve(value ?? path.join(process.cwd(), 'var', 'outputs'));
}

export function loadConfig(overrides: GoogleMediaConfigInput = {}): GoogleMediaConfig {
  const geminiApiKey = overrides.geminiApiKey ?? process.env.GEMINI_API_KEY ?? undefined;
  const defaultOutputDir = resolveOutputDir(
    overrides.defaultOutputDir ?? process.env.GOOGLE_MEDIA_OUTPUT_DIR,
  );
  const dryRun =
    overrides.dryRun ?? parseBoolean(process.env.GOOGLE_MEDIA_DRY_RUN) ?? false;
  const killSwitch =
    overrides.killSwitch ?? parseBoolean(process.env.GOOGLE_MEDIA_KILL_SWITCH) ?? false;
  const publicMediaBaseUrl =
    overrides.publicMediaBaseUrl ?? process.env.GOOGLE_MEDIA_PUBLIC_BASE_URL ?? undefined;
  const instagramAccessToken =
    overrides.instagramAccessToken ?? process.env.INSTAGRAM_ACCESS_TOKEN ?? undefined;
  const instagramBusinessAccountId =
    overrides.instagramBusinessAccountId ?? process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID ?? undefined;
  const instagramApiBaseUrl =
    overrides.instagramApiBaseUrl ?? process.env.INSTAGRAM_API_BASE_URL ?? 'https://graph.facebook.com/v23.0';
  const tiktokAccessToken =
    overrides.tiktokAccessToken ?? process.env.TIKTOK_ACCESS_TOKEN ?? undefined;
  const tiktokCreatorId = overrides.tiktokCreatorId ?? process.env.TIKTOK_CREATOR_ID ?? undefined;
  const tiktokApiBaseUrl =
    overrides.tiktokApiBaseUrl ?? process.env.TIKTOK_API_BASE_URL ?? 'https://open.tiktokapis.com/v2';

  return {
    geminiApiKey,
    defaultOutputDir,
    dryRun,
    killSwitch,
    publicMediaBaseUrl,
    instagramAccessToken,
    instagramBusinessAccountId,
    instagramApiBaseUrl,
    tiktokAccessToken,
    tiktokCreatorId,
    tiktokApiBaseUrl,
  };
}

export function assertAutomationEnabled(config: GoogleMediaConfig): void {
  if (config.killSwitch) {
    throw new Error('Automation is disabled by kill switch. Clear GOOGLE_MEDIA_KILL_SWITCH or plugin config to continue.');
  }
}

export function requireGeminiApiKey(
  config: GoogleMediaConfig,
  override?: string,
): string {
  const apiKey = override?.trim() || config.geminiApiKey?.trim();
  if (!apiKey) {
    throw new Error('Gemini API key not configured. Set geminiApiKey in plugin config or GEMINI_API_KEY in the environment.');
  }

  return apiKey;
}

export function requireInstagramPublishConfig(config: GoogleMediaConfig): {
  accessToken: string;
  businessAccountId: string;
  apiBaseUrl: string;
} {
  const accessToken = config.instagramAccessToken?.trim();
  const businessAccountId = config.instagramBusinessAccountId?.trim();

  if (!accessToken || !businessAccountId) {
    throw new Error(
      'Instagram publishing is not configured. Set instagramAccessToken and instagramBusinessAccountId in plugin config or environment.',
    );
  }

  return {
    accessToken,
    businessAccountId,
    apiBaseUrl: config.instagramApiBaseUrl,
  };
}

export function requireTikTokPublishConfig(config: GoogleMediaConfig): {
  accessToken: string;
  creatorId: string;
  apiBaseUrl: string;
} {
  const accessToken = config.tiktokAccessToken?.trim();
  const creatorId = config.tiktokCreatorId?.trim();

  if (!accessToken || !creatorId) {
    throw new Error(
      'TikTok publishing is not configured. Set tiktokAccessToken and tiktokCreatorId in plugin config or environment.',
    );
  }

  return {
    accessToken,
    creatorId,
    apiBaseUrl: config.tiktokApiBaseUrl,
  };
}
