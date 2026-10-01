import { EventEmitter } from 'node:events';
import { exec as cpExec } from 'node:child_process';
import { promisify } from 'node:util';
import { SwarmAuthorizer } from '../track/swarm-authorizer.js';
import type { WorktreeIsolationManager } from './worktree-isolation-manager.js';
import type { WorktreeManagerLike } from '../remediation/domain-split-remediation-dispatcher.js';
export type { WorktreeManagerLike };

export interface ShellRunner {
  exec(command: string): Promise<{ stdout: string; stderr: string; exitCode?: number } | string>;
}

export interface MergeQueueItem {
  trackId: string;
  branch: string;
  agentId?: string;
  worktreePath?: string;
  worktreeManager?: WorktreeIsolationManager | WorktreeManagerLike;
  targetBranch?: string;
  preMergeVerification?: (() => Promise<boolean | void>) | string;
  commitMessage?: string;
  reviewerConvIds?: string[];
  authorizerTrailers?: Record<string, string> | string[] | string;
  mergeCommand?: string;
  useWorktrunk?: boolean;
  onRelease?: () => Promise<void> | void;
}

export interface MergeResult {
  trackId: string;
  branch: string;
  success: boolean;
  targetBranch: string;
  commitSha?: string;
  error?: string;
  durationMs?: number;
}

export interface MergeQueueManagerOptions {
  projectRoot?: string;
  targetBranch?: string;
  preMergeCommand?: string;
  shell?: ShellRunner;
  wtBinary?: string;
  useWorktrunk?: boolean;
  worktreeManager?: WorktreeIsolationManager | WorktreeManagerLike;
  defaultReviewers?: string[];
}

export class MergeQueueManager extends EventEmitter {
  private queue: MergeQueueItem[] = [];
  private mergeLock: Promise<void> = Promise.resolve();
  private shell: ShellRunner;
  private projectRoot: string;
  private defaultTargetBranch: string;
  private defaultPreMergeCommand?: string;
  private wtBinary: string;
  private useWorktrunk: boolean;
  private worktreeManager?: WorktreeIsolationManager | WorktreeManagerLike;
  private defaultReviewers?: string[];
  private processing = false;

  constructor(private options: MergeQueueManagerOptions = {}) {
    super();
    this.projectRoot = options.projectRoot ?? process.cwd();
    this.defaultTargetBranch = options.targetBranch ?? 'main';
    this.defaultPreMergeCommand = options.preMergeCommand;
    this.wtBinary = options.wtBinary ?? 'wt';
    this.useWorktrunk = options.useWorktrunk ?? false;
    this.worktreeManager = options.worktreeManager;
    this.defaultReviewers = options.defaultReviewers;
    this.shell = options.shell ?? {
      async exec(cmd: string) {
        try {
          const { stdout, stderr } = await promisify(cpExec)(cmd, {
            cwd: options.projectRoot ?? process.cwd(),
            encoding: 'utf8',
          });
          return { stdout, stderr, exitCode: 0 };
        } catch (err: any) {
          return {
            stdout: err.stdout ?? '',
            stderr: err.stderr ?? err.message ?? '',
            exitCode: err.code ?? 1,
          };
        }
      },
    };
  }

  getQueue(): MergeQueueItem[] {
    return [...this.queue];
  }

  get queueLength(): number {
    return this.queue.length;
  }

  isProcessing(): boolean {
    return this.processing;
  }

  async enqueue(item: MergeQueueItem): Promise<MergeResult> {
    if (!item.branch || !/^[a-zA-Z0-9_\-\.\/]+$/.test(item.branch) || item.branch.startsWith('-')) {
      const errorMsg = `Invalid branch name "${item?.branch}": branch must match /^[a-zA-Z0-9_\\-\\.\\/]+$/ and cannot start with '-'`;
      const targetBranch = item?.targetBranch || this.defaultTargetBranch;
      const failedResult: MergeResult = {
        trackId: item?.trackId,
        branch: item?.branch,
        success: false,
        targetBranch,
        error: errorMsg,
      };
      this.emit('merge_failed', failedResult, item);
      throw new Error(errorMsg);
    }

    this.queue.push(item);
    this.emit('merge_enqueued', item);

    return new Promise<MergeResult>((resolve) => {
      // Chain onto existing mergeLock, continuing safely even if a prior merge threw
      const prevLock = this.mergeLock.catch(() => {});
      this.mergeLock = prevLock.then(async () => {
        this.processing = true;
        try {
          const idx = this.queue.indexOf(item);
          if (idx !== -1) {
            this.queue.splice(idx, 1);
          }
          const result = await this.processItem(item);
          resolve(result);
        } catch (err: any) {
          const targetBranch = item.targetBranch || this.defaultTargetBranch;
          const failedResult: MergeResult = {
            trackId: item.trackId,
            branch: item.branch,
            success: false,
            targetBranch,
            error: err?.message || String(err),
          };
          this.emit('merge_failed', failedResult, item);
          resolve(failedResult);
        } finally {
          this.processing = this.queue.length > 0;
        }
      });
    });
  }

