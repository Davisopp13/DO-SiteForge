import type { Request, Response, Router } from 'express';
import { Router as createRouter } from 'express';
import type { ChatMessage, PageContext } from '../ai.js';
import type { AIProvider, ChatParams } from '../providers/types.js';
import type { FileWatcher } from '../watcher.js';
import { isGitRepo, getHeadRef, restoreFiles } from '../git.js';
import type { ProjectContext } from '../project.js';

/**
 * Normalize the incoming context payload.
 * The frontend sends CanvasContext shape; PageContext uses different field names:
 *   CanvasContext.selection       → PageContext.selectedElement
 *   CanvasContext.page.entries    → PageContext.pageSummary
 * Also merges server-side project context so providers have full project info.
 */
function normalizeContext(raw: any, projectCtx?: ProjectContext): PageContext {
  if (!raw || typeof raw !== 'object') return {};
  const ctx: PageContext = {};

  if (raw.viewport) ctx.viewport = raw.viewport;
  if (raw.projectType) ctx.projectType = raw.projectType;
  if (raw.url) ctx.url = raw.url;

  // CanvasContext.selection → PageContext.selectedElement
  if ('selection' in raw) {
    ctx.selectedElement = raw.selection ?? null;
  } else if ('selectedElement' in raw) {
    ctx.selectedElement = raw.selectedElement;
  }

  // CanvasContext.page.entries → PageContext.pageSummary
  if (raw.page?.entries) {
    ctx.pageSummary = raw.page.entries;
  } else if (raw.pageSummary) {
    ctx.pageSummary = raw.pageSummary;
  }

  // Merge server-side project context (authoritative project type, tech stack, files)
  if (projectCtx) {
    ctx.projectContext = projectCtx;
    if (!ctx.projectType) ctx.projectType = projectCtx.type;
  }

  return ctx;
}

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

  // Store session snapshots: sessionId → { ref, files[] }
  // Used for undo support in Claude Code mode
  let lastSessionSnapshot: { ref: string; files: string[] } | null = null;

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

    // Start file watcher for Claude Code sessions (direct writes)
    const fileWatcher = req.app.locals.sfFileWatcher as FileWatcher | null;
    const useWatcher = provider.supportsDirectFileWrites && fileWatcher;
    const sessionStart = Date.now();

    // Snapshot git HEAD before Claude Code session for undo support
    const projectDir = (req.app.locals.sfProjectDir as string) || process.cwd();
    let gitRef: string | null = null;
    if (useWatcher && isGitRepo(projectDir)) {
      gitRef = getHeadRef(projectDir);
    }

    if (useWatcher) {
      fileWatcher!.startWatching();
    }

    try {
      const projectCtx = req.app.locals.sfProjectContext as ProjectContext | undefined;
      const params: ChatParams = {
        message,
        context: normalizeContext(context, projectCtx),
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

      // Stop watcher and collect file changes after Claude Code response
      if (useWatcher) {
        fileWatcher!.stopWatching();
        const changes = fileWatcher!.getRecentChanges(sessionStart);
        if (changes.length > 0) {
          // Store snapshot for undo support
          if (gitRef) {
            lastSessionSnapshot = {
              ref: gitRef,
              files: changes.map((c) => c.filepath),
            };
          }
          // Include gitRef so frontend knows undo is available
          res.write(`event: files\ndata: ${JSON.stringify({ changes, gitRef })}\n\n`);
        }
      }

      // If the provider didn't explicitly yield a done event, send one
      res.write(`event: done\ndata: {}\n\n`);
      res.end();
    } catch (err) {
      // Ensure watcher is stopped on error
      if (useWatcher) {
        fileWatcher!.stopWatching();
      }
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

  // POST /api/chat/undo
  // Restores files changed by the last Claude Code session using git
  router.post('/undo', (req: Request, res: Response) => {
    if (!lastSessionSnapshot) {
      res.status(400).json({ error: 'No changes to undo' });
      return;
    }

    const projectDir = (req.app.locals.sfProjectDir as string) || process.cwd();
    const { ref, files } = lastSessionSnapshot;

    const results = restoreFiles(projectDir, files, ref);
    const successes = results.filter((r) => r.success);
    const failures = results.filter((r) => !r.success);

    // Clear the snapshot after undo (can only undo once)
    lastSessionSnapshot = null;

    res.json({
      restored: successes.map((r) => r.filepath),
      failed: failures.map((r) => ({ filepath: r.filepath, error: r.error })),
    });
  });

  return router;
}
