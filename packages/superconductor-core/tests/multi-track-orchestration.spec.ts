import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as path from 'node:path';
import {
  MultiTrackSwarmOrchestrator,
  type TrackExecutionContext,
  type TrackExecutionResult,
  type WaveExecutionResult,
} from '../src/orchestration/multi-track-orchestrator.js';
import {
  MergeQueueManager,
  type ShellRunner,
} from '../src/orchestration/merge-queue-manager.js';
import {
  WorktreeIsolationManager,
} from '../src/orchestration/worktree-isolation-manager.js';
import type { TrackPlanData } from '../src/track/execution-planner.js';

describe('MultiTrackSwarmOrchestrator Integration Test Suite', () => {
  let mockShell: ShellRunner;
  let shellExecSpy: ReturnType<typeof vi.fn>;
  let commandHistory: string[];

  beforeEach(() => {
    commandHistory = [];
    shellExecSpy = vi.fn().mockImplementation(async (cmd: string) => {
      commandHistory.push(cmd);
      if (cmd.includes('list --format=json')) {
        return { stdout: JSON.stringify({ items: [] }), stderr: '', exitCode: 0 };
      }
      if (cmd.includes('git merge') || cmd.includes('step push')) {
        return { stdout: 'commit 8f9c1a2b3c4d5e6f (HEAD -> main)', stderr: '', exitCode: 0 };
      }
      return { stdout: '', stderr: '', exitCode: 0 };
    });

    mockShell = {
      exec: shellExecSpy,
    };
  });

  describe('3-Track Parallel Wave Execution & Topological Dependency Resolution', () => {
    it('executes 3 independent tracks concurrently in Wave 1 and dependent track in Wave 2', async () => {
      const activeRunningTracks = new Set<string>();
      let maxObservedWave1Concurrency = 0;
      const executionTimeline: { trackId: string; phase: 'start' | 'end'; timestamp: number }[] = [];

      const tracks: TrackPlanData[] = [
        { trackId: 'track-alpha', dependencies: [], benefitScore: 30 },
        { trackId: 'track-beta', dependencies: [], benefitScore: 20 },
        { trackId: 'track-gamma', dependencies: [], benefitScore: 10 },
        { trackId: 'track-delta', dependencies: ['track-alpha', 'track-beta'], benefitScore: 50 },
      ];

      const waveStartedEvents: { waveIndex: number; trackIds: string[] }[] = [];
      const waveCompletedEvents: { waveIndex: number; success: boolean }[] = [];
      const trackStartedEvents: string[] = [];
      const trackCompletedEvents: string[] = [];

      const orchestrator = new MultiTrackSwarmOrchestrator({
        projectRoot: '/test/repo',
        maxConcurrentTracks: 3,
        targetBranch: 'main',
        shell: mockShell,
        trackExecutor: async (ctx: TrackExecutionContext): Promise<TrackExecutionResult> => {
          const tid = ctx.track.trackId;
          executionTimeline.push({ trackId: tid, phase: 'start', timestamp: Date.now() });
          activeRunningTracks.add(tid);

          if (tid !== 'track-delta') {
            maxObservedWave1Concurrency = Math.max(maxObservedWave1Concurrency, activeRunningTracks.size);
          }

          // Simulate async agent TDD / review work
          await new Promise((r) => setTimeout(r, 30));

          activeRunningTracks.delete(tid);
          executionTimeline.push({ trackId: tid, phase: 'end', timestamp: Date.now() });

          return {
            trackId: tid,
            success: true,
            branch: ctx.branch,
            reviewerConvIds: [`reviewer-1-${tid}`, `reviewer-2-${tid}`],
            commitMessage: `feat(${tid}): complete implementation`,
          };
        },
      });

      orchestrator.on('wave_started', (e) => {
        waveStartedEvents.push({ waveIndex: e.waveIndex, trackIds: e.tracks.map((t: TrackPlanData) => t.trackId) });
      });
      orchestrator.on('wave_completed', (e: WaveExecutionResult) => {
        waveCompletedEvents.push({ waveIndex: e.waveIndex, success: e.success });
      });
      orchestrator.on('track_started', (e) => trackStartedEvents.push(e.trackId));
      orchestrator.on('track_completed', (e) => trackCompletedEvents.push(e.trackId));

      const waveResults = await orchestrator.executeBatch(tracks);

      // Verify Waves partitioning
      expect(waveResults.length).toBe(2);

      // Wave 1: [track-alpha, track-beta, track-gamma] executed concurrently
      const wave1 = waveResults[0];
      expect(wave1.waveIndex).toBe(0);
      expect(wave1.tracks.map((t) => t.trackId)).toEqual(['track-alpha', 'track-beta', 'track-gamma']);
      expect(wave1.results.length).toBe(3);
      expect(wave1.success).toBe(true);

      // Wave 2: [track-delta] executed after Wave 1 completes
      const wave2 = waveResults[1];
      expect(wave2.waveIndex).toBe(1);
      expect(wave2.tracks.map((t) => t.trackId)).toEqual(['track-delta']);
      expect(wave2.results.length).toBe(1);
      expect(wave2.success).toBe(true);

      // Concurrency verification: Wave 1 achieved concurrency of 3
      expect(maxObservedWave1Concurrency).toBe(3);

      // Strict sequential wave execution: track-delta start MUST be after all Wave 1 tracks end
      const wave1EndTimestamps = executionTimeline
        .filter((e) => e.trackId !== 'track-delta' && e.phase === 'end')
        .map((e) => e.timestamp);
      const trackDeltaStart = executionTimeline.find((e) => e.trackId === 'track-delta' && e.phase === 'start')!;

      expect(wave1EndTimestamps.length).toBe(3);
      expect(trackDeltaStart).toBeDefined();
      for (const w1End of wave1EndTimestamps) {
        expect(trackDeltaStart.timestamp).toBeGreaterThanOrEqual(w1End);
      }

      // Event verification
      expect(waveStartedEvents).toEqual([
        { waveIndex: 0, trackIds: ['track-alpha', 'track-beta', 'track-gamma'] },
        { waveIndex: 1, trackIds: ['track-delta'] },
      ]);
      expect(waveCompletedEvents).toEqual([
        { waveIndex: 0, success: true },
        { waveIndex: 1, success: true },
      ]);
      expect(trackStartedEvents).toEqual(['track-alpha', 'track-beta', 'track-gamma', 'track-delta']);
      expect(trackCompletedEvents).toEqual(['track-alpha', 'track-beta', 'track-gamma', 'track-delta']);

      orchestrator.destroy();
    });
  });

  describe('Concurrency and Mutex Isolation', () => {
    it('creates unique, isolated worktree allocations per track without cross-contamination', async () => {
      const allocatedPaths = new Map<string, string>();
      const allocatedBranches = new Map<string, string>();

      const tracks: TrackPlanData[] = [
        { trackId: 'track-worker-1', dependencies: [], benefitScore: 10 },
        { trackId: 'track-worker-2', dependencies: [], benefitScore: 10 },
        { trackId: 'track-worker-3', dependencies: [], benefitScore: 10 },
      ];

      const orchestrator = new MultiTrackSwarmOrchestrator({
        projectRoot: '/test/repo',
        maxConcurrentTracks: 3,
        shell: mockShell,
        trackExecutor: async (ctx: TrackExecutionContext): Promise<TrackExecutionResult> => {
          allocatedPaths.set(ctx.track.trackId, ctx.worktreePath || '');
          allocatedBranches.set(ctx.track.trackId, ctx.branch);

          // Verify path and branch are namespaced properly
          expect(ctx.branch).toContain(ctx.track.trackId);
          expect(ctx.worktreePath).toBeDefined();

          return {
            trackId: ctx.track.trackId,
            success: true,
            branch: ctx.branch,
          };
        },
      });

      await orchestrator.executeBatch(tracks);

      // Verify all branches and paths are unique (no collisions / cross-contamination)
      const pathSet = new Set(allocatedPaths.values());
      const branchSet = new Set(allocatedBranches.values());

      expect(pathSet.size).toBe(3);
      expect(branchSet.size).toBe(3);

      orchestrator.destroy();
    });

    it('processes merges strictly one at a time via FIFO mutex lock on targetBranch', async () => {
      let concurrentMerges = 0;
      let maxConcurrentMerges = 0;
      const mergeHistory: { trackId: string; start: number; end: number }[] = [];

      // Intercept merge commands in mockShell
      shellExecSpy.mockImplementation(async (cmd: string) => {
        if (cmd.includes('git merge') || cmd.includes('step push')) {
          concurrentMerges++;
          maxConcurrentMerges = Math.max(maxConcurrentMerges, concurrentMerges);
          const start = Date.now();

          // Match which track is being merged
          const match = cmd.match(/track-[a-z0-9-]+/);
          const trackId = match ? match[0] : 'unknown';

          // Simulate merge I/O delay
          await new Promise((r) => setTimeout(r, 25));

          const end = Date.now();
          mergeHistory.push({ trackId, start, end });
          concurrentMerges--;
          return { stdout: 'commit 12345678', stderr: '', exitCode: 0 };
        }
        return { stdout: '', stderr: '', exitCode: 0 };
      });

      const tracks: TrackPlanData[] = [
        { trackId: 'track-concurrent-1', dependencies: [], benefitScore: 30 },
        { trackId: 'track-concurrent-2', dependencies: [], benefitScore: 20 },
        { trackId: 'track-concurrent-3', dependencies: [], benefitScore: 10 },
      ];

      const orchestrator = new MultiTrackSwarmOrchestrator({
        projectRoot: '/test/repo',
        maxConcurrentTracks: 3,
        shell: mockShell,
        trackExecutor: async (ctx: TrackExecutionContext): Promise<TrackExecutionResult> => {
          // Finish tracks at almost the exact same instant to force merge contention
          await new Promise((r) => setTimeout(r, 10));
          return {
            trackId: ctx.track.trackId,
            success: true,
            branch: ctx.branch,
            reviewerConvIds: ['reviewer-alpha', 'reviewer-beta'],
          };
        },
      });

      const results = await orchestrator.executeBatch(tracks);

      expect(results[0].results.length).toBe(3);
      expect(results[0].results.every((r) => r.success)).toBe(true);

      // Mutex guarantee: At no point should concurrent merges exceed 1
      expect(maxConcurrentMerges).toBe(1);
      expect(mergeHistory.length).toBe(3);

      // Verify each merge finished before the subsequent merge began
      for (let i = 1; i < mergeHistory.length; i++) {
        expect(mergeHistory[i].start).toBeGreaterThanOrEqual(mergeHistory[i - 1].end);
      }

      orchestrator.destroy();
    });
  });

  describe('Failure Propagation vs Continue-on-Failure', () => {
    it('aborts subsequent waves when a track fails in Wave 1 and continueOnFailure is false', async () => {
      const executedTracks: string[] = [];

      const tracks: TrackPlanData[] = [
        { trackId: 'track-fail-w1', dependencies: [], benefitScore: 20 },
        { trackId: 'track-pass-w1', dependencies: [], benefitScore: 10 },
        { trackId: 'track-dependent-w2', dependencies: ['track-pass-w1'], benefitScore: 30 },
      ];

      const orchestrator = new MultiTrackSwarmOrchestrator({
        projectRoot: '/test/repo',
        continueOnFailure: false,
        shell: mockShell,
        trackExecutor: async (ctx: TrackExecutionContext): Promise<TrackExecutionResult> => {
          executedTracks.push(ctx.track.trackId);
          if (ctx.track.trackId === 'track-fail-w1') {
            return {
              trackId: ctx.track.trackId,
              success: false,
              error: 'Syntax error during compilation',
            };
          }
          return {
            trackId: ctx.track.trackId,
            success: true,
            branch: ctx.branch,
          };
        },
      });

      const waveResults = await orchestrator.executeBatch(tracks);

      // Only Wave 0 ran; Wave 1 was halted
      expect(waveResults.length).toBe(1);
      expect(waveResults[0].success).toBe(false);
      expect(executedTracks).toContain('track-fail-w1');
      expect(executedTracks).not.toContain('track-dependent-w2');

      orchestrator.destroy();
    });

    it('proceeds to subsequent waves when continueOnFailure is true despite track failure', async () => {
      const executedTracks: string[] = [];

      const tracks: TrackPlanData[] = [
        { trackId: 'track-fail-w1', dependencies: [], benefitScore: 20 },
        { trackId: 'track-pass-w1', dependencies: [], benefitScore: 10 },
        { trackId: 'track-w2', dependencies: ['track-pass-w1'], benefitScore: 30 },
      ];

      const orchestrator = new MultiTrackSwarmOrchestrator({
        projectRoot: '/test/repo',
        continueOnFailure: true, // Non-fatal continuation
        shell: mockShell,
        trackExecutor: async (ctx: TrackExecutionContext): Promise<TrackExecutionResult> => {
          executedTracks.push(ctx.track.trackId);
          if (ctx.track.trackId === 'track-fail-w1') {
            return {
              trackId: ctx.track.trackId,
              success: false,
              error: 'Test suite failure in track-fail-w1',
            };
          }
          return {
            trackId: ctx.track.trackId,
            success: true,
            branch: ctx.branch,
          };
        },
      });

      const waveResults = await orchestrator.executeBatch(tracks);

      // Both Wave 0 and Wave 1 were executed
      expect(waveResults.length).toBe(2);
      expect(waveResults[0].success).toBe(false); // Wave 0 had 1 failure
      expect(waveResults[1].success).toBe(true); // Wave 1 succeeded
      expect(executedTracks).toContain('track-fail-w1');
      expect(executedTracks).toContain('track-pass-w1');
      expect(executedTracks).toContain('track-w2');

      orchestrator.destroy();
    });

    it('handles pre-merge verification failure cleanly in wave execution', async () => {
      const tracks: TrackPlanData[] = [
        { trackId: 'track-lint-fail', dependencies: [], benefitScore: 10 },
      ];

      const orchestrator = new MultiTrackSwarmOrchestrator({
        projectRoot: '/test/repo',
        shell: mockShell,
        trackExecutor: async (ctx: TrackExecutionContext): Promise<TrackExecutionResult> => {
          return {
            trackId: ctx.track.trackId,
            success: true,
            branch: ctx.branch,
            preMergeVerification: async () => {
              throw new Error('Lint errors detected prior to merge');
            },
          };
        },
      });

      const waveResults = await orchestrator.executeBatch(tracks);

      expect(waveResults.length).toBe(1);
      expect(waveResults[0].success).toBe(false);
      expect(waveResults[0].results[0].success).toBe(false);
      expect(waveResults[0].results[0].error).toContain('Lint errors detected prior to merge');

      orchestrator.destroy();
    });
  });

  describe('Zero-Leakage Cleanup & Resource Lifecycle', () => {
    it('cleanly releases worktrees and clears allocations after successful merges', async () => {
      const activeAgents: string[] = [];

      const tracks: TrackPlanData[] = [
        { trackId: 'track-clean-1', dependencies: [], benefitScore: 20 },
        { trackId: 'track-clean-2', dependencies: [], benefitScore: 10 },
      ];

      const orchestrator = new MultiTrackSwarmOrchestrator({
        projectRoot: '/test/repo',
        shell: mockShell,
        trackExecutor: async (ctx: TrackExecutionContext): Promise<TrackExecutionResult> => {
          activeAgents.push(ctx.agentId);
          // Verify worktree path exists during execution
          const pathBeforeRelease = orchestrator.getWorktreeManager().getWorktreePath?.(ctx.agentId);
          expect(pathBeforeRelease).toBeDefined();

          return {
            trackId: ctx.track.trackId,
            success: true,
            branch: ctx.branch,
          };
        },
      });

      const results = await orchestrator.executeBatch(tracks);

      expect(results[0].results.every((r) => r.success)).toBe(true);
      expect(activeAgents.length).toBe(2);

      // Verify that after merge, worktrees for these agents are released
      const worktreeManager = orchestrator.getWorktreeManager();
      for (const agentId of activeAgents) {
        const pathAfterRelease = worktreeManager.getWorktreePath?.(agentId);
        expect(pathAfterRelease).toBeUndefined();
      }

      // Verify wt remove commands were called for all allocated branches
      const removeCommands = commandHistory.filter((cmd) => cmd.includes('remove wt/'));
      expect(removeCommands.length).toBe(2);

      orchestrator.destroy();
    });

    it('cleans up all event listeners and background handlers on orchestrator.destroy()', () => {
      const orchestrator = new MultiTrackSwarmOrchestrator({
        projectRoot: '/test/repo',
        shell: mockShell,
      });

      orchestrator.on('batch_started', () => {});
      orchestrator.on('wave_started', () => {});
      orchestrator.on('track_completed', () => {});

      expect(orchestrator.listenerCount('batch_started')).toBe(1);
      expect(orchestrator.listenerCount('wave_started')).toBe(1);

      orchestrator.destroy();

      expect(orchestrator.listenerCount('batch_started')).toBe(0);
      expect(orchestrator.listenerCount('wave_started')).toBe(0);
      expect(orchestrator.listenerCount('track_completed')).toBe(0);
    });
  });
});
