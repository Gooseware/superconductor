import { execFile, execFileSync } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import { QuorumStore, AgentManifestEntry } from './quorum-store.js';
import { RetrospectiveGenerator, RetroFinding } from '../telemetry/retrospective-generator.js';

const execFileAsync = promisify(execFile);

/**
 * Pluggable interface for killing a running agent conversation.
 * Inject a mock in tests; the real implementation delegates to the AGY SDK.
 */
export interface IAgentKiller {
  kill(conversationId: string): Promise<'killed' | 'already_dead'>;
}

/**
 * Provides agent-readable access to the agents manifest for a track.
 * Currently backed by QuorumStore but abstracted so tests can inject mocks.
 */
export interface IAgentsManifestReader {
  readAgentsManifest(trackId: string): Promise<AgentManifestEntry[]>;
}

/**
 * Report returned by TrackLifecycleManager.cleanup().
 */
export interface CleanupReport {
  trackId: string;
  agentsKilled: number;
  agentsAlreadyDead: number;
  worktreesRemoved: number;
  errors: string[];
}

/** Optional overrides for exec behaviour (used for testing). */
export interface TrackLifecycleManagerOptions {
  /** Override the worktree-remove executor — default runs `git worktree remove --force <path>`. */
  execWorktreeRemove?: (worktreePath: string) => Promise<void>;
  /**
   * Override the git-notes executor — default calls execFileSync with git notes add.
   * Inject a mock in tests to avoid real git calls.
   */
  execGitNotes?: (retroJson: string, cwd: string) => void;
}

/**
 * Manages the lifecycle of a Superconductor track: killing registered agents
 * and pruning their associated git worktrees after all work units reach DONE.
 */
export class TrackLifecycleManager {
  private manifestReader: IAgentsManifestReader;
  private worktreeDir: string;
  private killer: IAgentKiller;
  private execWorktreeRemove: (worktreePath: string) => Promise<void>;
  private execGitNotes: (retroJson: string, cwd: string) => void;

  constructor(
    manifestReader: IAgentsManifestReader,
    worktreeDir: string,
    killer: IAgentKiller,
    options: TrackLifecycleManagerOptions = {}
  ) {
    this.manifestReader = manifestReader;
    this.worktreeDir = worktreeDir;
    this.killer = killer;
    this.execWorktreeRemove = options.execWorktreeRemove ?? this._defaultExecWorktreeRemove.bind(this);
    this.execGitNotes = options.execGitNotes ?? this._defaultExecGitNotes.bind(this);
  }

  /**
   * Default git worktree removal implementation using child_process.execFile.
   * Uses an argument array — never interpolates worktreePath into a shell string,
   * preventing command injection via shell subshell operators.
   */
  private async _defaultExecWorktreeRemove(worktreePath: string): Promise<void> {
    await execFileAsync('git', ['worktree', 'remove', '--force', worktreePath], {
      cwd: this.worktreeDir
    });
  }

  /**
   * Default git notes implementation — attaches retroJson as a git note on HEAD.
   * Uses execFileSync with an argument array (no shell interpolation).
   */
  private _defaultExecGitNotes(retroJson: string, cwd: string): void {
    execFileSync('git', ['notes', 'add', '-f', '-m', retroJson], {
      cwd,
      stdio: 'ignore',
    });
  }

  /**
   * Cleans up all agents and worktrees associated with the given trackId.
   *
   * For each entry in agents.json:
   *   1. Calls `killer.kill(conversationId)` — tallies killed vs already_dead.
   *   2. If `worktreePath` is set, removes the git worktree via `git worktree remove --force`.
   *
   * Does NOT throw — all errors are collected into the returned `errors` array.
   *
   * @returns CleanupReport with tallied counts and any errors encountered.
   */
  public async cleanup(trackId: string): Promise<CleanupReport> {
    const report: CleanupReport = {
      trackId,
      agentsKilled: 0,
      agentsAlreadyDead: 0,
      worktreesRemoved: 0,
      errors: [],
    };

    let entries: AgentManifestEntry[];
    try {
      entries = await this.manifestReader.readAgentsManifest(trackId);
    } catch (err: any) {
      report.errors.push(`Failed to read agents manifest for track "${trackId}": ${err?.message ?? String(err)}`);
      return report;
    }

    // Process agents in parallel for speed; collect all errors.
    await Promise.all(entries.map(async (entry) => {
      // Step 1: Kill the agent
      try {
        const result = await this.killer.kill(entry.conversationId);
        if (result === 'killed') {
          report.agentsKilled++;
        } else {
          report.agentsAlreadyDead++;
        }
      } catch (err: any) {
        report.errors.push(
          `Failed to kill agent "${entry.conversationId}": ${err?.message ?? String(err)}`
        );
      }

      // Step 2: Remove worktree if path is set
      if (entry.worktreePath) {
        try {
          await this.execWorktreeRemove(entry.worktreePath);
          report.worktreesRemoved++;
        } catch (err: any) {
          report.errors.push(
            `Failed to remove worktree at "${entry.worktreePath}": ${err?.message ?? String(err)}`
          );
        }
      }
    }));

    return report;
  }

  /**
   * Called automatically when all work units for a track reach DONE.
   * Runs cleanup() and logs the resulting report.
   */
  public async onTrackComplete(trackId: string): Promise<void> {
    const report = await this.cleanup(trackId);

    // Generate and attach retrospective as git notes (non-blocking)
    try {
      const generator = new RetrospectiveGenerator({
        transcriptPath: path.join(this.worktreeDir, '.superconductor', trackId, 'transcript.jsonl'),
        quorumStorePath: path.join(this.worktreeDir, '.superconductor', 'quorum'),
        workspaceDir: this.worktreeDir,
      });
            const quorumStore = new QuorumStore(this.worktreeDir);
      const entries = await this.manifestReader.readAgentsManifest(trackId).catch((e) => { report.errors.push(String(e)); return []; });
      const wuIds = [...new Set(entries.map(e => e.wuId))];
      const stepIndices = await generator.extractStepIndices();
      const defaultStepIndex = stepIndices.size > 0 ? Math.min(...Array.from(stepIndices)) : 0;

      const findings: RetroFinding[] = [];
      let findingCount = 0;
      for (const wuId of wuIds) {
        try {
          const consensus = await quorumStore.readConsensus(wuId);
          if (consensus && Array.isArray(consensus.payload)) {
            for (const item of consensus.payload) {
              findingCount++;
              findings.push({
                findingId: `finding-${wuId}-${findingCount}`,
                stepIndex: defaultStepIndex,
                description: String(item)
              });
            }
          }
        } catch (e) { console.warn('[TrackLifecycleManager] Failed to read consensus for wuId:', wuId, e instanceof Error ? e.message : String(e)); report.errors.push(String(e)); }
      }

      const retro = await generator.generate(trackId, findings);
      const retroJson = JSON.stringify(retro, null, 2);
      // Attach to HEAD commit as git notes (injection-safe: uses argument array)
      this.execGitNotes(retroJson, this.worktreeDir);
    } catch (e) {
      // Non-blocking: log but never prevent track completion
      console.warn('[RetrospectiveGenerator] Failed to generate retrospective:', e instanceof Error ? e.message : String(e));
      report.errors.push(String(e));
    }

    console.log(`[TrackLifecycleManager] Cleanup complete for track "${trackId}":`, JSON.stringify(report, null, 2));
  }
}
