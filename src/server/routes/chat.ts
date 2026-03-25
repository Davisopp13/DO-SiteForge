import type { Request, Response, Router } from 'express';
import { Router as createRouter } from 'express';
import { streamChat, buildSystemPrompt, type ChatMessage, type PageContext, type AIError } from '../ai.js';
import { hasApiKey, type SiteForgeConfig } from '../config.js';

/**
 * POST /api/chat
 * Request body: { message: string, context: PageContext, history: ChatMessage[] }
 * Response: SSE stream with events: delta, done, error
 */
export function createChatRouter(): Router {
  const router = createRouter();

  router.post('/', async (req: Request, res: Response) => {
    const config = req.app.locals.sfConfig as SiteForgeConfig;

    if (!hasApiKey(config)) {
      res.status(400).json({
        error: 'AI features are disabled. Set ANTHROPIC_API_KEY or configure it in siteforge.config.json.',
      });
      return;
    }

    const { message, context, history } = req.body as {
      message?: string;
      context?: PageContext;
      history?: ChatMessage[];
    };

    if (!message || typeof message !== 'string') {
      res.status(400).json({ error: 'Missing required field: message' });
      return;
    }

    // Build conversation: history + new user message
    const messages: ChatMessage[] = [
      ...(Array.isArray(history) ? history : []),
      { role: 'user', content: message },
    ];

    const systemPrompt = buildSystemPrompt(context);

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    try {
      const stream = await streamChat({
        messages,
        systemPrompt,
        model: config.model || 'claude-sonnet-4-20250514',
        maxTokens: config.maxTokens || 4096,
        apiKey: config.anthropicApiKey!,
      });

      const reader = stream.getReader();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // Send delta event
        res.write(`event: delta\ndata: ${JSON.stringify({ text: value })}\n\n`);
      }

      // Send done event
      res.write(`event: done\ndata: {}\n\n`);
      res.end();
    } catch (err) {
      const aiError = err as AIError;
      const errorMessage = aiError.message || 'An unexpected error occurred';

      // If headers already sent (SSE started), send error as SSE event
      if (res.headersSent) {
        res.write(`event: error\ndata: ${JSON.stringify({ message: errorMessage, type: aiError.type || 'unknown_error' })}\n\n`);
        res.end();
      } else {
        res.status(500).json({ error: errorMessage });
      }
    }

    // Handle client disconnect
    req.on('close', () => {
      // Client disconnected — stream will naturally end
    });
  });

  return router;
}
