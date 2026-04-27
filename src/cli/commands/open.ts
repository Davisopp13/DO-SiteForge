import { Command } from 'commander';
import { existsSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import chalk from 'chalk';
import { detectProject } from '../detect.js';
import { createServer } from '../../server/index.js';
import { spawnDevServer, killDevServer, type ProxyTarget } from '../../server/proxy.js';
import { loadConfig } from '../../server/config.js';
import { detectProviders } from '../../server/providers/types.js';
import { createClaudeCodeProvider } from '../../server/providers/claude-code.js';
import { createAnthropicApiProvider } from '../../server/providers/anthropic-api.js';

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
    const { child: devServerProcess, portReady } = spawnDevServer(target);

    // For dev-server projects, wait until the server emits its ready URL so we
    // know the actual port (Vite drifts: 4200 → 4201 → ... when ports are taken).
    if (devServerProcess) {
      try {
        target.port = await portReady;
      } catch (err) {
        console.error(chalk.red(`\n  Error: Dev server failed to start.`));
        console.error(chalk.dim(`  ${err instanceof Error ? err.message : String(err)}`));
        killDevServer();
        process.exit(1);
      }
    }

    // Load config and detect AI provider
    const config = loadConfig(resolved);
    const providers = detectProviders(
      config,
      () => createClaudeCodeProvider(),
      () => createAnthropicApiProvider(config)
    );
    const activeProvider = providers.active;

    // Start SiteForge editor server (target.port is now the actual resolved port)
    const { server } = createServer(EDITOR_PORT, target);

    // Print startup message (after dev server is ready so Preview shows the real port)
    console.log('');
    console.log(chalk.green.bold('  ⚡ SiteForge'));
    console.log('');
    console.log(`  ${chalk.dim('Project:')}  ${chalk.white(projectName)}`);
    console.log(`  ${chalk.dim('Type:')}     ${chalk.white(project.type)}`);
    console.log(`  ${chalk.dim('Editor:')}   ${chalk.cyan(`http://localhost:${EDITOR_PORT}`)}`);
    if (devServerProcess) {
      console.log(`  ${chalk.dim('Preview:')}  ${chalk.cyan(`http://localhost:${target.port}`)}`);
    }
    if (activeProvider.name === 'claude-code') {
      console.log(`  ${chalk.dim('AI:')}       ${chalk.green('Claude Code (OAuth)')}`);
    } else if (activeProvider.name === 'anthropic-api') {
      const keyHint = config.anthropicApiKey
        ? `sk-...${config.anthropicApiKey.slice(-4)}`
        : '';
      console.log(`  ${chalk.dim('AI:')}       ${chalk.green(`Anthropic API (${keyHint})`)}`);
    } else {
      console.log(`  ${chalk.dim('AI:')}       ${chalk.yellow('Disabled (no provider available)')}`);
    }
    console.log('');
    console.log(chalk.green('  ✓ Ready') + chalk.dim(' — open the editor URL in your browser'));
    console.log(chalk.dim('  Press Ctrl+C to stop'));
    console.log('');

    if (activeProvider.name === 'disabled') {
      console.log(chalk.yellow('  ⚠ No AI provider found. Install Claude Code for the best experience — no API key needed.'));
      console.log(chalk.dim('    Or set ANTHROPIC_API_KEY in your environment or siteforge.config.json'));
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
