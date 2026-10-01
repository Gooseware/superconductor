import { SuperconductorCliDispatcher } from './cli-dispatcher.js';

export * from './cli-dispatcher.js';
export * from './dispatcher.js';
export * from './interactive.js';
export * from './headless.js';
export * from './merge-track.js';
export * from './learn.js';
export * from './phase-cli.js';
export * from './crawl.js';

/**
 * Universal CLI entrypoint for Superconductor Core.
 * Delegates execution to the centralized SuperconductorCliDispatcher.
 */
export async function runCli(args: string[] = process.argv.slice(2)): Promise<void> {
  await SuperconductorCliDispatcher.runCli(args);
}

// Auto-run if executed as main CLI binary
if (import.meta.url === `file://${process.argv[1]}`) {
  runCli().catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
