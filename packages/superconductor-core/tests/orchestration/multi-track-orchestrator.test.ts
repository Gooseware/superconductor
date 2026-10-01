import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  MultiTrackSwarmOrchestrator,
  type TrackExecutionContext,
  type TrackExecutionResult,
} from '../../src/orchestration/multi-track-orchestrator.js';
import { MergeQueueManager } from '../../src/orchestration/merge-queue-manager.js';
import type { TrackPlanData } from '../../src/track/execution-planner.js';

describe('MultiTrackSwarmOrchestrator', () => {
  let mockShell: any;
  let mockWorktreeManager: any;
  let mockMergeQueueManager: any;
  let allocatedWorktrees: Map<string, string>;

  beforeEach(() => {
    allocatedWorktrees = new Map();
    mockShell = {
      exec: vi.fn().mockResolvedValue({ stdout: 'sha-mock', stderr: '', exitCode: 0 }),
    };

    mockWorktreeManager = {
      allocate: vi.fn().mockImplementation(async (agentId: string, trackId: string) => {
        const branch = `wt/${agentId}-${trackId}`;
        allocatedWorktrees.set(agentId, branch);
        return branch;
      }),
      release: vi.fn().mockImplementation(async (agentId: string) => {
        allocatedWorktrees.delete(agentId);
      }),
      getWorktreePath: vi.fn().mockImplementation((agentId: string) => {
        return `.worktrees/wt/${agentId}`;
      }),
      destroy: vi.fn(),
    };

    mockMergeQueueManager = new MergeQueueManager({
      shell: mockShell,
      worktreeManager: mockWorktreeManager,
    });
  });

  it('partitions tracks into waves and iterates waves sequentially', async () => {
    const executedTracks: string[] = [];
    const waveStartEvents: number[] = [];
    const waveCompleteEvents: number[] = [];

    const tracks: TrackPlanData[] = [
      { trackId: 'T1', dependencies: [], benefitScore: 10 },
      { trackId: 'T2', dependencies: ['T1'], benefitScore: 20 },
      { trackId: 'T3', dependencies: ['T2'], benefitScore: 30 },
    ];

    const orchestrator = new MultiTrackSwarmOrchestrator({
      projectRoot: '/mock/project',
      worktreeManager: mockWorktreeManager,
      mergeQueueManager: mockMergeQueueManager,
      trackExecutor: async (ctx: TrackExecutionContext): Promise<TrackExecutionResult> => {
        executedTracks.push(ctx.track.trackId);
        return {
          trackId: ctx.track.trackId,
          success: true,
          branch: ctx.branch,
          reviewerConvIds: ['rev-1', 'rev-2'],
        };
      },
    });

    orchestrator.on('wave_started', (e) => waveStartEvents.push(e.waveIndex));
    orchestrator.on('wave_completed', (e) => waveCompleteEvents.push(e.waveIndex));

    const results = await orchestrator.executeBatch(tracks);

    expect(results.length).toBe(3); // 3 sequential waves: [T1], [T2], [T3]
    expect(executedTracks).toEqual(['T1', 'T2', 'T3']);
    expect(waveStartEvents).toEqual([0, 1, 2]);
    expect(waveCompleteEvents).toEqual([0, 1, 2]);

    expect(results[0].tracks.map((t) => t.trackId)).toEqual(['T1']);
    expect(results[1].tracks.map((t) => t.trackId)).toEqual(['T2']);
    expect(results[2].tracks.map((t) => t.trackId)).toEqual(['T3']);

    expect(results.every((w) => w.success)).toBe(true);
    orchestrator.destroy();
  });

  it('strictly caps concurrency within a wave to maxConcurrentTracks', async () => {
    let concurrentTracks = 0;
    let maxObservedConcurrency = 0;

    // 5 independent tracks in the same wave
    const tracks: TrackPlanData[] = [
      { trackId: 'T1', dependencies: [], benefitScore: 10 },
      { trackId: 'T2', dependencies: [], benefitScore: 10 },
      { trackId: 'T3', dependencies: [], benefitScore: 10 },
      { trackId: 'T4', dependencies: [], benefitScore: 10 },
      { trackId: 'T5', dependencies: [], benefitScore: 10 },
    ];

    const orchestrator = new MultiTrackSwarmOrchestrator({
      projectRoot: '/mock/project',
      maxConcurrentTracks: 2, // Concurrency limit
      worktreeManager: mockWorktreeManager,
      mergeQueueManager: mockMergeQueueManager,
      trackExecutor: async (ctx: TrackExecutionContext): Promise<TrackExecutionResult> => {
        concurrentTracks++;
        maxObservedConcurrency = Math.max(maxObservedConcurrency, concurrentTracks);

        // Simulate async track processing
        await new Promise((r) => setTimeout(r, 25));

        concurrentTracks--;
        return {
          trackId: ctx.track.trackId,
          success: true,
          branch: ctx.branch,
          reviewerConvIds: ['reviewer-a'],
        };
      },
    });

    const results = await orchestrator.executeBatch(tracks);

    expect(results.length).toBe(1); // 1 single wave containing all 5 tracks
    expect(results[0].tracks.length).toBe(5);
    expect(results[0].results.length).toBe(5);
    expect(results[0].results.every((r) => r.success)).toBe(true);

    // Max concurrent tracks running at any instant must never exceed 2
    expect(maxObservedConcurrency).toBe(2);
    orchestrator.destroy();
  });

  it('allocates isolated worktrees and hands completed tracks to MergeQueueManager', async () => {
    const enqueueSpy = vi.spyOn(mockMergeQueueManager, 'enqueue');

    const tracks: TrackPlanData[] = [
      { trackId: 'T-Alpha', dependencies: [], benefitScore: 50 },
      { trackId: 'T-Beta', dependencies: [], benefitScore: 30 },
    ];

    const orchestrator = new MultiTrackSwarmOrchestrator({
      projectRoot: '/mock/project',
      targetBranch: 'main',
      worktreeManager: mockWorktreeManager,
      mergeQueueManager: mockMergeQueueManager,
      trackExecutor: async (ctx: TrackExecutionContext): Promise<TrackExecutionResult> => {
        expect(ctx.branch).toContain(ctx.track.trackId);
        expect(ctx.worktreePath).toBeDefined();
        return {
          trackId: ctx.track.trackId,
          success: true,
          branch: ctx.branch,
          reviewerConvIds: ['rev-alpha', 'rev-beta'],
        };
      },
    });

    const results = await orchestrator.executeBatch(tracks);

    expect(results[0].results.length).toBe(2);
    expect(enqueueSpy).toHaveBeenCalledTimes(2);

    // Verify merge queue received correct target branch and authorizer trailers
    const firstCallArg = enqueueSpy.mock.calls[0][0];
    expect(firstCallArg.targetBranch).toBe('main');
    expect(firstCallArg.reviewerConvIds).toEqual(['rev-alpha', 'rev-beta']);

    // Check worktrees were released after successful merge
    expect(mockWorktreeManager.release).toHaveBeenCalledTimes(2);
    orchestrator.destroy();
  });

  it('stops subsequent waves on wave failure when continueOnFailure is false', async () => {
    const tracks: TrackPlanData[] = [
      { trackId: 'T-Failing', dependencies: [], benefitScore: 10 },
      { trackId: 'T-ShouldNotRun', dependencies: ['T-Failing'], benefitScore: 10 },
    ];

    const executed: string[] = [];

    const orchestrator = new MultiTrackSwarmOrchestrator({
      projectRoot: '/mock/project',
      continueOnFailure: false,
      worktreeManager: mockWorktreeManager,
      mergeQueueManager: mockMergeQueueManager,
      trackExecutor: async (ctx: TrackExecutionContext): Promise<TrackExecutionResult> => {
        executed.push(ctx.track.trackId);
        if (ctx.track.trackId === 'T-Failing') {
          return { trackId: ctx.track.trackId, success: false, error: 'Compilation error' };
        }
        return { trackId: ctx.track.trackId, success: true };
      },
    });

    const results = await orchestrator.executeBatch(tracks);

    // Wave 0 failed, so Wave 1 was aborted
    expect(results.length).toBe(1);
    expect(results[0].success).toBe(false);
    expect(executed).toEqual(['T-Failing']);
    orchestrator.destroy();
  });

  it('emits all lifecycle events in order: batch, wave, track', async () => {
    const events: string[] = [];

    const tracks: TrackPlanData[] = [
      { trackId: 'Track-A', dependencies: [], benefitScore: 10 },
    ];

    const orchestrator = new MultiTrackSwarmOrchestrator({
      projectRoot: '/mock/project',
      worktreeManager: mockWorktreeManager,
      mergeQueueManager: mockMergeQueueManager,
    });

    orchestrator.on('batch_started', () => events.push('batch_started'));
    orchestrator.on('wave_started', () => events.push('wave_started'));
    orchestrator.on('track_started', () => events.push('track_started'));
    orchestrator.on('track_completed', () => events.push('track_completed'));
    orchestrator.on('wave_completed', () => events.push('wave_completed'));
    orchestrator.on('batch_completed', () => events.push('batch_completed'));

    await orchestrator.executeBatch(tracks);

    expect(events).toEqual([
      'batch_started',
      'wave_started',
      'track_started',
      'track_completed',
      'wave_completed',
      'batch_completed',
    ]);
    orchestrator.destroy();
  });
});
