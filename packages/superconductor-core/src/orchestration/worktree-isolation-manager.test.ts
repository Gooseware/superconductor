import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import * as child_process from 'node:child_process';
import {
  WorktreeIsolationManager,
  WorktreeAlreadyAllocatedError,
  WorktrunkNotInstalledError,
  InvalidAgentIdError,
  findWtBinary,
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

  it('falls back cleanly in test environment when default wt binary is missing', () => {
    expect(() => {
      const manager = new WorktreeIsolationManager(mockShell);
      manager.destroy();
    }).not.toThrow();
  });

  it('skips binary existence check when skipBinaryCheck option is true', () => {
    expect(() => {
      const manager = new WorktreeIsolationManager(mockShell, '/arbitrary/missing/wt', {
        skipBinaryCheck: true,
      });
      manager.destroy();
    }).not.toThrow();
  });

  it('throws WorktrunkNotInstalledError outside of test environment when wt binary is missing', () => {
    const origEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'production';
      expect(() => {
        new WorktreeIsolationManager(mockShell, '/nonexistent/path/to/wt');
      }).toThrow(WorktrunkNotInstalledError);
    } finally {
      process.env.NODE_ENV = origEnv;
    }
  });

  it('properly uses mocked fs.existsSync for custom wt binary paths', () => {
    const existsSpy = vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    try {
      expect(() => {
        const manager = new WorktreeIsolationManager(mockShell, '/custom/mock/path/wt');
        manager.destroy();
      }).not.toThrow();
    } finally {
      existsSpy.mockRestore();
    }
  });

  it('quotes wt binary in shell executions to avoid word splitting when path contains spaces', async () => {
    const existsSpy = vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    try {
      const manager = new WorktreeIsolationManager(mockShell, '/opt/custom tools/bin/wt');
      const branch = await manager.allocate('agent-space', 'track-1');
      expect(branch).toBe('wt/agent-space-track-1');
      expect(execSpy).toHaveBeenCalledWith('"/opt/custom tools/bin/wt" switch --create wt/agent-space-track-1');
      await manager.release('agent-space');
      expect(execSpy).toHaveBeenCalledWith('"/opt/custom tools/bin/wt" remove wt/agent-space-track-1');
      manager.destroy();
    } finally {
      existsSpy.mockRestore();
    }
  });

  it('allocate with mock shell calls wt switch --create <branch> and returns branch', async () => {
    const manager = new WorktreeIsolationManager(mockShell);
    const branch = await manager.allocate('agent-1', 'track-123');

    expect(branch).toBe('wt/agent-1-track-123');
    expect(execSpy).toHaveBeenCalledWith(`"${findWtBinary()}" switch --create wt/agent-1-track-123`);
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
    expect(manager.getWorktreePath('agent-1')).toBe(
      path.join(process.cwd(), '.worktrees', 'wt/agent-1-track-123')
    );

    await manager.release('agent-1');

    expect(execSpy).toHaveBeenCalledWith(`"${findWtBinary()}" remove wt/agent-1-track-123`);
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
    expect(execSpy).toHaveBeenCalledWith(`"${findWtBinary()}" remove wt/agent-1-track-1`);
    expect(execSpy).toHaveBeenCalledWith(`"${findWtBinary()}" remove wt/agent-2-track-2`);
    expect(manager.getWorktreePath('agent-1')).toBeUndefined();
    expect(manager.getWorktreePath('agent-2')).toBeUndefined();
    manager.destroy();
  });

  it('getWorktreePath returns correct path after allocate and undefined before/after release', async () => {
    const manager = new WorktreeIsolationManager(mockShell);
    expect(manager.getWorktreePath('agent-1')).toBeUndefined();

    await manager.allocate('agent-1', 'track-100');
    expect(manager.getWorktreePath('agent-1')).toBe(
      path.join(process.cwd(), '.worktrees', 'wt/agent-1-track-100')
    );

    await manager.release('agent-1');
    expect(manager.getWorktreePath('agent-1')).toBeUndefined();
    manager.destroy();
  });

  it('getWorktreePath returns path from wt list --format=json if available', async () => {
    const mockExecSync = vi.fn().mockReturnValue(
      JSON.stringify({
        schema: 2,
        items: [
          {
            branch: 'wt/agent-wt-track-wt',
            worktree: { path: '/custom/worktrees/wt-agent-wt-track-wt' },
          },
        ],
      })
    );
    const manager = new WorktreeIsolationManager(mockShell, {
      execSync: mockExecSync as any,
    });
    await manager.allocate('agent-wt', 'track-wt');

    expect(manager.getWorktreePath('agent-wt')).toBe(
      '/custom/worktrees/wt-agent-wt-track-wt'
    );
    expect(mockExecSync).toHaveBeenCalledWith(
      expect.stringContaining('list --format=json'),
      expect.anything()
    );
    manager.destroy();
  });

  it('getWorktreePath falls back to canonical path if wt list fails or branch not in items', async () => {
    const mockExecSync = vi.fn().mockImplementation(() => {
      throw new Error('wt list failed');
    });
    const manager = new WorktreeIsolationManager(mockShell, {
      execSync: mockExecSync as any,
    });
    await manager.allocate('agent-fallback', 'track-fallback');

    expect(manager.getWorktreePath('agent-fallback')).toBe(
      path.join(process.cwd(), '.worktrees', 'wt/agent-fallback-track-fallback')
    );
    manager.destroy();
  });

  it('getWorktreePath resolves worktree-path from .config/wt.toml when wt list fails', async () => {
    const mockExecSync = vi.fn().mockImplementation(() => {
      throw new Error('wt list failed');
    });
    const manager = new WorktreeIsolationManager(mockShell, {
      execSync: mockExecSync as any,
    });
    await manager.allocate('agent-cfg', 'track-cfg');

    const configPath = path.join(process.cwd(), '.config', 'wt.toml');
    const existsSpy = vi.spyOn(fs, 'existsSync').mockImplementation((p) => {
      if (p === configPath) return true;
      return false;
    });
    const readSpy = vi.spyOn(fs, 'readFileSync').mockImplementation(((p: any) => {
      if (p === configPath) {
        return 'worktree-path = "{{ repo_path }}/custom-trees/{{ branch | sanitize }}"';
      }
      return '';
    }) as any);

    try {
      expect(manager.getWorktreePath('agent-cfg')).toBe(
        `${process.cwd()}/custom-trees/wt-agent-cfg-track-cfg`
      );
    } finally {
      existsSpy.mockRestore();
      readSpy.mockRestore();
      manager.destroy();
    }
  });

  it('allocate creates relative symlink to node_modules if worktree node_modules is missing and root exists', async () => {
    const manager = new WorktreeIsolationManager(mockShell);
    const branch = 'wt/agent-symlink-track-symlink';
    const worktreePath = path.join(process.cwd(), '.worktrees', branch);
    const targetNodeModules = path.join(worktreePath, 'node_modules');
    const rootNodeModules = path.join(process.cwd(), 'node_modules');

    const existsSpy = vi.spyOn(fs, 'existsSync').mockImplementation((p) => {
      const pathStr = p.toString();
      if (pathStr === targetNodeModules) {
        return false;
      }
      if (pathStr === rootNodeModules) {
        return true;
      }
      return true;
    });

    const symlinkSpy = vi.spyOn(fs, 'symlinkSync').mockImplementation(() => {});

    try {
      await manager.allocate('agent-symlink', 'track-symlink');
      const expectedRel = path.relative(worktreePath, rootNodeModules);
      expect(symlinkSpy).toHaveBeenCalledWith(expectedRel, targetNodeModules, 'junction');
    } finally {
      existsSpy.mockRestore();
      symlinkSpy.mockRestore();
      manager.destroy();
    }
  });

  it('allocate does not create symlink if worktree node_modules already exists', async () => {
    const manager = new WorktreeIsolationManager(mockShell);
    const branch = 'wt/agent-existing-track-existing';
    const worktreePath = path.join(process.cwd(), '.worktrees', branch);
    const targetNodeModules = path.join(worktreePath, 'node_modules');

    const existsSpy = vi.spyOn(fs, 'existsSync').mockImplementation((p) => {
      const pathStr = p.toString();
      if (pathStr === targetNodeModules) {
        return true;
      }
      return true;
    });

    const symlinkSpy = vi.spyOn(fs, 'symlinkSync').mockImplementation(() => {});

    try {
      await manager.allocate('agent-existing', 'track-existing');
      expect(symlinkSpy).not.toHaveBeenCalled();
    } finally {
      existsSpy.mockRestore();
      symlinkSpy.mockRestore();
      manager.destroy();
    }
  });

  it('process SIGINT signal invokes releaseAll', async () => {
    const manager = new WorktreeIsolationManager(mockShell);
    await manager.allocate('agent-1', 'track-sigint');

    execSpy.mockClear();
    process.emit('SIGINT');

    await new Promise((r) => setTimeout(r, 50));

    expect(execSpy).toHaveBeenCalledWith(`"${findWtBinary()}" remove wt/agent-1-track-sigint`);
    manager.destroy();
  });

  it('process SIGTERM signal invokes releaseAll', async () => {
    const manager = new WorktreeIsolationManager(mockShell);
    await manager.allocate('agent-2', 'track-sigterm');

    execSpy.mockClear();
    process.emit('SIGTERM');

    await new Promise((r) => setTimeout(r, 50));

    expect(execSpy).toHaveBeenCalledWith(`"${findWtBinary()}" remove wt/agent-2-track-sigterm`);
    manager.destroy();
  });
});
