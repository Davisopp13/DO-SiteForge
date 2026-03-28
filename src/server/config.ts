import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export interface SiteForgeConfig {
  anthropicApiKey?: string;
  model?: string;
  maxTokens?: number;
}

const DEFAULT_MODEL = 'claude-sonnet-4-20250514';
const DEFAULT_MAX_TOKENS = 4096;

/**
 * Load config from (in priority order):
 * 1. Environment variables
 * 2. Project-local siteforge.config.json
 * 3. Global ~/.siteforge/config.json
 */
export function loadConfig(projectDir?: string): SiteForgeConfig {
  const globalConfig = loadJsonConfig(path.join(os.homedir(), '.siteforge', 'config.json'));
  const projectConfig = projectDir
    ? loadJsonConfig(path.join(projectDir, 'siteforge.config.json'))
    : {};

  // Merge: global < project < env
  const merged: SiteForgeConfig = {
    ...globalConfig,
    ...projectConfig,
  };

  // Environment variables take highest priority
  if (process.env.ANTHROPIC_API_KEY) {
    merged.anthropicApiKey = process.env.ANTHROPIC_API_KEY;
  }

  // Apply defaults for non-key fields
  if (!merged.model) merged.model = DEFAULT_MODEL;
  if (!merged.maxTokens) merged.maxTokens = DEFAULT_MAX_TOKENS;

  return merged;
}

function loadJsonConfig(filePath: string): Partial<SiteForgeConfig> {
  try {
    if (!fs.existsSync(filePath)) return {};
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    const config: Partial<SiteForgeConfig> = {};

    if (typeof parsed.anthropicApiKey === 'string') config.anthropicApiKey = parsed.anthropicApiKey;
    if (typeof parsed.model === 'string') config.model = parsed.model;
    if (typeof parsed.maxTokens === 'number') config.maxTokens = parsed.maxTokens;

    return config;
  } catch {
    return {};
  }
}

/**
 * Save API key to the global config file (~/.siteforge/config.json).
 * Creates the directory if it doesn't exist.
 */
export function setApiKey(apiKey: string): void {
  const configDir = path.join(os.homedir(), '.siteforge');
  const configPath = path.join(configDir, 'config.json');

  let existing: Record<string, unknown> = {};
  try {
    if (fs.existsSync(configPath)) {
      existing = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    }
  } catch {
    // Start fresh if file is corrupted
  }

  existing.anthropicApiKey = apiKey;

  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(existing, null, 2) + '\n', 'utf-8');
}

/**
 * Save model preference to the global config file (~/.siteforge/config.json).
 */
export function setModel(model: string): void {
  const configDir = path.join(os.homedir(), '.siteforge');
  const configPath = path.join(configDir, 'config.json');

  let existing: Record<string, unknown> = {};
  try {
    if (fs.existsSync(configPath)) {
      existing = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    }
  } catch {
    // Start fresh if file is corrupted
  }

  existing.model = model;

  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(existing, null, 2) + '\n', 'utf-8');
}

/**
 * Check if the config has a usable API key.
 */
export function hasApiKey(config: SiteForgeConfig): boolean {
  return typeof config.anthropicApiKey === 'string' && config.anthropicApiKey.length > 0;
}
