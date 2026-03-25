import { Command } from 'commander';

export function run(): void {
  const program = new Command();

  program
    .name('forge')
    .version('0.1.0')
    .description('SiteForge — visual website builder for vibe coders');

  program.parse(process.argv);
}
