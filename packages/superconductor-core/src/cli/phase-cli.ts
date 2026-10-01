import {
  SuperconductorCliDispatcher,
  resolveTargetPhase,
  type PhaseCliOptions,
} from './cli-dispatcher.js';

export { resolveTargetPhase };
export type { PhaseCliOptions };

/**
 * CLI Entrypoint for Phase Management.
 * Backwards-compatible proxy delegating to SuperconductorCliDispatcher.
 * Supports subcommands: list, status, switch, advance.
 */
export async function runPhaseCli(
  args: string[] = [],
  options?: PhaseCliOptions
): Promise<number> {
  return SuperconductorCliDispatcher.runPhaseCli(args, options);
}
