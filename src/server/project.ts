import fs from 'node:fs';
import path from 'node:path';

export interface ProjectContext {
  type: 'nextjs' | 'vite' | 'astro' | 'static';
  framework: string;
  hasTailwind: boolean;
  hasTypeScript: boolean;
  mainFiles: string[];
}

/**
 * Scan the project directory for key files and detect the project's
 * framework, tooling, and top-level file structure.
 */
export function scanProject(projectDir: string): ProjectContext {
  const type = detectProjectType(projectDir);
  const framework = type; // Alias for AI context clarity

  const hasTailwind = hasFile(projectDir, 'tailwind.config.js') ||
    hasFile(projectDir, 'tailwind.config.ts') ||
    hasFile(projectDir, 'tailwind.config.mjs') ||
    hasFile(projectDir, 'tailwind.config.cjs');

  const hasTypeScript = hasFile(projectDir, 'tsconfig.json');

  const mainFiles = collectMainFiles(projectDir);

  return { type, framework, hasTailwind, hasTypeScript, mainFiles };
}

function hasFile(dir: string, filename: string): boolean {
  try {
    return fs.existsSync(path.join(dir, filename));
  } catch {
    return false;
  }
}

function detectProjectType(projectDir: string): ProjectContext['type'] {
  const pkgPath = path.join(projectDir, 'package.json');
  let allDeps: Record<string, string> = {};

  try {
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      allDeps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
    }
  } catch {
    // Fall through to static
  }

  if ('next' in allDeps) return 'nextjs';
  if ('astro' in allDeps) return 'astro';
  if ('vite' in allDeps) return 'vite';
  return 'static';
}

/**
 * Collect top-level files from src/ or app/ directories (one level deep only),
 * plus key root config files. Returns at most 30 entries to keep context compact.
 */
function collectMainFiles(projectDir: string): string[] {
  const files: string[] = [];

  // Key root-level config files
  const rootConfigs = [
    'package.json',
    'next.config.js', 'next.config.ts', 'next.config.mjs',
    'vite.config.js', 'vite.config.ts',
    'astro.config.mjs', 'astro.config.ts',
    'tailwind.config.js', 'tailwind.config.ts',
    'tsconfig.json',
  ];

  for (const name of rootConfigs) {
    if (hasFile(projectDir, name)) {
      files.push(name);
    }
  }

  // Top-level entries from common source directories
  const sourceDirs = ['src', 'app', 'pages'];
  for (const dirName of sourceDirs) {
    const dirPath = path.join(projectDir, dirName);
    try {
      if (fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory()) {
        const entries = fs.readdirSync(dirPath);
        for (const entry of entries) {
          files.push(`${dirName}/${entry}`);
          if (files.length >= 30) break;
        }
      }
    } catch {
      // Skip inaccessible dirs
    }
    if (files.length >= 30) break;
  }

  return files;
}
