import path from 'path';

export interface GoogleMediaConfig {
  geminiApiKey?: string;
  defaultOutputDir: string;
  dryRun: boolean;
  killSwitch: boolean;
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

  return {
    geminiApiKey,
    defaultOutputDir,
    dryRun,
    killSwitch,
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
