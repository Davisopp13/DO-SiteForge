import { readFile, access } from 'node:fs/promises';
import { join } from 'node:path';

export interface ProjectInfo {
  type: 'nextjs' | 'vite' | 'astro' | 'static';
  devCommand: string;
  port: number;
  entry: string;
}

const TARGET_PORT = 4200;

export async function detectProject(dir: string): Promise<ProjectInfo> {
  const pkgPath = join(dir, 'package.json');
  let deps: Record<string, string> = {};
  let devDeps: Record<string, string> = {};

  try {
    const raw = await readFile(pkgPath, 'utf-8');
    const pkg = JSON.parse(raw);
    deps = pkg.dependencies ?? {};
    devDeps = pkg.devDependencies ?? {};
  } catch {
    // No package.json — fall through to static detection
  }

  const allDeps = { ...deps, ...devDeps };

  if ('next' in allDeps) {
    return {
      type: 'nextjs',
      devCommand: `npx next dev --port ${TARGET_PORT}`,
      port: TARGET_PORT,
      entry: 'pages/index.tsx',
    };
  }

  if ('astro' in allDeps) {
    return {
      type: 'astro',
      devCommand: `npx astro dev --port ${TARGET_PORT}`,
      port: TARGET_PORT,
      entry: 'src/pages/index.astro',
    };
  }

  if ('vite' in allDeps) {
    return {
      type: 'vite',
      devCommand: `npx vite --port ${TARGET_PORT}`,
      port: TARGET_PORT,
      entry: 'index.html',
    };
  }

  // Static fallback — check for index.html
  try {
    await access(join(dir, 'index.html'));
  } catch {
    // No index.html either, still return static as default
  }

  return {
    type: 'static',
    devCommand: '',
    port: TARGET_PORT,
    entry: 'index.html',
  };
}
