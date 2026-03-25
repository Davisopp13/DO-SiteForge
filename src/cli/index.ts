import { Command } from 'commander';
import { openCommand } from './commands/open.js';
import { newCommand } from './commands/new.js';

export function run(): void {
  const program = new Command();

  program
    .name('forge')
    .version('0.1.0')
    .description('SiteForge — visual website builder for vibe coders');

  program.addCommand(openCommand);
  program.addCommand(newCommand);

  program.parse(process.argv);
}
