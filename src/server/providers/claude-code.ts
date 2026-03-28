import { spawn, type ChildProcess } from 'node:child_process';
import type { AIProvider, ChatParams, ChatEvent } from './types.js';
import { buildSystemPrompt } from '../ai.js';
import { isClaudeCodeAvailable } from './types.js';

/**
 * Create a Claude Code CLI provider that spawns `claude` as a subprocess.
 * Claude Code writes files directly to disk — SiteForge detects changes via file watcher.
 */
export function createClaudeCodeProvider(): AIProvider {
  return {
    name: 'claude-code',
    available: isClaudeCodeAvailable(),
    supportsDirectFileWrites: true,

    async *streamChat(params: ChatParams): AsyncIterable<ChatEvent> {
      const { message, context, history, projectRoot } = params;

      // Build the prompt to send to Claude Code via stdin
      const systemContext = buildSystemPrompt(context);
      const prompt = assemblePrompt(message, systemContext, history);

      const spawnArgs = ['--print', '--output-format', 'stream-json', '--verbose', '--dangerously-skip-permissions'];
      if (params.model) {
        spawnArgs.push('--model', params.model);
      }

      let child: ChildProcess;
      try {
        child = spawn('claude', spawnArgs, {
          cwd: projectRoot,
          stdio: ['pipe', 'pipe', 'pipe'],
          env: { ...process.env },
        });
      } catch (err) {
        yield {
          type: 'error',
          data: {
            message: `Failed to spawn Claude Code CLI: ${err instanceof Error ? err.message : String(err)}`,
            errorType: 'spawn_error',
          },
        };
        return;
      }

      // Write prompt to stdin and close it
      if (child.stdin) {
        child.stdin.write(prompt);
        child.stdin.end();
      }

      // Set up timeout (180s)
      const TIMEOUT_MS = 180_000;
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
      }, TIMEOUT_MS);

      // Collect stderr for error reporting
      let stderrData = '';
      if (child.stderr) {
        child.stderr.on('data', (chunk: Buffer) => {
          stderrData += chunk.toString();
        });
      }

      // Parse streaming JSON from stdout
      if (!child.stdout) {
        clearTimeout(timer);
        yield { type: 'error', data: { message: 'Claude Code process has no stdout', errorType: 'spawn_error' } };
        return;
      }

      const decoder = new TextDecoder();
      let buffer = '';
      let accumulatedText = '';

      try {
        for await (const chunk of child.stdout) {
          buffer += decoder.decode(chunk as Buffer, { stream: true });

          // Process complete JSON lines (newline-delimited JSON)
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            let event: any;
            try {
              event = JSON.parse(trimmed);
            } catch {
              // Skip malformed lines
              continue;
            }

            // Map Claude Code stream-json events to ChatEvent
            const chatEvent = mapClaudeCodeEvent(event);
            if (chatEvent) {
              if (chatEvent.type === 'delta') {
                accumulatedText += chatEvent.data.text;
              }
              yield chatEvent;
            }
          }
        }

        // Process any remaining buffer
        if (buffer.trim()) {
          try {
            const event = JSON.parse(buffer.trim());
            const chatEvent = mapClaudeCodeEvent(event);
            if (chatEvent) {
              if (chatEvent.type === 'delta') {
                accumulatedText += chatEvent.data.text;
              }
              yield chatEvent;
            }
          } catch {
            // Ignore trailing incomplete data
          }
        }
      } catch (err) {
        clearTimeout(timer);
        if (timedOut) {
          // If we have partial text, yield it with a truncation note instead of an error
          if (accumulatedText) {
            yield { type: 'delta', data: { text: '\n\n_(response truncated — timed out)_' } };
            yield { type: 'done', data: {} };
          } else {
            yield { type: 'error', data: { message: 'Claude Code timed out after 3 minutes', errorType: 'timeout' } };
          }
        } else {
          yield {
            type: 'error',
            data: {
              message: `Claude Code stream error: ${err instanceof Error ? err.message : String(err)}`,
              errorType: 'stream_error',
            },
          };
        }
        return;
      }

      clearTimeout(timer);

      // Wait for process to exit
      const exitCode = await waitForExit(child);

      if (timedOut) {
        // If we have partial text, yield it with a truncation note instead of an error
        if (accumulatedText) {
          yield { type: 'delta', data: { text: '\n\n_(response truncated — timed out)_' } };
          yield { type: 'done', data: {} };
        } else {
          yield { type: 'error', data: { message: 'Claude Code timed out after 3 minutes', errorType: 'timeout' } };
        }
        return;
      }

      if (exitCode !== 0 && exitCode !== null) {
        const errMsg = stderrData.trim() || `Claude Code exited with code ${exitCode}`;
        yield { type: 'error', data: { message: errMsg, errorType: 'process_error' } };
        return;
      }

      yield { type: 'done', data: {} };
    },
  };
}

