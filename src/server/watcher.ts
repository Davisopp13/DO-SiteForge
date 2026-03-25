import { watch, type FSWatcher } from 'chokidar';
import path from 'node:path';

// --- Types ---

export interface FileChange {
  filepath: string;
  type: 'created' | 'modified' | 'deleted';
  timestamp: number;
}

export interface FileWatcher {
  startWatching(): void;
  stopWatching(): void;
  getRecentChanges(since: number): FileChange[];
}

// --- Implementation ---

const IGNORED_DIRS = [
  '**/node_modules/**',
  '**/.git/**',
  '**/dist/**',
  '**/.next/**',
  '**/.siteforge/**',
];

/**
 * Creates a file watcher for detecting direct writes during Claude Code sessions.
 * The watcher is only active during a chat session to avoid noise from unrelated changes.
 */
export function createFileWatcher(projectDir: string): FileWatcher {
  let watcher: FSWatcher | null = null;
  const changes: FileChange[] = [];

  function addChange(filepath: string, type: FileChange['type']): void {
    const relative = path.relative(projectDir, filepath);
    changes.push({
      filepath: relative,
      type,
      timestamp: Date.now(),
    });
  }

  return {
    startWatching(): void {
      // Clear any previous changes
      changes.length = 0;

      // Don't start a second watcher if one is already active
      if (watcher) return;

      watcher = watch(projectDir, {
        ignored: IGNORED_DIRS,
        ignoreInitial: true,
        persistent: false,
        awaitWriteFinish: {
          stabilityThreshold: 100,
          pollInterval: 50,
        },
      });

      watcher.on('add', (fp: string) => addChange(fp, 'created'));
      watcher.on('change', (fp: string) => addChange(fp, 'modified'));
      watcher.on('unlink', (fp: string) => addChange(fp, 'deleted'));
    },

    stopWatching(): void {
      if (watcher) {
        watcher.close();
        watcher = null;
      }
    },

    getRecentChanges(since: number): FileChange[] {
      return changes.filter((c) => c.timestamp >= since);
    },
  };
}
