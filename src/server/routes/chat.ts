import type { Request, Response, Router } from 'express';
import { Router as createRouter } from 'express';
import type { ChatMessage, PageContext } from '../ai.js';
import type { AIProvider, ChatParams } from '../providers/types.js';

/**
 * POST /api/chat
 * Request body: { message: string, context: PageContext, history: ChatMessage[] }
 * Response: SSE stream with events: delta, done, error
 *
 * Uses the active AIProvider from app.locals.sfProvider.
 * The route does not know which provider is active — it just calls streamChat().
 */
export function createChatRouter(): Router {
  const router = createRouter();

  router.post('/', async (req: Request, res: Response) => {
    const provider = req.app.locals.sfProvider as AIProvider;

    if (!provider || !provider.available) {
      res.status(400).json({
        error: 'AI features are disabled. Install Claude Code or set an API key.',
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

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    try {
      const params: ChatParams = {
        message,
        context: context || {},
        history: Array.isArray(history) ? history : [],
        projectRoot: (req.app.locals.sfProjectDir as string) || process.cwd(),
      };

      for await (const event of provider.streamChat(params)) {
        switch (event.type) {
          case 'delta':
            res.write(`event: delta\ndata: ${JSON.stringify({ text: event.data.text })}\n\n`);
            break;
          case 'done':
            res.write(`event: done\ndata: {}\n\n`);
            break;
          case 'error':
            res.write(`event: error\ndata: ${JSON.stringify({ message: event.data.message, type: event.data.errorType || 'unknown_error' })}\n\n`);
            break;
          case 'file_changed':
            res.write(`event: files\ndata: ${JSON.stringify(event.data)}\n\n`);
            break;
        }
      }

      // If the provider didn't explicitly yield a done event, send one
      res.write(`event: done\ndata: {}\n\n`);
      res.end();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);

      if (res.headersSent) {
        res.write(`event: error\ndata: ${JSON.stringify({ message: errorMessage, type: 'unknown_error' })}\n\n`);
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
