import type { SiteForgeConfig } from './config.js';
import type { ProjectContext } from './project.js';

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
  rootDir?: string;
  framework?: string;
  hasTailwind?: boolean;
  hasTypeScript?: boolean;
  mainFiles?: string[];
  projectContext?: ProjectContext;
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

When the user references "this element", "the selected element", or similar, it refers to the element described in the Current Context section below.

Guidelines:
- Respond with specific file changes when asked to modify the site. Always include the complete updated file content, not just the changed lines.
- Format file changes as markdown code blocks with the filepath as the language identifier:
\`\`\`src/components/Hero.tsx
// complete file content here
\`\`\`
- Be concise — put code first, then a brief explanation of what changed and why.
- If the user asks a question (not a change request), answer directly without generating file changes.
- If the user's request is ambiguous, make a reasonable choice and explain it rather than asking clarifying questions.
- When multiple files need changes, show all of them in order of dependency (shared utilities first, then components, then pages).`;

function buildFrameworkGuidelines(context?: PageContext): string {
  if (!context) return '';

  const lines: string[] = [];

  // Framework-specific instructions
  const fw = context.framework || context.projectType;
  if (fw) {
    switch (fw) {
      case 'nextjs':
        lines.push('This is a Next.js project. Use the App Router patterns (server components by default, "use client" only when needed). Use next/image for images and next/link for navigation.');
        break;
      case 'vite':
        lines.push('This is a Vite project. Use ES module imports and the project\'s configured framework (React, Vue, Svelte, etc.).');
        break;
      case 'astro':
        lines.push('This is an Astro project. Use .astro components by default, with framework islands for interactive parts.');
        break;
      case 'static':
        lines.push('This is a static HTML/CSS/JS site. Use plain HTML, CSS, and vanilla JavaScript. No build step or framework. The main file is usually index.html in the project root — check there first.');
        break;
    }
  }

  // Styling approach
  if (context.hasTailwind) {
    lines.push('This project uses Tailwind CSS. Use Tailwind utility classes for styling instead of custom CSS.');
  }

  // TypeScript
  if (context.hasTypeScript) {
    lines.push('This project uses TypeScript. Include proper types in all code.');
  }

  if (lines.length === 0) return '';
  return '\n\nProject-specific guidelines:\n- ' + lines.join('\n- ');
}

export function buildSystemPrompt(context?: PageContext): string {
  // If projectContext is provided, merge its fields into the top-level context
  // so the rest of the prompt builder can use them uniformly
  if (context?.projectContext) {
    const pc = context.projectContext;
    if (!context.projectType) context.projectType = pc.type;
    if (!context.framework) context.framework = pc.framework;
    if (context.hasTailwind === undefined) context.hasTailwind = pc.hasTailwind;
    if (context.hasTypeScript === undefined) context.hasTypeScript = pc.hasTypeScript;
    if (!context.mainFiles || context.mainFiles.length === 0) context.mainFiles = pc.mainFiles;
  }

  let prompt = BASE_SYSTEM_PROMPT;

  // Add framework-specific guidelines
  prompt += buildFrameworkGuidelines(context);

  if (!context) return prompt;

  const parts: string[] = [];

  // Project info
  if (context.projectType || context.framework) {
    const type = context.framework || context.projectType;
    let projectLine = `Project: ${type}`;
    if (context.rootDir) projectLine += ` (root: ${context.rootDir})`;
    parts.push(projectLine);
  }

  if (context.hasTailwind !== undefined || context.hasTypeScript !== undefined) {
    const features: string[] = [];
    if (context.hasTailwind) features.push('Tailwind CSS');
    if (context.hasTypeScript) features.push('TypeScript');
    if (features.length > 0) parts.push(`Stack: ${features.join(', ')}`);
  }

  if (context.mainFiles && context.mainFiles.length > 0) {
    parts.push(`Key files: ${context.mainFiles.join(', ')}`);
  }

  if (context.viewport) {
    const { mode, width } = context.viewport;
    const modeLabel = mode === 'custom' ? `custom` : mode;
    parts.push(`Viewport: The user is viewing the site at ${modeLabel} width (${width}px).`);
  }

  if (context.url) {
    parts.push(`Current page: ${context.url}`);
  }

  // Selected element — detailed
  if (context.selectedElement) {
    const el = context.selectedElement;
    const elParts: string[] = [`Tag: <${el.tag}>`];
    if (el.className) elParts.push(`Class: ${el.className}`);
    if (el.id) elParts.push(`ID: #${el.id}`);
    if (el.xpath) elParts.push(`XPath: ${el.xpath}`);
    if (el.textContent) elParts.push(`Text: "${el.textContent}"`);
    if (el.parentTag) elParts.push(`Parent: <${el.parentTag}>${el.parentClass ? '.' + el.parentClass : ''}`);
    if (el.childCount !== undefined) elParts.push(`Children: ${el.childCount}`);
    if (el.siblingCount !== undefined) elParts.push(`Siblings: ${el.siblingCount}`);
    if (el.styles && Object.keys(el.styles).length > 0) {
      const styleStr = Object.entries(el.styles)
        .map(([k, v]) => `${k}: ${v}`)
        .join('; ');
      elParts.push(`Computed styles: ${styleStr}`);
    }
    parts.push(`Selected element:\n  ${elParts.join('\n  ')}`);
  }

  // Page structure summary
  if (context.pageSummary && context.pageSummary.length > 0) {
    const summaryLines = context.pageSummary.map((s) => {
      let line = `<${s.tag}>`;
      if (s.className) line += `.${s.className.split(' ')[0]}`;
      if (s.id) line += `#${s.id}`;
      if (s.role) line += ` (${s.role})`;
      if (s.textPreview) line += ` — "${s.textPreview}"`;
      if (s.childCount !== undefined) line += ` [${s.childCount} children]`;
      return line;
    });
    parts.push(`Page structure:\n  ${summaryLines.join('\n  ')}`);
  }

  if (parts.length > 0) {
    prompt += '\n\n--- Current Context ---\n' + parts.join('\n');
  }

  return prompt;
}

/**
 * Formats a PageContext object into a human-readable string.
 * Used for logging/debugging — the system prompt uses buildSystemPrompt() instead.
 */
export function formatContextSummary(context: PageContext): string {
  const lines: string[] = [];

  if (context.projectType) lines.push(`Project: ${context.projectType}`);
  if (context.viewport) lines.push(`Viewport: ${context.viewport.width}px ${context.viewport.mode}`);
  if (context.url) lines.push(`Page: ${context.url}`);
  if (context.selectedElement) {
    const el = context.selectedElement;
    let sel = `<${el.tag}>`;
    if (el.className) sel += `.${el.className.split(' ')[0]}`;
    if (el.id) sel += `#${el.id}`;
    lines.push(`Selected: ${sel}`);
  } else {
    lines.push('Selected: none');
  }
  if (context.pageSummary) lines.push(`Sections: ${context.pageSummary.length}`);

  return lines.join(' | ');
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
