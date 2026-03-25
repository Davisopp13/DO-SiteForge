import { Command } from 'commander';
import { existsSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import chalk from 'chalk';
import { detectProject } from '../detect.js';
import { createServer } from '../../server/index.js';
import { spawnDevServer, killDevServer, type ProxyTarget } from '../../server/proxy.js';
import { loadConfig, hasApiKey } from '../../server/config.js';

const EDITOR_PORT = 3000;

export const openCommand = new Command('open')
  .description('Open a project in SiteForge visual editor')
  .argument('<dir>', 'Directory of the project to open')
  .action(async (dir: string) => {
    const resolved = resolve(dir);

    if (!existsSync(resolved)) {
      console.error(chalk.red(`Error: Directory does not exist: ${resolved}`));
      process.exit(1);
    }

    // Detect project type
    const project = await detectProject(resolved);
    const projectName = basename(resolved);

    const target: ProxyTarget = {
      type: project.type,
      devCommand: project.devCommand,
      port: project.port,
      projectDir: resolved,
    };

    // Spawn target dev server for non-static projects
    const devServerProcess = spawnDevServer(target);

    // Load config and check API key
    const config = loadConfig(resolved);
    const aiReady = hasApiKey(config);

    // Start SiteForge editor server
    const { server } = createServer(EDITOR_PORT, target);

    // Print startup message
    console.log('');
    console.log(chalk.green.bold('  ⚡ SiteForge'));
    console.log('');
    console.log(`  ${chalk.dim('Project:')}  ${chalk.white(projectName)}`);
    console.log(`  ${chalk.dim('Type:')}     ${chalk.white(project.type)}`);
    console.log(`  ${chalk.dim('Editor:')}   ${chalk.cyan(`http://localhost:${EDITOR_PORT}`)}`);
    if (devServerProcess) {
      console.log(`  ${chalk.dim('Preview:')}  ${chalk.cyan(`http://localhost:${project.port}`)}`);
    }
    if (aiReady) {
      console.log(`  ${chalk.dim('AI:')}       ${chalk.green(`Ready (${config.model})`)}`);
    } else {
      console.log(`  ${chalk.dim('AI:')}       ${chalk.yellow('Disabled (no API key)')}`);
    }
    console.log('');
    console.log(chalk.green('  ✓ Ready') + chalk.dim(' — open the editor URL in your browser'));
    console.log(chalk.dim('  Press Ctrl+C to stop'));
    console.log('');

    if (!aiReady) {
      console.log(chalk.yellow('  ⚠ No ANTHROPIC_API_KEY found. AI features will be disabled.'));
      console.log(chalk.dim('    Set it in your environment or in siteforge.config.json'));
      console.log('');
    }

    // Open browser automatically
    try {
      const open = (await import('open')).default;
      await open(`http://localhost:${EDITOR_PORT}`);
    } catch {
      // Silently fail if browser can't be opened
    }

    // Graceful shutdown on Ctrl+C
    const cleanup = () => {
      console.log(chalk.dim('\n  Shutting down...'));
      killDevServer();
      server.close(() => {
        process.exit(0);
      });
      // Force exit after 3 seconds if server doesn't close gracefully
      setTimeout(() => process.exit(0), 3000);
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
  });
