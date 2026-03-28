import type { Request, Response, Router } from 'express';
import { Router as createRouter } from 'express';
import { applyEdit } from '../sourcemap/patcher.js';
import type { VisualEdit } from '../sourcemap/types.js';
import { resolveAndValidate } from './files.js';

/**
 * Visual edit API route.
 *
 * POST /api/edits — { edit: VisualEdit } → PatchResult
 *
 * Applies a single visual edit operation (move, text, delete, insert, style)
 * to the HTML source file on disk. Only valid for static projects where
 * source line/col annotations are injected at serve time.
 */
export function createEditsRouter(): Router {
  const router = createRouter();

  router.post('/', (req: Request, res: Response) => {
    const projectDir = req.app.locals.sfProjectDir as string | undefined;
    if (!projectDir) {
      res.status(500).json({ error: 'No project directory configured' });
      return;
    }

    const { edit } = req.body as { edit?: VisualEdit };
    if (!edit || typeof edit !== 'object') {
      res.status(400).json({ error: 'Missing required field: edit' });
      return;
    }

    if (typeof edit.type !== 'string') {
      res.status(400).json({ error: 'Invalid edit: missing type' });
      return;
    }

    // Validate filepath
    if (!edit.filepath || typeof edit.filepath !== 'string') {
      res.status(400).json({ error: 'Invalid edit: missing filepath' });
      return;
    }

    const resolved = resolveAndValidate(projectDir, edit.filepath);
    if (!resolved) {
      res.status(400).json({ error: 'Invalid filepath: must be within project directory' });
      return;
    }

    // Validate line/col fields based on edit type
    if (edit.type === 'insert') {
      if (!Number.isInteger(edit.targetLine) || edit.targetLine < 1) {
        res.status(400).json({ error: 'Invalid edit: targetLine must be a positive integer' });
        return;
      }
      if (!Number.isInteger(edit.targetCol) || edit.targetCol < 1) {
        res.status(400).json({ error: 'Invalid edit: targetCol must be a positive integer' });
        return;
      }
    } else {
      if (!Number.isInteger((edit as { sourceLine?: unknown }).sourceLine) || (edit as { sourceLine: number }).sourceLine < 1) {
        res.status(400).json({ error: 'Invalid edit: sourceLine must be a positive integer' });
        return;
      }
      if (!Number.isInteger((edit as { sourceCol?: unknown }).sourceCol) || (edit as { sourceCol: number }).sourceCol < 1) {
        res.status(400).json({ error: 'Invalid edit: sourceCol must be a positive integer' });
        return;
      }
    }

    try {
      const result = applyEdit(edit, projectDir);
      res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: `Failed to apply edit: ${message}` });
    }
  });

  return router;
}
