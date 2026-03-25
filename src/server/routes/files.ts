import type { Request, Response, Router } from 'express';
import { Router as createRouter } from 'express';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Validates that a file path resolves within the project root.
 * Prevents path traversal attacks (e.g., ../../etc/passwd).
 */
function resolveAndValidate(projectDir: string, filepath: string): string | null {
  if (!filepath || typeof filepath !== 'string') return null;

  // Normalize and resolve the path relative to project dir
  const resolved = path.resolve(projectDir, filepath);

  // Ensure the resolved path is within the project directory
  const normalizedProjectDir = path.resolve(projectDir) + path.sep;
  const normalizedResolved = path.resolve(resolved);

  if (!normalizedResolved.startsWith(normalizedProjectDir) && normalizedResolved !== path.resolve(projectDir)) {
    return null;
  }

  return normalizedResolved;
}

/**
 * File operations API routes.
 * All paths are relative to the target project directory.
 *
 * GET  /api/files/exists?path=<filepath>  — { exists: boolean }
 * GET  /api/files/read?path=<filepath>    — file content as text
 * POST /api/files/write                   — { filepath, content } → writes file
 */
export function createFilesRouter(): Router {
  const router = createRouter();

  // GET /api/files/exists?path=<filepath>
  router.get('/exists', (req: Request, res: Response) => {
    const projectDir = req.app.locals.sfProjectDir as string | undefined;
    if (!projectDir) {
      res.status(500).json({ error: 'No project directory configured' });
      return;
    }

    const filepath = req.query.path as string | undefined;
    if (!filepath) {
      res.status(400).json({ error: 'Missing required query parameter: path' });
      return;
    }

    const resolved = resolveAndValidate(projectDir, filepath);
    if (!resolved) {
      res.status(400).json({ error: 'Invalid file path' });
      return;
    }

    res.json({ exists: fs.existsSync(resolved) });
  });

  // GET /api/files/read?path=<filepath>
  router.get('/read', (req: Request, res: Response) => {
    const projectDir = req.app.locals.sfProjectDir as string | undefined;
    if (!projectDir) {
      res.status(500).json({ error: 'No project directory configured' });
      return;
    }

    const filepath = req.query.path as string | undefined;
    if (!filepath) {
      res.status(400).json({ error: 'Missing required query parameter: path' });
      return;
    }

    const resolved = resolveAndValidate(projectDir, filepath);
    if (!resolved) {
      res.status(400).json({ error: 'Invalid file path' });
      return;
    }

    if (!fs.existsSync(resolved)) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    try {
      const content = fs.readFileSync(resolved, 'utf-8');
      res.type('text/plain').send(content);
    } catch (err) {
      res.status(500).json({ error: 'Failed to read file' });
    }
  });

  // POST /api/files/write — { filepath, content }
  router.post('/write', (req: Request, res: Response) => {
    const projectDir = req.app.locals.sfProjectDir as string | undefined;
    if (!projectDir) {
      res.status(500).json({ error: 'No project directory configured' });
      return;
    }

    const { filepath, content } = req.body as { filepath?: string; content?: string };

    if (!filepath || typeof filepath !== 'string') {
      res.status(400).json({ error: 'Missing required field: filepath' });
      return;
    }

    if (content === undefined || typeof content !== 'string') {
      res.status(400).json({ error: 'Missing required field: content' });
      return;
    }

    const resolved = resolveAndValidate(projectDir, filepath);
    if (!resolved) {
      res.status(400).json({ error: 'Invalid file path' });
      return;
    }

    try {
      // Create parent directories if they don't exist
      const dir = path.dirname(resolved);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(resolved, content, 'utf-8');
      res.json({ success: true, filepath, written: resolved });
    } catch (err) {
      res.status(500).json({ error: 'Failed to write file' });
    }
  });

  return router;
}