/**
 * Assemble the prompt string sent to Claude Code's stdin.
 * Leads with the user request for faster responses, then adds context.
 * Kept concise to minimize thinking time and file-reading overhead.
 */
function assemblePrompt(
  message: string,
  systemContext: string,
  history: Array<{ role: string; content: string }>
): string {
  const parts: string[] = [];

  // Lead with the user's request — Claude Code responds faster when the action is first
  parts.push(`USER REQUEST: ${message}`);

  // Concise instructions
  parts.push(
    '\nINSTRUCTIONS: Respond concisely. Make the change directly — do not explain what you plan to do first. Read only the files you need to modify. Write complete file contents, not partial diffs.'
  );

  // Add conversation history (if any) before context so Claude Code has conversational continuity
  if (history.length > 0) {
    parts.push('\nCONVERSATION HISTORY:');
    for (const msg of history) {
      const label = msg.role === 'user' ? 'User' : 'Assistant';
      parts.push(`${label}: ${msg.content}`);
    }
  }

  // Add context — trimmed to essentials (selected element, viewport, project type)
  if (systemContext) {
    // Extract only the "Current Context" section from the full system prompt
    // to avoid sending the lengthy base prompt meant for the API provider
    const contextIdx = systemContext.indexOf('--- Current Context ---');
    if (contextIdx !== -1) {
      parts.push('\n' + systemContext.slice(contextIdx));
    } else {
      // Fallback: extract framework guidelines if present
      const guidelinesIdx = systemContext.indexOf('Project-specific guidelines:');
      if (guidelinesIdx !== -1) {
        parts.push('\n' + systemContext.slice(guidelinesIdx));
      }
    }
  }

  return parts.join('\n');
}

/**
 * Map a Claude Code stream-json event to a ChatEvent.
 * Claude Code stream-json outputs newline-delimited JSON objects with a `type` field.
 *
 * Known event types:
 * - { type: "assistant", message: { content: [{ type: "text", text: "..." }] } }
 * - { type: "content_block_delta", delta: { type: "text_delta", text: "..." } }
 * - { type: "result", ... } — final result
 * - { type: "error", error: { message: "..." } }
 */
function mapClaudeCodeEvent(event: any): ChatEvent | null {
  if (!event || typeof event !== 'object') return null;

  switch (event.type) {
    case 'assistant':
      // Full message event — extract text content
      if (event.message?.content) {
        for (const block of event.message.content) {
          if (block.type === 'text' && block.text) {
            return { type: 'delta', data: { text: block.text } };
          }
        }
      }
      return null;

    case 'content_block_delta':
      // Streaming delta
      if (event.delta?.type === 'text_delta' && event.delta.text) {
        return { type: 'delta', data: { text: event.delta.text } };
      }
      return null;

    case 'content_block_start':
      // Content block starting — may contain initial text
      if (event.content_block?.type === 'text' && event.content_block.text) {
        return { type: 'delta', data: { text: event.content_block.text } };
      }
      return null;

    case 'result':
      // Final result — don't yield done here, let the stream end handle it
      return null;

    case 'error':
      return {
        type: 'error',
        data: {
          message: event.error?.message || 'Unknown Claude Code error',
          errorType: 'claude_code_error',
        },
      };

    default:
      // Ignore unknown event types (message_start, message_stop, etc.)
      return null;
  }
}

/**
 * Wait for a child process to exit and return the exit code.
 */
function waitForExit(child: ChildProcess): Promise<number | null> {
  return new Promise((resolve) => {
    if (child.exitCode !== null) {
      resolve(child.exitCode);
      return;
    }
    child.on('exit', (code) => resolve(code));
    child.on('error', () => resolve(1));
  });
}
