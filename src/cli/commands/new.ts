import { Command } from 'commander';

export const newCommand = new Command('new')
  .description('Create a new SiteForge project')
  .argument('<name>', 'Name for the new project')
  .action((name: string) => {
    console.log(`Creating new project: ${name}`);
  });
