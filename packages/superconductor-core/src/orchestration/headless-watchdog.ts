/**
 * Headless Watchdog & Circuit Breakers
 *
 * Implements Track Specification §3.4:
 *  - Enforces diff-hash stability across remediation cycles (tripping STAGNANT_DIFF on identical diffs).
 *  - Enforces wave timeout execution limits (default 5 minutes / 300000ms per agent wave).
 *  - Persists and loads FSM quorum state checkpoints to disk (.superconductor/quorum/state.json).
 *  - Enforces maximum remediation cycle bounds to prevent infinite loops.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';

export interface QuorumPersistedState {
  trackId: string;
  phaseId?: string;
  cycle: number;
  status: 'in_progress' | 'passed' | 'failed' | 'circuit_broken';
  lastDiffHash?: string;
  timestamp: number;
  metadata?: Record<string, any>;
}

export interface HeadlessWatchdogOptions {
  maxCycles?: number;
  waveTimeoutMs?: number;
  statePath?: string;
  projectRoot?: string;
}

export class HeadlessWatchdog {
  public readonly maxCycles: number;
  public readonly waveTimeoutMs: number;
  public readonly projectRoot: string;
  public readonly statePath: string;

  private prevDiffHash?: string;

  constructor(options: HeadlessWatchdogOptions = {}) {
    this.maxCycles = options.maxCycles ?? 3;
    this.waveTimeoutMs = options.waveTimeoutMs ?? 300_000;
    this.projectRoot = options.projectRoot ?? process.cwd();
    this.statePath =
      options.statePath ??
      path.join(this.projectRoot, '.superconductor', 'quorum', 'state.json');
  }

  /**
   * Last recorded diff hash.
   */
  public get lastDiffHash(): string | undefined {
    return this.prevDiffHash;
  }

  /**
   * Set the last recorded diff hash manually (useful during state resumption).
   */
  public setLastDiffHash(hash?: string): void {
    this.prevDiffHash = hash;
  }

  /**
   * Clears recorded diff history.
   */
  public reset(): void {
    this.prevDiffHash = undefined;
  }

  /**
   * Compute a deterministic SHA-256 hash for any arbitrary text/diff.
   */
  public computeDiffHash(diff: string): string {
    return crypto.createHash('sha256').update(diff).digest('hex');
  }

  /**
   * Records a diff and checks for stability.
   * If the diff is identical to the previous recorded cycle, trips STAGNANT_DIFF.
   */
  public recordDiff(diff: string): { isStagnant: boolean; diffHash: string } {
    const diffHash = this.computeDiffHash(diff);
    if (this.prevDiffHash !== undefined && this.prevDiffHash === diffHash) {
      return { isStagnant: true, diffHash };
    }

    this.prevDiffHash = diffHash;
    return { isStagnant: false, diffHash };
  }

  /**
   * Checks whether an execution wave has exceeded the allowed wave timeout.
   */
  public isWaveTimedOut(startTime: number, currentTime: number = Date.now()): boolean {
    return currentTime - startTime >= this.waveTimeoutMs;
  }

  /**
   * Checks whether the maximum remediation cycle limit has been reached.
   */
  public isCycleLimitReached(cycle: number): boolean {
    return cycle >= this.maxCycles;
  }

  /**
   * Persists the QuorumPersistedState to disk (.superconductor/quorum/state.json).
   * Ensures parent directories exist.
   */
  public async persistState(state: QuorumPersistedState): Promise<void> {
    const dir = path.dirname(this.statePath);
    await fs.promises.mkdir(dir, { recursive: true });

    if (state.lastDiffHash) {
      this.prevDiffHash = state.lastDiffHash;
    }

    const json = JSON.stringify(state, null, 2);
    await fs.promises.writeFile(this.statePath, json, 'utf-8');
  }

  /**
   * Loads the QuorumPersistedState from disk if present.
   * Returns null if file does not exist or cannot be parsed.
   */
  public async loadState(): Promise<QuorumPersistedState | null> {
    try {
      if (!fs.existsSync(this.statePath)) {
        return null;
      }
      const raw = await fs.promises.readFile(this.statePath, 'utf-8');
      const parsed = JSON.parse(raw) as QuorumPersistedState;

      if (parsed.lastDiffHash) {
        this.prevDiffHash = parsed.lastDiffHash;
      }

      return parsed;
    } catch {
      return null;
    }
  }
}
