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

// Matches Vite: "  ➜  Local:   http://localhost:4201/"
// and Next.js:  "- Local:        http://localhost:4201"
const READY_PATTERN = /Local:\s+http:\/\/localhost:(\d+)/;

function stripAnsi(str: string): string {
  return str.replace(/\x1B\[[\d;]*[A-Za-z]/g, '');
}

/**
 * Starts the target project's dev server as a child process.
 * Returns the child process (null for static) and a promise that resolves
 * with the actual port once the dev server emits its ready URL in stdout.
 * Rejects after 30s if no ready URL is detected.
 */
export function spawnDevServer(target: ProxyTarget): { child: ChildProcess | null; portReady: Promise<number> } {
  if (target.type === 'static' || !target.devCommand) {
    return { child: null, portReady: Promise.resolve(target.port) };
  }

  const [cmd, ...args] = target.devCommand.split(' ');

  const child = spawn(cmd, args, {
    cwd: target.projectDir,
    stdio: 'pipe',
    shell: true,
    env: { ...process.env, PORT: String(target.port) },
  });

  const portReady = new Promise<number>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Dev server did not emit a ready URL within 30s'));
    }, 30_000);

    let resolved = false;

    child.stdout?.on('data', (data: Buffer) => {
      const text = data.toString();
      process.stdout.write(`[target] ${text}`);
      if (resolved) return;
      const match = READY_PATTERN.exec(stripAnsi(text));
      if (match) {
        resolved = true;
        clearTimeout(timeout);
        resolve(parseInt(match[1], 10));
      }
    });

    child.once('error', (err: Error) => {
      if (!resolved) {
        clearTimeout(timeout);
        reject(err);
      }
    });
  });

  child.stderr?.on('data', (data: Buffer) => {
    process.stderr.write(`[target] ${data.toString()}`);
  });

  child.on('error', (err: Error) => {
    console.error(`[target] Failed to start dev server: ${err.message}`);
  });

  childProcess = child;
  return { child, portReady };
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

  const onError = (err: Error, _req: any, res: any) => {
    if ('writeHead' in res && typeof res.writeHead === 'function') {
      res.writeHead(502, { 'Content-Type': 'text/html' });
      res.end(`
        <html><body style="font-family: system-ui; padding: 40px; color: #888;">
          <h2>Waiting for dev server...</h2>
          <p>The target dev server on port ${port} is still starting up.</p>
          <p>This page will auto-refresh in 2 seconds.</p>
          <script>setTimeout(() => location.reload(), 2000)</script>
        </body></html>
      `);
    }
  };

  app.use('/preview', createProxyMiddleware({
    target: `http://localhost:${port}`,
    changeOrigin: true,
    pathRewrite: { '^/preview': '' },
    ws: true,
    on: { error: onError },
  }));

  // Vite's runtime dependencies use root-relative absolute URLs that bypass
  // the /preview prefix (/@vite/*, /@react-refresh, /src/*, /node_modules/.vite/*).
  // Mount a single proxy at root with a pathFilter so the full path is preserved
  // when forwarding — app.use(path, mw) strips the mount prefix before forwarding,
  // turning /@vite/client into /vite/client (Vite 404s).
  app.use(createProxyMiddleware({
    target: `http://localhost:${port}`,
    changeOrigin: true,
    pathFilter: (pathname) =>
      pathname.startsWith('/@') ||
      pathname.startsWith('/src') ||
      pathname.startsWith('/node_modules/.vite'),
    on: { error: onError },
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
