import type { SiteForgeConfig } from './config.js';

// --- Types ---

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface PageContext {
  url?: string;
  viewport?: { width: number; mode: string };
  selectedElement?: {
    tag: string;
    className?: string;
    id?: string;
    xpath?: string;
    textContent?: string;
    styles?: Record<string, string>;
    parentTag?: string;
    parentClass?: string;
    childCount?: number;
    siblingCount?: number;
  } | null;
  pageSummary?: Array<{
    tag: string;
    className?: string;
    id?: string;
    role?: string;
    textPreview?: string;
    childCount?: number;
  }>;
  projectType?: string;
}

export interface StreamChatOptions {
  messages: ChatMessage[];
  systemPrompt: string;
  model: string;
  maxTokens: number;
  apiKey: string;
}

export interface AIError {
  type: 'auth_error' | 'rate_limit' | 'server_error' | 'network_error' | 'unknown_error';
  message: string;
  status?: number;
}

// --- System Prompt ---

const BASE_SYSTEM_PROMPT = `You are a web development assistant inside DO SiteForge, a visual website builder. Your role is to help users modify their websites by generating code changes.

Guidelines:
- When the user references "this element" or "the selected element", it refers to the element described in the context below.
- Respond with specific file changes when asked to modify the site.
- Use the project's existing patterns (Tailwind if detected, CSS modules if present, etc.).
- Format file changes as markdown code blocks with the filepath as the language identifier, e.g.:
\`\`\`src/components/Hero.tsx
// file content here
\`\`\`
- Be concise — code first, brief explanation after.
- If the user asks a question (not a change request), answer directly without generating file changes.`;

export function buildSystemPrompt(context?: PageContext): string {
  let prompt = BASE_SYSTEM_PROMPT;

  if (!context) return prompt;

  const parts: string[] = [];

  if (context.projectType) {
    parts.push(`Project type: ${context.projectType}`);
  }

  if (context.viewport) {
    parts.push(`Viewport: ${context.viewport.width}px (${context.viewport.mode})`);
  }

  if (context.url) {
    parts.push(`Current page: ${context.url}`);
  }

  if (context.selectedElement) {
    const el = context.selectedElement;
    const elParts: string[] = [`Tag: <${el.tag}>`];
    if (el.className) elParts.push(`Class: ${el.className}`);
    if (el.id) elParts.push(`ID: #${el.id}`);
    if (el.xpath) elParts.push(`XPath: ${el.xpath}`);
    if (el.textContent) elParts.push(`Text: "${el.textContent}"`);
    if (el.parentTag) elParts.push(`Parent: <${el.parentTag}>${el.parentClass ? '.' + el.parentClass : ''}`);
    if (el.childCount !== undefined) elParts.push(`Children: ${el.childCount}`);
    if (el.styles && Object.keys(el.styles).length > 0) {
      const styleStr = Object.entries(el.styles)
        .map(([k, v]) => `${k}: ${v}`)
        .join('; ');
      elParts.push(`Styles: ${styleStr}`);
    }
    parts.push(`Selected element:\n  ${elParts.join('\n  ')}`);
  }

  if (context.pageSummary && context.pageSummary.length > 0) {
    const summaryLines = context.pageSummary.map((s) => {
      let line = `<${s.tag}>`;
      if (s.className) line += `.${s.className.split(' ')[0]}`;
      if (s.id) line += `#${s.id}`;
      if (s.role) line += ` (${s.role})`;
      if (s.textPreview) line += ` — "${s.textPreview}"`;
      return line;
    });
    parts.push(`Page structure:\n  ${summaryLines.join('\n  ')}`);
  }

  if (parts.length > 0) {
    prompt += '\n\n--- Current Context ---\n' + parts.join('\n');
  }

  return prompt;
}

// --- Streaming Chat ---

/**
 * Calls the Anthropic Messages API with streaming enabled.
 * Returns a ReadableStream that yields text delta strings.
 * Throws an AIError on failure.
 */
export async function streamChat(options: StreamChatOptions): Promise<ReadableStream<string>> {
  const { messages, systemPrompt, model, maxTokens, apiKey } = options;

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
    throw {
      type: 'network_error',
      message: `Failed to connect to Anthropic API: ${err instanceof Error ? err.message : String(err)}`,
    } satisfies AIError;
  }

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    let message = `Anthropic API error (${response.status})`;
    try {
      const parsed = JSON.parse(errorBody);
      if (parsed.error?.message) message = parsed.error.message;
    } catch {
      if (errorBody) message += `: ${errorBody.slice(0, 200)}`;
    }

    let type: AIError['type'];
    switch (response.status) {
      case 401:
        type = 'auth_error';
        message = 'Invalid API key. Check your ANTHROPIC_API_KEY.';
        break;
      case 429:
        type = 'rate_limit';
        message = 'Rate limited by Anthropic API. Please wait a moment and try again.';
        break;
      case 500:
      case 502:
      case 503:
        type = 'server_error';
        message = 'Anthropic API is temporarily unavailable. Please try again.';
        break;
      default:
        type = 'unknown_error';
    }

    throw { type, message, status: response.status } satisfies AIError;
  }

  if (!response.body) {
    throw {
      type: 'unknown_error',
      message: 'No response body received from Anthropic API',
    } satisfies AIError;
  }

  // Parse SSE stream from Anthropic and yield text deltas
  return new ReadableStream<string>({
    async start(controller) {
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Process complete SSE lines
          const lines = buffer.split('\n');
          // Keep the last potentially incomplete line in the buffer
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6).trim();
            if (!data || data === '[DONE]') continue;

            try {
              const event = JSON.parse(data);
              // Anthropic SSE events: content_block_delta contains text
              if (
                event.type === 'content_block_delta' &&
                event.delta?.type === 'text_delta' &&
                event.delta.text
              ) {
                controller.enqueue(event.delta.text);
              }
            } catch {
              // Skip malformed JSON lines
            }
          }
        }
      } catch (err) {
        controller.error(
          new Error(`Stream read error: ${err instanceof Error ? err.message : String(err)}`)
        );
        return;
      }

      controller.close();
    },
  });
}

/**
 * Convenience: build options from config + context + messages.
 */
export function createStreamOptions(
  config: SiteForgeConfig,
  context: PageContext | undefined,
  messages: ChatMessage[]
): StreamChatOptions {
  return {
    messages,
    systemPrompt: buildSystemPrompt(context),
    model: config.model || 'claude-sonnet-4-20250514',
    maxTokens: config.maxTokens || 4096,
    apiKey: config.anthropicApiKey || '',
  };
}
