import type { AIProvider, ChatParams, ChatEvent } from './types.js';
import { buildSystemPrompt, type ChatMessage } from '../ai.js';
import type { SiteForgeConfig } from '../config.js';
import { hasApiKey } from '../config.js';

/**
 * Create an Anthropic API provider that wraps the raw API calls.
 * Uses the existing streamChat logic from ai.ts, adapted to yield ChatEvent objects.
 */
export function createAnthropicApiProvider(config: SiteForgeConfig): AIProvider {
  return {
    name: 'anthropic-api',
    available: hasApiKey(config),
    supportsDirectFileWrites: false,

    async *streamChat(params: ChatParams): AsyncIterable<ChatEvent> {
      const { message, context, history, projectRoot } = params;

      const apiKey = config.anthropicApiKey;
      if (!apiKey) {
        yield { type: 'error', data: { message: 'No API key configured.' } };
        return;
      }

      // Build conversation: history + new user message
      const messages: ChatMessage[] = [
        ...history,
        { role: 'user', content: message },
      ];

      // Inject projectRoot into context for system prompt building
      const fullContext = context ? { ...context, rootDir: context.rootDir || projectRoot } : undefined;
      const systemPrompt = buildSystemPrompt(fullContext);

      const MODEL_MAP: Record<string, string> = {
        sonnet: 'claude-sonnet-4-20250514',
        opus: 'claude-opus-4-6',
        haiku: 'claude-haiku-4-5-20251001',
      };
      const model = (params.model && MODEL_MAP[params.model]) || config.model || 'claude-sonnet-4-20250514';
      const maxTokens = config.maxTokens || 4096;

      const body = {
        model,
        max_tokens: maxTokens,
        system: systemPrompt,
        stream: true,
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
      };

      let response: Response;
      try {
        response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify(body),
        });
      } catch (err) {
        yield {
          type: 'error',
          data: {
            message: `Failed to connect to Anthropic API: ${err instanceof Error ? err.message : String(err)}`,
            errorType: 'network_error',
          },
        };
        return;
      }

      if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        let errorMessage = `Anthropic API error (${response.status})`;
        let errorType: string = 'unknown_error';

        try {
          const parsed = JSON.parse(errorBody);
          if (parsed.error?.message) errorMessage = parsed.error.message;
        } catch {
          if (errorBody) errorMessage += `: ${errorBody.slice(0, 200)}`;
        }

        switch (response.status) {
          case 401:
            errorType = 'auth_error';
            errorMessage = 'Invalid API key. Check your ANTHROPIC_API_KEY.';
            break;
          case 429:
            errorType = 'rate_limit';
            errorMessage = 'Rate limited by Anthropic API. Please wait a moment and try again.';
            break;
          case 500:
          case 502:
          case 503:
            errorType = 'server_error';
            errorMessage = 'Anthropic API is temporarily unavailable. Please try again.';
            break;
        }

        yield { type: 'error', data: { message: errorMessage, errorType } };
        return;
      }

      if (!response.body) {
        yield { type: 'error', data: { message: 'No response body received from Anthropic API', errorType: 'unknown_error' } };
        return;
      }

      // Parse SSE stream from Anthropic and yield ChatEvents
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Process complete SSE lines
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6).trim();
            if (!data || data === '[DONE]') continue;

            try {
              const event = JSON.parse(data);
              if (
                event.type === 'content_block_delta' &&
                event.delta?.type === 'text_delta' &&
                event.delta.text
              ) {
                yield { type: 'delta', data: { text: event.delta.text } };
              }
            } catch {
              // Skip malformed JSON lines
            }
          }
        }
      } catch (err) {
        yield {
          type: 'error',
          data: {
            message: `Stream read error: ${err instanceof Error ? err.message : String(err)}`,
            errorType: 'network_error',
          },
        };
        return;
      }

      yield { type: 'done', data: {} };
    },
  };
}
