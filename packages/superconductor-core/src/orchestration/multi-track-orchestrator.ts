import { EventEmitter } from 'node:events';
import { ExecutionPlanner, type TrackPlanData } from '../track/execution-planner.js';
import {
  WorktreeIsolationManager,
  type ShellRunner,
} from './worktree-isolation-manager.js';
import {
  MergeQueueManager,
  type MergeQueueItem,
  type MergeResult,
} from './merge-queue-manager.js';
import type { WorktreeManagerLike } from '../remediation/domain-split-remediation-dispatcher.js';

export interface TrackExecutionContext {
  track: TrackPlanData;
  agentId: string;
  branch: string;
  worktreePath?: string;
  projectRoot: string;
  executionMode: 'headless' | 'interactive';
  targetBranch: string;
}

export interface TrackExecutionResult {
  trackId: string;
  success: boolean;
  branch?: string;
  agentId?: string;
  output?: string;
  error?: string;
  reviewerConvIds?: string[];
  authorizerTrailers?: Record<string, string> | string[] | string;
  preMergeVerification?: (() => Promise<boolean | void>) | string;
  commitMessage?: string;
  mergeCommand?: string;
}

export type TrackExecutorFn = (context: TrackExecutionContext) => Promise<TrackExecutionResult>;

export interface TrackWaveResult {
  trackId: string;
  success: boolean;
  branch: string;
  agentId: string;
  worktreePath?: string;
  mergeResult?: MergeResult;
  error?: string;
}

export interface WaveExecutionResult {
  waveIndex: number;
  tracks: TrackPlanData[];
  results: TrackWaveResult[];
  success: boolean;
  durationMs: number;
}

export interface BatchExecutionResult {
  waveResults: WaveExecutionResult[];
  success: boolean;
  totalDurationMs: number;
}

export interface MultiTrackSwarmOrchestratorOptions {
  projectRoot: string;
  maxConcurrentTracks?: number; // default 3
  executionMode?: 'headless' | 'interactive'; // default 'headless'
  targetBranch?: string; // default 'main'
  worktreeManager?: WorktreeIsolationManager | WorktreeManagerLike;
  mergeQueueManager?: MergeQueueManager;
  trackExecutor?: TrackExecutorFn;
  continueOnFailure?: boolean;
  shell?: ShellRunner;
}

export class MultiTrackSwarmOrchestrator extends EventEmitter {
  public readonly projectRoot: string;
  public readonly maxConcurrentTracks: number;
  public readonly executionMode: 'headless' | 'interactive';
  public readonly targetBranch: string;
  public readonly continueOnFailure: boolean;

  private worktreeManager: WorktreeIsolationManager | WorktreeManagerLike;
  private mergeQueueManager: MergeQueueManager;
  private trackExecutor: TrackExecutorFn;
  private shell: ShellRunner;

  constructor(options: MultiTrackSwarmOrchestratorOptions) {
    super();
    this.projectRoot = options.projectRoot;
    this.maxConcurrentTracks = options.maxConcurrentTracks ?? 3;
    this.executionMode = options.executionMode ?? 'headless';
    this.targetBranch = options.targetBranch ?? 'main';
    this.continueOnFailure = options.continueOnFailure ?? false;

    this.shell = options.shell ?? {
      async exec() {
        return { stdout: '', stderr: '', exitCode: 0 };
      },
    };

    this.worktreeManager =
      options.worktreeManager ??
      new WorktreeIsolationManager(this.shell, { skipBinaryCheck: true });

    this.mergeQueueManager =
      options.mergeQueueManager ??
      new MergeQueueManager({
        projectRoot: this.projectRoot,
        targetBranch: this.targetBranch,
        shell: this.shell,
        worktreeManager: this.worktreeManager,
      });

    this.trackExecutor =
      options.trackExecutor ??
      (async (ctx: TrackExecutionContext): Promise<TrackExecutionResult> => ({
        trackId: ctx.track.trackId,
        success: true,
        branch: ctx.branch,
        agentId: ctx.agentId,
        reviewerConvIds: ['reviewer-default'],
      }));
  }

  getMergeQueueManager(): MergeQueueManager {
    return this.mergeQueueManager;
  }

  getWorktreeManager(): WorktreeIsolationManager | WorktreeManagerLike {
    return this.worktreeManager;
  }