  private async processItem(item: MergeQueueItem): Promise<MergeResult> {
    const startTime = Date.now();
    this.emit('merge_started', item);
    const targetBranch = item.targetBranch || this.defaultTargetBranch;

    // 1. Run pre-merge verification
    try {
      await this.runPreMergeVerification(item);
    } catch (err: any) {
      const errorMsg = `Pre-merge verification failed: ${err?.message || String(err)}`;
      const result: MergeResult = {
        trackId: item.trackId,
        branch: item.branch,
        success: false,
        targetBranch,
        error: errorMsg,
        durationMs: Date.now() - startTime,
      };
      this.emit('merge_failed', result, item);
      return result;
    }

    // 2. Perform non-fast-forward merge with Swarm authorizer trailers
    let commitSha: string | undefined;
    try {
      const trailer = this.generateTrailer(item);
      const commitTitle = item.commitMessage || `feat(track): merge ${item.trackId} into ${targetBranch}`;
      const fullCommitMsg = `${commitTitle}\n\n${trailer}`;
      const mergeCmd = this.buildMergeCommand(item, targetBranch, fullCommitMsg);

      const execRes = await this.shell.exec(mergeCmd);
      if (typeof execRes === 'object' && execRes.exitCode !== undefined && execRes.exitCode !== 0) {
        throw new Error(
          `Merge command failed with exit code ${execRes.exitCode}: ${execRes.stderr || execRes.stdout}`
        );
      }

      const out = typeof execRes === 'string' ? execRes : (execRes.stdout || '');
      const shaMatch = out.match(/\b([0-9a-f]{7,40})\b/i);
      commitSha = shaMatch ? shaMatch[1] : undefined;
    } catch (err: any) {
      const errorMsg = `Merge execution failed: ${err?.message || String(err)}`;
      const result: MergeResult = {
        trackId: item.trackId,
        branch: item.branch,
        success: false,
        targetBranch,
        error: errorMsg,
        durationMs: Date.now() - startTime,
      };
      this.emit('merge_failed', result, item);
      return result;
    }

    // 3. Re-release worktree upon successful integration
    try {
      await this.releaseWorktree(item);
    } catch (err: any) {
      // Release failures do not invalidate the successful merge commit
      console.warn(`[MergeQueueManager] Failed to release worktree for track ${item.trackId}:`, err);
    }

    const result: MergeResult = {
      trackId: item.trackId,
      branch: item.branch,
      success: true,
      targetBranch,
      commitSha,
      durationMs: Date.now() - startTime,
    };

    this.emit('merge_completed', result, item);
    return result;
  }

  private async runPreMergeVerification(item: MergeQueueItem): Promise<void> {
    if (item.preMergeVerification) {
      if (typeof item.preMergeVerification === 'function') {
        const res = await item.preMergeVerification();
        if (res === false) {
          throw new Error('Verification function returned false');
        }
      } else if (typeof item.preMergeVerification === 'string') {
        const res = await this.shell.exec(item.preMergeVerification);
        if (typeof res === 'object' && res.exitCode !== undefined && res.exitCode !== 0) {
          throw new Error(res.stderr || res.stdout || `Command exited with code ${res.exitCode}`);
        }
      }
    } else if (this.defaultPreMergeCommand) {
      const res = await this.shell.exec(this.defaultPreMergeCommand);
      if (typeof res === 'object' && res.exitCode !== undefined && res.exitCode !== 0) {
        throw new Error(res.stderr || res.stdout || `Command exited with code ${res.exitCode}`);
      }
    }
  }

  private generateTrailer(item: MergeQueueItem): string {
    if (typeof item.authorizerTrailers === 'string' && item.authorizerTrailers.trim()) {
      return item.authorizerTrailers.trim();
    }
    if (item.reviewerConvIds && item.reviewerConvIds.length > 0) {
      try {
        return SwarmAuthorizer.generateTrailer(item.reviewerConvIds.slice(0, 5));
      } catch {
        // Fallback if invalid chars
      }
    }
    if (Array.isArray(item.authorizerTrailers) && item.authorizerTrailers.length > 0) {
      return item.authorizerTrailers.join('\n');
    }
    if (item.authorizerTrailers && typeof item.authorizerTrailers === 'object') {
      return Object.entries(item.authorizerTrailers)
        .map(([k, v]) => `${k}: ${v}`)
        .join('\n');
    }
    if (this.defaultReviewers && this.defaultReviewers.length > 0) {
      try {
        return SwarmAuthorizer.generateTrailer(this.defaultReviewers.slice(0, 5));
      } catch {
        // Fallback
      }
    }
    return 'Swarm-Authorized: true | reviewers: swarm-default';
  }

  private buildMergeCommand(item: MergeQueueItem, targetBranch: string, commitMsg: string): string {
    if (item.mergeCommand) {
      return item.mergeCommand;
    }
    const safeMsg = "'" + commitMsg.replace(/'/g, "'\\''") + "'";
    const safeBranch = "'" + item.branch.replace(/'/g, "'\\''") + "'";
    const useWt = item.useWorktrunk ?? this.useWorktrunk;
    if (useWt) {
      return `"${this.wtBinary}" step push --no-ff -m ${safeMsg}`;
    }
    return `git merge --no-ff ${safeBranch} -m ${safeMsg}`;
  }

  private async releaseWorktree(item: MergeQueueItem): Promise<void> {
    if (item.onRelease) {
      await item.onRelease();
    }
    const wm = item.worktreeManager || this.worktreeManager;
    if (wm && item.agentId && typeof wm.release === 'function') {
      await wm.release(item.agentId);
    }
  }
}
