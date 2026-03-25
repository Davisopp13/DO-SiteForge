import { Command } from 'commander';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

export const openCommand = new Command('open')
  .description('Open a project in SiteForge visual editor')
  .argument('<dir>', 'Directory of the project to open')
  .action((dir: string) => {
    const resolved = resolve(dir);

    if (!existsSync(resolved)) {
      console.error(`Error: Directory does not exist: ${resolved}`);
      process.exit(1);
    }

    console.log(`Opening project at ${resolved}`);
  });
