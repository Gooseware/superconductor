import { execFileSync } from 'child_process';
import { ExecutionMode, NonInteractiveModeError } from './execution-mode.js';
import type { SwarmPermissionEvaluator } from '../cli/swarm-permission-evaluator.js';

export interface HeadlessModeGuardOptions {
  notifyOnFatal?: boolean; // default: true
  stderrOnFatal?: boolean; // default: true
}

export class HeadlessModeGuard {
  constructor(
    private readonly mode: ExecutionMode,
    private readonly options: HeadlessModeGuardOptions = {}
  ) {}

  /**
   * Asserts that interactive input is allowed.
   * In HEADLESS/BATCH_OVERNIGHT mode: throws NonInteractiveModeError.
   * @param context - Human-readable description of what prompt was attempted
   * @param isFatal - If true, also calls notify-send and writes to stderr before throwing
   */
  assertInteractiveAllowed(context: string, isFatal = false): void {
    if (this.mode === ExecutionMode.INTERACTIVE) return;

    if (isFatal) {
      const msg = `[Superconductor] FATAL: Interactive prompt attempted in ${this.mode} mode: ${context}`;
      if (this.options.stderrOnFatal !== false) {
        process.stderr.write(msg + '\n');
      }
      if (this.options.notifyOnFatal !== false) {
        try {
          execFileSync('notify-send', ['Superconductor', context], { stdio: 'ignore' });
        } catch (e) { console.debug('notify-send failed (expected in CI):', e instanceof Error ? e.message : String(e)); }
      }
    }

    throw new NonInteractiveModeError(this.mode, context);
  }
}

/**
 * Creates a HeadlessModeGuard bound to the actual runtime execution mode.
 * ALWAYS use this factory in production code. Only use the constructor directly in tests.
 */
export function createHeadlessModeGuard(
  evaluator: SwarmPermissionEvaluator,
  options?: HeadlessModeGuardOptions
): HeadlessModeGuard {
  return new HeadlessModeGuard(evaluator.getExecutionMode(), options);
}
