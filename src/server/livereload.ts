import { watch, type FSWatcher } from 'chokidar';
import { WebSocketServer, type WebSocket } from 'ws';
import type { Server } from 'node:http';
import path from 'node:path';

const IGNORED_DIRS = [
  '**/node_modules/**',
  '**/.git/**',
  '**/dist/**',
  '**/.siteforge/**',
];

export interface LiveReloadServer {
  attach(httpServer: Server): void;
  startWatching(projectDir: string): void;
  stopWatching(): void;
}

/**
 * Creates a live reload WebSocket server that shares the HTTP server port.
 * When files change in the watched project directory, sends { type: "reload" }
 * to all connected WebSocket clients.
 *
 * Only intended for static projects — framework projects use HMR.
 */
export function createLiveReloadServer(): LiveReloadServer {
  let wss: WebSocketServer | null = null;
  let fsWatcher: FSWatcher | null = null;
  let reloadTimer: ReturnType<typeof setTimeout> | null = null;

  function broadcastReload(): void {
    if (!wss) return;
    const msg = JSON.stringify({ type: 'reload' });
    wss.clients.forEach((client: WebSocket) => {
      if (client.readyState === client.OPEN) {
        client.send(msg);
      }
    });
  }

  function scheduleReload(): void {
    // Debounce: collect all changes within 300ms, then send one reload
    if (reloadTimer) clearTimeout(reloadTimer);
    reloadTimer = setTimeout(() => {
      reloadTimer = null;
      broadcastReload();
    }, 300);
  }

  return {
    attach(httpServer: Server): void {
      wss = new WebSocketServer({ server: httpServer, path: '/livereload' });
      wss.on('error', (err: Error) => {
        console.error('[livereload] WebSocket server error:', err.message);
      });
    },

    startWatching(projectDir: string): void {
      if (fsWatcher) return;

      fsWatcher = watch(projectDir, {
        ignored: IGNORED_DIRS,
        ignoreInitial: true,
        persistent: false,
        awaitWriteFinish: {
          stabilityThreshold: 150,
          pollInterval: 50,
        },
      });

      const onChange = (_fp: string): void => scheduleReload();
      fsWatcher.on('add', onChange);
      fsWatcher.on('change', onChange);
      fsWatcher.on('unlink', onChange);
    },

    stopWatching(): void {
      if (reloadTimer) {
        clearTimeout(reloadTimer);
        reloadTimer = null;
      }
      if (fsWatcher) {
        fsWatcher.close();
        fsWatcher = null;
      }
    },
  };
}
