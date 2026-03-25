import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBridgeInjector } from './inject.js';
import { setupPreviewRoutes, type ProxyTarget } from './proxy.js';
import { loadConfig, hasApiKey, setApiKey, type SiteForgeConfig } from './config.js';
import { createChatRouter } from './routes/chat.js';
import { createFilesRouter } from './routes/files.js';
import { scanProject, type ProjectContext } from './project.js';

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

export function createServer(port = 3000, target?: ProxyTarget) {
  const app = express();

  // Load AI config (project dir from target, or undefined)
  const config = loadConfig(target?.projectDir);

  // Scan project directory for framework/tooling context
  const projectContext: ProjectContext | undefined = target?.projectDir
    ? scanProject(target.projectDir)
    : undefined;

  // Expose config, project context, and project dir for route handlers
  app.locals.sfConfig = config;
  app.locals.sfProjectContext = projectContext;
  app.locals.sfProjectDir = target?.projectDir;

  // After tsup build: __dirname is dist/src/server/
  // Project root is 3 levels up from there
  const projectRoot = findProjectRoot(__dirname);
  const editorSrcDir = path.join(projectRoot, 'src', 'editor');
  const editorDistDir = path.join(projectRoot, 'dist', 'editor');
  const bridgeDistDir = path.join(projectRoot, 'dist', 'bridge');

  // Serve the bundled bridge script
  app.get('/forge-bridge.js', (_req, res) => {
    const bridgePath = path.join(bridgeDistDir, 'bridge.global.js');
    if (fs.existsSync(bridgePath)) {
      res.type('application/javascript').sendFile(bridgePath);
    } else {
      res.status(404).send('// Bridge script not found');
    }
  });

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

  // JSON body parser for API routes
  app.use(express.json());

  // API: Chat with AI (SSE streaming)
  app.use('/api/chat', createChatRouter());

  // API: File operations (exists, read, write)
  app.use('/api/files', createFilesRouter());

  // API: Check AI config status
  app.get('/api/config/status', (_req, res) => {
    const cfg = app.locals.sfConfig as SiteForgeConfig;
    res.json({
      aiEnabled: hasApiKey(cfg),
      model: cfg.model,
    });
  });

  // API: Set API key at runtime (saves to ~/.siteforge/config.json and reloads config)
  app.post('/api/config/set-key', (req, res) => {
    const { apiKey } = req.body as { apiKey?: string };
    if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length === 0) {
      res.status(400).json({ error: 'Missing or empty apiKey' });
      return;
    }

    try {
      setApiKey(apiKey.trim());
      // Reload config so the new key takes effect immediately
      const newConfig = loadConfig(target?.projectDir);
      app.locals.sfConfig = newConfig;
      res.json({ success: true, aiEnabled: hasApiKey(newConfig), model: newConfig.model });
    } catch (err) {
      res.status(500).json({ error: 'Failed to save API key' });
    }
  });

  // Set up preview routes with bridge injection if a target project is provided
  if (target) {
    // Apply bridge injection middleware to preview routes
    app.use('/preview', createBridgeInjector());
    setupPreviewRoutes(app, target);
  }

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
