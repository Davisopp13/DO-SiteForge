import { execSync } from 'node:child_process';
import type { ChatMessage, PageContext } from '../ai.js';
import type { SiteForgeConfig } from '../config.js';
import { hasApiKey } from '../config.js';

// --- Provider Interface ---

export interface ChatParams {
  message: string;
  context: PageContext;
  history: ChatMessage[];
  projectRoot: string;
  model?: string;
}

export interface ChatEvent {
  type: 'delta' | 'done' | 'error' | 'file_changed';
  data: any;
}

export interface AIProvider {
  name: string;
  available: boolean;
  supportsDirectFileWrites: boolean;
  streamChat(params: ChatParams): AsyncIterable<ChatEvent>;
}

// --- Detection ---

export interface ProviderDetectionResult {
  preferred: AIProvider | null;
  fallback: AIProvider | null;
  active: AIProvider;
}

let cachedClaudeCodeAvailable: boolean | null = null;

/**
 * Check if `claude` CLI is available in PATH.
 * Result is cached for the process lifetime.
 */
export function isClaudeCodeAvailable(): boolean {
  if (cachedClaudeCodeAvailable !== null) return cachedClaudeCodeAvailable;

  try {
    execSync('which claude', { stdio: 'ignore' });
    cachedClaudeCodeAvailable = true;
  } catch {
    cachedClaudeCodeAvailable = false;
  }

  return cachedClaudeCodeAvailable;
}

/**
 * Placeholder provider returned when no real provider is available.
 * Always yields an error event.
 */
const disabledProvider: AIProvider = {
  name: 'disabled',
  available: false,
  supportsDirectFileWrites: false,
  async *streamChat(): AsyncIterable<ChatEvent> {
    yield { type: 'error', data: { message: 'No AI provider available. Install Claude Code or set an API key.' } };
  },
};

/**
 * Detect available providers and select the active one.
 *
 * Priority: Claude Code CLI (if in PATH) > Anthropic API (if key configured) > disabled
 *
 * Provider instances are lazily created — the actual provider modules
 * (claude-code.ts, anthropic-api.ts) are imported by the caller and passed in.
 * This function only determines *which* provider to use based on availability.
 */
export function detectProviders(
  config: SiteForgeConfig,
  createClaudeCodeProvider?: () => AIProvider,
  createAnthropicApiProvider?: () => AIProvider
): ProviderDetectionResult {
  const claudeAvailable = isClaudeCodeAvailable();
  const apiKeyAvailable = hasApiKey(config);

  const preferred = claudeAvailable && createClaudeCodeProvider
    ? createClaudeCodeProvider()
    : null;

  const fallback = apiKeyAvailable && createAnthropicApiProvider
    ? createAnthropicApiProvider()
    : null;

  // Active = preferred if available, else fallback, else disabled
  const active = preferred ?? fallback ?? disabledProvider;

  return { preferred, fallback, active };
}
