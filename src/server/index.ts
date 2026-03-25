import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function findProjectRoot(startDir: string): string {
  let dir = startDir;
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, 'package.json'))) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  return startDir;
}

export function createServer(port = 3000) {
  const app = express();

  // After tsup build: __dirname is dist/src/server/
  // Project root is 3 levels up from there
  const projectRoot = findProjectRoot(__dirname);
  const editorSrcDir = path.join(projectRoot, 'src', 'editor');
  const editorDistDir = path.join(projectRoot, 'dist', 'editor');

  // Serve the bundled editor JS (takes priority over static)
  app.get('/editor/app.js', (_req, res) => {
    res.sendFile(path.join(editorDistDir, 'app.js'));
  });

  // Serve editor static assets (CSS, HTML, etc.) from source
  app.use('/editor', express.static(editorSrcDir));

  // Serve the editor HTML shell at root
  app.get('/', (_req, res) => {
    res.sendFile(path.join(editorSrcDir, 'index.html'));
  });

  const server = app.listen(port, () => {
    console.log(`SiteForge editor running at http://localhost:${port}`);
  });

  return { app, server };
}

// Allow running directly: node dist/src/server/index.js
const isDirectRun = process.argv[1] && (
  process.argv[1].endsWith('server.js') ||
  process.argv[1].endsWith('server/index.js')
);

if (isDirectRun) {
  createServer(3000);
}
