import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { detectProject } from '../src/cli/detect.js';

describe('detectProject', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'siteforge-test-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('detects Next.js project', async () => {
    await writeFile(
      join(tempDir, 'package.json'),
      JSON.stringify({ dependencies: { next: '^14.0.0', react: '^18.0.0' } })
    );
    const result = await detectProject(tempDir);
    expect(result.type).toBe('nextjs');
    expect(result.devCommand).toContain('next dev');
    expect(result.port).toBe(4200);
  });

  it('detects Next.js in devDependencies', async () => {
    await writeFile(
      join(tempDir, 'package.json'),
      JSON.stringify({ devDependencies: { next: '^14.0.0' } })
    );
    const result = await detectProject(tempDir);
    expect(result.type).toBe('nextjs');
  });

  it('detects Vite project', async () => {
    await writeFile(
      join(tempDir, 'package.json'),
      JSON.stringify({ devDependencies: { vite: '^5.0.0' } })
    );
    const result = await detectProject(tempDir);
    expect(result.type).toBe('vite');
    expect(result.devCommand).toContain('vite');
    expect(result.port).toBe(4200);
  });

  it('detects Astro project', async () => {
    await writeFile(
      join(tempDir, 'package.json'),
      JSON.stringify({ dependencies: { astro: '^4.0.0' } })
    );
    const result = await detectProject(tempDir);
    expect(result.type).toBe('astro');
    expect(result.devCommand).toContain('astro dev');
    expect(result.port).toBe(4200);
  });

  it('prefers Next.js over Vite when both present', async () => {
    await writeFile(
      join(tempDir, 'package.json'),
      JSON.stringify({ dependencies: { next: '^14.0.0', vite: '^5.0.0' } })
    );
    const result = await detectProject(tempDir);
    expect(result.type).toBe('nextjs');
  });

  it('prefers Astro over Vite when both present', async () => {
    await writeFile(
      join(tempDir, 'package.json'),
      JSON.stringify({ dependencies: { astro: '^4.0.0', vite: '^5.0.0' } })
    );
    const result = await detectProject(tempDir);
    expect(result.type).toBe('astro');
  });

  it('falls back to static when no framework detected', async () => {
    await writeFile(
      join(tempDir, 'package.json'),
      JSON.stringify({ dependencies: { lodash: '^4.0.0' } })
    );
    const result = await detectProject(tempDir);
    expect(result.type).toBe('static');
    expect(result.entry).toBe('index.html');
  });

  it('falls back to static when no package.json exists', async () => {
    const result = await detectProject(tempDir);
    expect(result.type).toBe('static');
  });

  it('returns port 4200 for all project types', async () => {
    const result = await detectProject(tempDir);
    expect(result.port).toBe(4200);
  });
});
