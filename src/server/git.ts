// Git helpers for undo support in Claude Code mode
// Checks git status, stores HEAD snapshots, and restores files

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Check if a directory is inside a git repository.
 */
export function isGitRepo(dir: string): boolean {
  try {
    execSync('git rev-parse --is-inside-work-tree', {
      cwd: dir,
      stdio: 'pipe',
      timeout: 5000,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the current HEAD commit hash.
 * Returns null if not a git repo or git fails.
 */
export function getHeadRef(dir: string): string | null {
  try {
    const result = execSync('git rev-parse HEAD', {
      cwd: dir,
      stdio: 'pipe',
      timeout: 5000,
    });
    return result.toString().trim();
  } catch {
    return null;
  }
}

/**
 * Restore a single file to its state at a given commit.
 * For files that existed at the ref: restores via `git checkout <ref> -- <filepath>`.
 * For files that didn't exist at the ref (newly created by AI): removes them.
 */
export function restoreFile(
  dir: string,
  filepath: string,
  ref: string,
): { success: boolean; error?: string } {
  const relPath = path.isAbsolute(filepath)
    ? path.relative(dir, filepath)
    : filepath;

  try {
    // Check if file existed at the given ref
    let existedAtRef = true;
    try {
      execSync(`git cat-file -e ${ref}:${relPath}`, {
        cwd: dir,
        stdio: 'pipe',
        timeout: 5000,
      });
    } catch {
      existedAtRef = false;
    }

    if (existedAtRef) {
      // File existed at ref — restore it
      execSync(`git checkout ${ref} -- ${relPath}`, {
        cwd: dir,
        stdio: 'pipe',
        timeout: 5000,
      });
    } else {
      // File was newly created — remove it
      const fullPath = path.resolve(dir, relPath);
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
      }
    }
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Restore multiple files to their state at a given commit.
 */
export function restoreFiles(
  dir: string,
  filepaths: string[],
  ref: string,
): { filepath: string; success: boolean; error?: string }[] {
  return filepaths.map((filepath) => ({
    filepath,
    ...restoreFile(dir, filepath, ref),
  }));
}