  async executeBatch(tracks: TrackPlanData[]): Promise<WaveExecutionResult[]> {
    const batchStartTime = Date.now();
    const waves = ExecutionPlanner.planWaves(tracks);

    this.emit('batch_started', {
      totalTracks: tracks.length,
      totalWaves: waves.length,
      waves,
    });

    const allWaveResults: WaveExecutionResult[] = [];

    for (let waveIndex = 0; waveIndex < waves.length; waveIndex++) {
      const wave = waves[waveIndex];
      const waveStartTime = Date.now();

      this.emit('wave_started', {
        waveIndex,
        tracks: wave,
      });

      // Concurrently run tracks in the wave up to maxConcurrentTracks using isolated worktrees
      const waveTrackResults = await this.executeWaveConcurrently(wave, waveIndex);
      const waveSuccess = waveTrackResults.every((r) => r.success);

      const waveExecutionResult: WaveExecutionResult = {
        waveIndex,
        tracks: wave,
        results: waveTrackResults,
        success: waveSuccess,
        durationMs: Date.now() - waveStartTime,
      };

      this.emit('wave_completed', waveExecutionResult);
      allWaveResults.push(waveExecutionResult);

      if (!waveSuccess && !this.continueOnFailure) {
        break;
      }
    }

    const batchSuccess = allWaveResults.every((w) => w.success);
    const batchResult: BatchExecutionResult = {
      waveResults: allWaveResults,
      success: batchSuccess,
      totalDurationMs: Date.now() - batchStartTime,
    };

    this.emit('batch_completed', batchResult);
    return allWaveResults;
  }

  private async executeWaveConcurrently(
    wave: TrackPlanData[],
    waveIndex: number
  ): Promise<TrackWaveResult[]> {
    if (wave.length === 0) return [];

    const results: TrackWaveResult[] = new Array(wave.length);
    let currentIndex = 0;
    const concurrency = Math.max(1, Math.min(this.maxConcurrentTracks, wave.length));

    // Workers concurrently consume tracks reactively without polling
    const workers = Array.from({ length: concurrency }, async () => {
      while (currentIndex < wave.length) {
        const trackIndex = currentIndex++;
        results[trackIndex] = await this.executeSingleTrack(wave[trackIndex], waveIndex);
      }
    });

    await Promise.all(workers);
    return results;
  }

  private async executeSingleTrack(
    track: TrackPlanData,
    waveIndex: number
  ): Promise<TrackWaveResult> {
    const safeTrackId = track.trackId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const agentId = `agent-${safeTrackId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    let branch = `wt/${agentId}-${safeTrackId}`;
    let worktreePath: string | undefined;

    try {
      // 1. Allocate isolated worktree
      branch = await this.worktreeManager.allocate(agentId, track.trackId);
      if (typeof this.worktreeManager.getWorktreePath === 'function') {
        worktreePath = this.worktreeManager.getWorktreePath(agentId);
      }

      this.emit('track_started', {
        trackId: track.trackId,
        waveIndex,
        branch,
        agentId,
        worktreePath,
      });

      // 2. Execute track logic via trackExecutor
      const execResult = await this.trackExecutor({
        track,
        agentId,
        branch,
        worktreePath,
        projectRoot: this.projectRoot,
        executionMode: this.executionMode,
        targetBranch: this.targetBranch,
      });

      if (!execResult.success) {
        const errorMsg = execResult.error || execResult.output || 'Track execution failed';
        const failedTrackResult: TrackWaveResult = {
          trackId: track.trackId,
          success: false,
          branch,
          agentId,
          worktreePath,
          error: errorMsg,
        };
        this.emit('track_completed', {
          trackId: track.trackId,
          waveIndex,
          success: false,
          result: failedTrackResult,
        });
        return failedTrackResult;
      }

      // 3. Hand completed track to MergeQueueManager for serialized safe integration into targetBranch
      const mergeResult = await this.mergeQueueManager.enqueue({
        trackId: track.trackId,
        branch,
        agentId,
        worktreePath,
        worktreeManager: this.worktreeManager,
        targetBranch: this.targetBranch,
        reviewerConvIds: execResult.reviewerConvIds,
        preMergeVerification: execResult.preMergeVerification,
        commitMessage: execResult.commitMessage,
        authorizerTrailers: execResult.authorizerTrailers,
        mergeCommand: execResult.mergeCommand,
      });

      const completedResult: TrackWaveResult = {
        trackId: track.trackId,
        success: mergeResult.success,
        branch,
        agentId,
        worktreePath,
        mergeResult,
        error: mergeResult.error || (!mergeResult.success ? 'Merge execution failed' : undefined),
      };

      this.emit('track_completed', {
        trackId: track.trackId,
        waveIndex,
        success: completedResult.success,
        result: completedResult,
      });

      return completedResult;
    } catch (err: any) {
      const errorMsg = err?.message || String(err);
      const failedResult: TrackWaveResult = {
        trackId: track.trackId,
        success: false,
        branch,
        agentId,
        worktreePath,
        error: errorMsg,
      };
      this.emit('track_completed', {
        trackId: track.trackId,
        waveIndex,
        success: false,
        result: failedResult,
      });
      return failedResult;
    }
  }

  destroy(): void {
    if (typeof (this.worktreeManager as any).destroy === 'function') {
      (this.worktreeManager as any).destroy();
    }
    this.removeAllListeners();
  }
}
