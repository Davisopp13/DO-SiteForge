import { spawn, type ChildProcess } from 'node:child_process';
import express, { type Express } from 'express';
import path from 'node:path';
import { createStaticWithInjection } from './inject.js';

let childProcess: ChildProcess | null = null;

export interface ProxyTarget {
  type: 'nextjs' | 'vite' | 'astro' | 'static';
  devCommand: string;
  port: number;
  projectDir: string;
}

/**
 * Starts the target project's dev server as a child process.
 * For static projects, returns null (handled via Express static serving).
 */
export function spawnDevServer(target: ProxyTarget): ChildProcess | null {
  if (target.type === 'static' || !target.devCommand) {
    return null;
  }

  const [cmd, ...args] = target.devCommand.split(' ');

  const child = spawn(cmd, args, {
    cwd: target.projectDir,
    stdio: 'pipe',
    shell: true,
    env: { ...process.env, PORT: String(target.port) },
  });

  child.stdout?.on('data', (data: Buffer) => {
    process.stdout.write(`[target] ${data.toString()}`);
  });

  child.stderr?.on('data', (data: Buffer) => {
    process.stderr.write(`[target] ${data.toString()}`);
  });

  child.on('error', (err) => {
    console.error(`[target] Failed to start dev server: ${err.message}`);
  });

  childProcess = child;
  return child;
}

/**
 * Sets up preview routes on the given Express app.
 * For static projects: serves files directly.
 * For dev-server projects: proxies to the running dev server.
 */
export function setupPreviewRoutes(app: Express, target: ProxyTarget): void {
  if (target.type === 'static') {
    // Serve HTML files with bridge injection, non-HTML files statically
    app.use('/preview', createStaticWithInjection(target.projectDir));
    app.use('/preview', express.static(target.projectDir));
  } else {
    // Proxy to the running dev server using http-proxy-middleware
    // Dynamic import since it's an ESM module
    setupDevServerProxy(app, target.port);
  }
}

async function setupDevServerProxy(app: Express, port: number): Promise<void> {
  const { createProxyMiddleware } = await import('http-proxy-middleware');

  app.use('/preview', createProxyMiddleware({
    target: `http://localhost:${port}`,
    changeOrigin: true,
    pathRewrite: { '^/preview': '' },
    ws: true,
    // Self-handle errors so the editor doesn't crash if dev server is slow to start
    on: {
      error(err, _req, res) {
        if ('writeHead' in res && typeof res.writeHead === 'function') {
          (res as any).writeHead(502, { 'Content-Type': 'text/html' });
          (res as any).end(`
            <html><body style="font-family: system-ui; padding: 40px; color: #888;">
              <h2>Waiting for dev server...</h2>
              <p>The target dev server on port ${port} is still starting up.</p>
              <p>This page will auto-refresh in 2 seconds.</p>
              <script>setTimeout(() => location.reload(), 2000)</script>
            </body></html>
          `);
        }
      },
    },
  }));
}

/**
 * Kills the spawned dev server child process if one exists.
 */
export function killDevServer(): void {
  if (childProcess && !childProcess.killed) {
    childProcess.kill('SIGTERM');
    childProcess = null;
  }
}
