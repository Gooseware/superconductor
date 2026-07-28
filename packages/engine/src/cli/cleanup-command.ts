import { QuorumStore } from './quorum-store.js';
import { TrackLifecycleManager, IAgentKiller } from './lifecycle-manager.js';

export interface CleanupCommandOptions {
  /** Base directory of the workspace (defaults to process.cwd()). */
  baseDir?: string;
  /** Agent killer implementation — defaults to a no-op stub. */
  killer?: IAgentKiller;
}

/**
 * Default no-op agent killer stub.
 * In production, inject a real IAgentKiller backed by the AGY SDK.
 */
const defaultKiller: IAgentKiller = {
  async kill(_conversationId: string): Promise<'killed' | 'already_dead'> {
    // No-op default: cannot kill without AGY SDK wired.
    // Returns 'already_dead' to avoid false kill counts in dry runs.
    return 'already_dead';
  }
};

/**
 * Reads the agents.json manifest for the given trackId, kills all registered
 * agents, removes their worktrees, and prints a summary report to stdout.
 *
 * Gracefully handles:
 *   - Missing agents.json (prints a warning, exits cleanly — resolves void).
 *   - Already-dead agents (counted separately in the report, not treated as errors).
 *
 * @param trackId  The track identifier.
 * @param options  Optional overrides for baseDir and the agent killer.
 */
export async function runCleanup(
  trackId: string,
  options: CleanupCommandOptions = {}
): Promise<void> {
  const baseDir = options.baseDir ?? process.cwd();
  const killer = options.killer ?? defaultKiller;

  const store = new QuorumStore(baseDir);

  // Check whether agents.json exists — if not, print a warning and exit cleanly.
  let hasManifest = false;
  try {
    const entries = await store.readAgentsManifest(trackId);
    hasManifest = entries.length > 0;
  } catch {
    // readAgentsManifest returns [] on ENOENT; errors here are unexpected.
  }

  if (!hasManifest) {
    const manifestPath = store.getAgentsManifestPath(trackId);
    console.warn(
      `[cleanup] Warning: No agents manifest found for track "${trackId}" at ${manifestPath}. Nothing to clean up.`
    );
    return;
  }

  const manager = new TrackLifecycleManager(store, baseDir, killer);
  const report = await manager.cleanup(trackId);

  console.log(`[cleanup] Cleanup report for track "${trackId}":`);
  console.log(JSON.stringify(report, null, 2));

  if (report.errors.length > 0) {
    console.warn(`[cleanup] ${report.errors.length} error(s) occurred during cleanup (see report above).`);
  }
}
