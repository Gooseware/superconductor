import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  WorktreeIsolationManager,
  WorktreeAlreadyAllocatedError,
  WorktrunkNotInstalledError,
  InvalidAgentIdError,
  type ShellRunner,
} from './worktree-isolation-manager.js';

describe('WorktreeIsolationManager', () => {
  let mockShell: ShellRunner;
  let execSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    execSpy = vi.fn().mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });
    mockShell = {
      exec: execSpy as any,
    };
  });

  it('missing wt binary throws WorktrunkNotInstalledError', () => {
    expect(() => {
      new WorktreeIsolationManager(mockShell, '/nonexistent/path/to/wt');
    }).toThrow(WorktrunkNotInstalledError);
  });

  it('allocate with mock shell calls wt switch --create <branch> and returns branch', async () => {
    const manager = new WorktreeIsolationManager(mockShell);
    const branch = await manager.allocate('agent-1', 'track-123');

    expect(branch).toBe('wt/agent-1-track-123');
    expect(execSpy).toHaveBeenCalledWith('/home/gooseware/.cargo/bin/wt switch --create wt/agent-1-track-123');
    manager.destroy();
  });

  it('allocate twice with same agentId throws WorktreeAlreadyAllocatedError', async () => {
    const manager = new WorktreeIsolationManager(mockShell);
    await manager.allocate('agent-1', 'track-123');

    await expect(manager.allocate('agent-1', 'track-456')).rejects.toThrow(
      WorktreeAlreadyAllocatedError
    );
    manager.destroy();
  });

  it('allocate with agentId containing ; rm -rf / throws InvalidAgentIdError', async () => {
    const manager = new WorktreeIsolationManager(mockShell);
    await expect(manager.allocate('agent; rm -rf /', 'track-123')).rejects.toThrow(
      InvalidAgentIdError
    );
    manager.destroy();
  });

  it('allocate with agentId containing $(evil) throws InvalidAgentIdError', async () => {
    const manager = new WorktreeIsolationManager(mockShell);
    await expect(manager.allocate('agent-$(evil)', 'track-123')).rejects.toThrow(
      InvalidAgentIdError
    );
    manager.destroy();
  });

  it('allocate sends shell command containing sanitized branch name only', async () => {
    const manager = new WorktreeIsolationManager(mockShell);
    const branch = await manager.allocate('agent_1', 'track/123');
    expect(branch).toBe('wt/agent_1-track/123');
    expect(execSpy).toHaveBeenCalledWith(
      expect.stringContaining('switch --create wt/agent_1-track/123')
    );
    manager.destroy();
  });

  it('release calls wt remove <branch> and clears allocation map', async () => {
    const manager = new WorktreeIsolationManager(mockShell);
    await manager.allocate('agent-1', 'track-123');
    expect(manager.getWorktreePath('agent-1')).toBe('.worktrees/wt/agent-1-track-123');

    await manager.release('agent-1');

    expect(execSpy).toHaveBeenCalledWith('/home/gooseware/.cargo/bin/wt remove wt/agent-1-track-123');
    expect(manager.getWorktreePath('agent-1')).toBeUndefined();
    manager.destroy();
  });

  it('release unknown agentId is a no-op', async () => {
    const manager = new WorktreeIsolationManager(mockShell);
    await manager.release('unknown-agent');

    expect(execSpy).not.toHaveBeenCalled();
    manager.destroy();
  });

  it('releaseAll calls wt remove for each allocated worktree', async () => {
    const manager = new WorktreeIsolationManager(mockShell);
    await manager.allocate('agent-1', 'track-1');
    await manager.allocate('agent-2', 'track-2');

    execSpy.mockClear();
    await manager.releaseAll();

    expect(execSpy).toHaveBeenCalledTimes(2);
    expect(execSpy).toHaveBeenCalledWith('/home/gooseware/.cargo/bin/wt remove wt/agent-1-track-1');
    expect(execSpy).toHaveBeenCalledWith('/home/gooseware/.cargo/bin/wt remove wt/agent-2-track-2');
    expect(manager.getWorktreePath('agent-1')).toBeUndefined();
    expect(manager.getWorktreePath('agent-2')).toBeUndefined();
    manager.destroy();
  });

  it('getWorktreePath returns correct path after allocate and undefined before/after release', async () => {
    const manager = new WorktreeIsolationManager(mockShell);
    expect(manager.getWorktreePath('agent-1')).toBeUndefined();

    await manager.allocate('agent-1', 'track-100');
    expect(manager.getWorktreePath('agent-1')).toBe('.worktrees/wt/agent-1-track-100');

    await manager.release('agent-1');
    expect(manager.getWorktreePath('agent-1')).toBeUndefined();
    manager.destroy();
  });

  it('process SIGINT signal invokes releaseAll', async () => {
    const manager = new WorktreeIsolationManager(mockShell);
    await manager.allocate('agent-1', 'track-sigint');

    execSpy.mockClear();
    process.emit('SIGINT');

    await new Promise((r) => setTimeout(r, 50));

    expect(execSpy).toHaveBeenCalledWith('/home/gooseware/.cargo/bin/wt remove wt/agent-1-track-sigint');
    manager.destroy();
  });

  it('process SIGTERM signal invokes releaseAll', async () => {
    const manager = new WorktreeIsolationManager(mockShell);
    await manager.allocate('agent-2', 'track-sigterm');

    execSpy.mockClear();
    process.emit('SIGTERM');

    await new Promise((r) => setTimeout(r, 50));

    expect(execSpy).toHaveBeenCalledWith('/home/gooseware/.cargo/bin/wt remove wt/agent-2-track-sigterm');
    manager.destroy();
  });
});
