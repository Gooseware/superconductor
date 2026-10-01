import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  MergeQueueManager,
  type MergeQueueItem,
  type ShellRunner,
} from '../../src/orchestration/merge-queue-manager.js';
import { SwarmAuthorizer } from '../../src/track/swarm-authorizer.js';

describe('MergeQueueManager', () => {
  let mockShell: ShellRunner;
  let execSpy: ReturnType<typeof vi.fn>;
  let mockWorktreeManager: {
    release: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    execSpy = vi.fn().mockResolvedValue({ stdout: 'commit abc1234567', stderr: '', exitCode: 0 });
    mockShell = {
      exec: execSpy as any,
    };
    mockWorktreeManager = {
      release: vi.fn().mockResolvedValue(undefined),
    };
  });

  it('enqueues and executes a single merge item with default trailers', async () => {
    const manager = new MergeQueueManager({
      shell: mockShell,
      worktreeManager: mockWorktreeManager as any,
    });

    const enqueuedEvents: MergeQueueItem[] = [];
    const startedEvents: MergeQueueItem[] = [];
    const completedEvents: any[] = [];

    manager.on('merge_enqueued', (item) => enqueuedEvents.push(item));
    manager.on('merge_started', (item) => startedEvents.push(item));
    manager.on('merge_completed', (result) => completedEvents.push(result));

    const item: MergeQueueItem = {
      trackId: 'track-alpha',
      branch: 'wt/agent1-track-alpha',
      agentId: 'agent1',
      reviewerConvIds: ['rev1', 'rev2'],
    };

    const result = await manager.enqueue(item);

    expect(result.success).toBe(true);
    expect(result.trackId).toBe('track-alpha');
    expect(result.targetBranch).toBe('main');
    expect(enqueuedEvents.length).toBe(1);
    expect(startedEvents.length).toBe(1);
    expect(completedEvents.length).toBe(1);

    // Verify git merge --no-ff command was called
    expect(execSpy).toHaveBeenCalledTimes(1);
    const calledCmd: string = execSpy.mock.calls[0][0];
    expect(calledCmd).toContain("git merge --no-ff 'wt/agent1-track-alpha'");
    expect(calledCmd).toContain('Swarm-Authorized: true | reviewers: rev1,rev2');

    // Verify worktree was re-released
    expect(mockWorktreeManager.release).toHaveBeenCalledWith('agent1');
  });

  it('strictly serializes FIFO queue processing with mutex lock', async () => {
    const manager = new MergeQueueManager({
      shell: mockShell,
      worktreeManager: mockWorktreeManager as any,
    });

    const executionLog: string[] = [];
    let concurrentOperations = 0;
    let maxConcurrencyObserved = 0;

    // Simulate work taking varying amounts of time
    execSpy.mockImplementation(async (cmd: string) => {
      concurrentOperations++;
      maxConcurrencyObserved = Math.max(maxConcurrencyObserved, concurrentOperations);

      const track = cmd.includes('track-1') ? 'track-1' : cmd.includes('track-2') ? 'track-2' : 'track-3';
      executionLog.push(`start-${track}`);
      await new Promise((r) => setTimeout(r, 20));
      executionLog.push(`end-${track}`);

      concurrentOperations--;
      return { stdout: 'commit 1234567', stderr: '', exitCode: 0 };
    });

    const item1: MergeQueueItem = { trackId: 'track-1', branch: 'wt/agent-track-1', agentId: 'agent-1' };
    const item2: MergeQueueItem = { trackId: 'track-2', branch: 'wt/agent-track-2', agentId: 'agent-2' };
    const item3: MergeQueueItem = { trackId: 'track-3', branch: 'wt/agent-track-3', agentId: 'agent-3' };

    // Enqueue all concurrently
    const [res1, res2, res3] = await Promise.all([
      manager.enqueue(item1),
      manager.enqueue(item2),
      manager.enqueue(item3),
    ]);

    expect(res1.success).toBe(true);
    expect(res2.success).toBe(true);
    expect(res3.success).toBe(true);

    // Verify strict serialization: each finishes before the next begins
    expect(executionLog).toEqual([
      'start-track-1',
      'end-track-1',
      'start-track-2',
      'end-track-2',
      'start-track-3',
      'end-track-3',
    ]);
    expect(maxConcurrencyObserved).toBe(1);
  });

  it('runs pre-merge verification and aborts merge on failure without releasing worktree', async () => {
    const manager = new MergeQueueManager({
      shell: mockShell,
      worktreeManager: mockWorktreeManager as any,
    });

    const failedEvents: any[] = [];
    manager.on('merge_failed', (result) => failedEvents.push(result));

    const item: MergeQueueItem = {
      trackId: 'track-failing',
      branch: 'wt/agent-failing',
      agentId: 'agent-failing',
      preMergeVerification: async () => {
        throw new Error('Typecheck failed in pre-merge verification');
      },
    };

    const result = await manager.enqueue(item);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Typecheck failed in pre-merge verification');
    expect(failedEvents.length).toBe(1);
    expect(failedEvents[0].trackId).toBe('track-failing');

    // Merge command should NOT have been executed
    expect(execSpy).not.toHaveBeenCalled();

    // Worktree should NOT be released on failure (preserved for investigation)
    expect(mockWorktreeManager.release).not.toHaveBeenCalled();
  });

  it('continues queue processing after a failed item without deadlocking mutex', async () => {
    const manager = new MergeQueueManager({
      shell: mockShell,
      worktreeManager: mockWorktreeManager as any,
    });

    const item1: MergeQueueItem = {
      trackId: 'track-fail',
      branch: 'wt/fail',
      agentId: 'agent-fail',
      preMergeVerification: async () => false,
    };

    const item2: MergeQueueItem = {
      trackId: 'track-success',
      branch: 'wt/success',
      agentId: 'agent-success',
    };

    const [res1, res2] = await Promise.all([
      manager.enqueue(item1),
      manager.enqueue(item2),
    ]);

    expect(res1.success).toBe(false);
    expect(res2.success).toBe(true);
    expect(mockWorktreeManager.release).toHaveBeenCalledWith('agent-success');
    expect(mockWorktreeManager.release).not.toHaveBeenCalledWith('agent-fail');
  });

  it('supports worktrunk mode via wt step push --no-ff', async () => {
    const manager = new MergeQueueManager({
      shell: mockShell,
      wtBinary: '/custom/bin/wt',
      useWorktrunk: true,
      worktreeManager: mockWorktreeManager as any,
      defaultReviewers: ['revA', 'revB'],
    });

    const item: MergeQueueItem = {
      trackId: 'track-wt',
      branch: 'wt/agent-wt',
      agentId: 'agent-wt',
    };

    const result = await manager.enqueue(item);
    expect(result.success).toBe(true);

    expect(execSpy).toHaveBeenCalledWith(
      expect.stringContaining('"/custom/bin/wt" step push --no-ff')
    );
  });

  it('validates trailer structure using SwarmAuthorizer', async () => {
    const manager = new MergeQueueManager({
      shell: mockShell,
    });

    const item: MergeQueueItem = {
      trackId: 'track-trailer',
      branch: 'wt/agent-trailer',
      reviewerConvIds: ['conv-1', 'conv-2', 'conv-3'],
    };

    await manager.enqueue(item);

    const calledCmd: string = execSpy.mock.calls[0][0];
    const match = calledCmd.match(/Swarm-Authorized:[^']+/);
    expect(match).not.toBeNull();
    const trailer = match![0].trim();
    expect(SwarmAuthorizer.validateTrailer(`placeholder\n\n${trailer}`)).toBe(true);
  });

  it('calls onRelease callback if provided on successful merge', async () => {
    const onReleaseMock = vi.fn().mockResolvedValue(undefined);
    const manager = new MergeQueueManager({
      shell: mockShell,
    });

    const item: MergeQueueItem = {
      trackId: 'track-callback',
      branch: 'wt/branch',
      onRelease: onReleaseMock,
    };

    await manager.enqueue(item);
    expect(onReleaseMock).toHaveBeenCalledTimes(1);
  });

  describe('Security & Command Injection Prevention (SEC-1)', () => {
    it('rejects branch names containing command chaining characters like main; touch /tmp/pwned; #', async () => {
      const manager = new MergeQueueManager({
        shell: mockShell,
      });

      const maliciousBranch = 'main; touch /tmp/pwned; #';
      await expect(
        manager.enqueue({
          trackId: 'track-sec-1',
          branch: maliciousBranch,
        })
      ).rejects.toThrow(/Invalid branch name/);

      expect(execSpy).not.toHaveBeenCalled();
    });

    it('rejects branch names containing command substitution like test $(touch /tmp/pwned)', async () => {
      const manager = new MergeQueueManager({
        shell: mockShell,
      });

      const maliciousBranch = 'test $(touch /tmp/pwned)';
      await expect(
        manager.enqueue({
          trackId: 'track-sec-2',
          branch: maliciousBranch,
        })
      ).rejects.toThrow(/Invalid branch name/);

      expect(execSpy).not.toHaveBeenCalled();
    });

    it('rejects branch names starting with hyphen to prevent option injection', async () => {
      const manager = new MergeQueueManager({
        shell: mockShell,
      });

      await expect(
        manager.enqueue({
          trackId: 'track-sec-3',
          branch: '--upload-pack=evil',
        })
      ).rejects.toThrow(/cannot start with '-'/);

      expect(execSpy).not.toHaveBeenCalled();
    });

    it('safely single-quotes commit messages and branches in merge command', async () => {
      const manager = new MergeQueueManager({
        shell: mockShell,
      });

      const item: MergeQueueItem = {
        trackId: 'track-safe',
        branch: 'wt/safe-branch_1.0',
        commitMessage: "feat: arbitrary; touch /tmp/pwned; $(whoami) 'quoted'",
      };

      await manager.enqueue(item);

      expect(execSpy).toHaveBeenCalledTimes(1);
      const cmd = execSpy.mock.calls[0][0];
      // Verify branch is single quoted
      expect(cmd).toContain("'wt/safe-branch_1.0'");
      // Verify commit message is safely POSIX single-quoted
      expect(cmd).toContain("'feat: arbitrary; touch /tmp/pwned; $(whoami) '\\''quoted'\\''");
    });
  });
});
