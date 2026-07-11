import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GccController } from '../src/safety/gcc';
import { EventStore } from '../src/state/event-store';
import * as child_process from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

vi.mock('child_process', () => ({
  execSync: vi.fn()
}));

describe('Git Context Controller (GCC)', () => {
  let store: EventStore;
  let controller: GccController;
  const testDbPath = path.join(__dirname, 'test-gcc-events.sqlite');

  beforeEach(() => {
    store = new EventStore({ dbPath: testDbPath });
    controller = new GccController(store, '/fake/repo/path');
    vi.clearAllMocks();
  });

  afterEach(() => {
    store.close();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  it('gccBranch(taskId) creates an isolated worktree', () => {
    const taskId = 'task-1';
    controller.gccBranch(taskId);
    
    expect(child_process.execSync).toHaveBeenCalledWith(
      expect.stringContaining(`git worktree add`),
      expect.anything()
    );

    const events = store.query({ taskId, eventType: 'safety' });
    expect(events.length).toBeGreaterThan(0);
    expect((events[0].payload.detail as any).operation).toBe('branch');
  });

  it('gccMerge(taskId) merges worktree back to track branch on success', () => {
    const taskId = 'task-2';
    controller.gccMerge(taskId);
    
    expect(child_process.execSync).toHaveBeenCalledWith(
      expect.stringContaining(`git merge`),
      expect.anything()
    );
    expect(child_process.execSync).toHaveBeenCalledWith(
      expect.stringContaining(`git worktree remove`),
      expect.anything()
    );

    const events = store.query({ taskId, eventType: 'safety' });
    expect((events[events.length - 1].payload.detail as any).operation).toBe('merge');
  });

  it('gccDrop(taskId) cleanly removes worktree and branch on failure', () => {
    const taskId = 'task-3';
    controller.gccDrop(taskId);
    
    expect(child_process.execSync).toHaveBeenCalledWith(
      expect.stringContaining(`git worktree remove --force`),
      expect.anything()
    );
    expect(child_process.execSync).toHaveBeenCalledWith(
      expect.stringContaining(`git branch -D`),
      expect.anything()
    );

    const events = store.query({ taskId, eventType: 'safety' });
    expect((events[events.length - 1].payload.detail as any).operation).toBe('drop');
  });

  it('High-risk tasks (Tier 4) automatically trigger worktree isolation', () => {
    const result = controller.shouldIsolateTask({ tier: 4 } as any);
    expect(result).toBe(true);

    const resultLow = controller.shouldIsolateTask({ tier: 3 } as any);
    expect(resultLow).toBe(false);
  });
});
