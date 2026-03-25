import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: ['bin/forge.ts', 'src/server/index.ts'],
    format: ['esm'],
    outDir: 'dist',
    banner: {
      js: '#!/usr/bin/env node',
    },
    platform: 'node',
    target: 'node20',
    clean: true,
  },
  {
    entry: ['src/editor/app.ts'],
    format: ['esm'],
    outDir: 'dist/editor',
    platform: 'browser',
    target: 'es2022',
  },
  {
    entry: ['src/bridge/bridge.ts'],
    format: ['iife'],
    outDir: 'dist/bridge',
    platform: 'browser',
    target: 'es2022',
  },
]);
