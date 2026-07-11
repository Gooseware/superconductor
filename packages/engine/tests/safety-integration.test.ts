import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventStore } from '../src/state/event-store.js';
import { GccController } from '../src/safety/gcc.js';
import { RiskMiddleware } from '../src/safety/risk-middleware.js';
import * as child_process from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

vi.mock('child_process', () => ({
  execSync: vi.fn()
}));

describe('State & Safety Integration Pipeline', () => {
  let store: EventStore;
  let gcc: GccController;
  let risk: RiskMiddleware;
  const testDbPath = path.join(__dirname, 'integration-events.sqlite');

  beforeEach(() => {
    store = new EventStore({ dbPath: testDbPath });
    gcc = new GccController(store, '/fake/repo/path');
    risk = new RiskMiddleware();
    vi.clearAllMocks();
  });

  afterEach(() => {
    store.close();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  it('Full task lifecycle with events persisted to SQLite', () => {
    store.append({ type: 'scheduler', timestamp: Date.now(), detail: { action: 'start', taskId: 'int-task-1' } } as any);
    
    const riskCheck = risk.evaluate({ type: 'command', command: 'npm test' });
    expect(riskCheck.action).toBe('auto-approve');
    
    store.append({ type: 'scheduler', timestamp: Date.now(), detail: { action: 'end', taskId: 'int-task-1' } } as any);

    const events = store.query({ taskId: 'int-task-1' });
    expect(events.length).toBe(2);
    expect((events[0].payload.detail as any).action).toBe('start');
    expect((events[1].payload.detail as any).action).toBe('end');
  });

  it('High-risk task triggers GCC worktree -> succeeds -> merges back', () => {
    const task = { id: 'int-task-high', status: 'pending', prompt: 'test', tier: 4 };
    
    const shouldIsolate = gcc.shouldIsolateTask(task as any);
    expect(shouldIsolate).toBe(true);

    gcc.gccBranch(task.id);
    expect(child_process.execSync).toHaveBeenCalledWith(
      expect.stringContaining(`git worktree add`),
      expect.anything()
    );

    gcc.gccMerge(task.id);
    expect(child_process.execSync).toHaveBeenCalledWith(
      expect.stringContaining(`git merge`),
      expect.anything()
    );

    const events = store.query({ taskId: task.id, eventType: 'safety' });
    expect(events.length).toBe(2);
    expect((events[0].payload.detail as any).operation).toBe('branch');
    expect((events[1].payload.detail as any).operation).toBe('merge');
  });

  it('Risk middleware blocks destructive command during pipeline execution', () => {
    const riskCheck = risk.evaluate({ type: 'command', command: 'cat /etc/passwd' });
    expect(riskCheck.action).toBe('block');

    const rmCheck = risk.evaluate({ type: 'command', command: 'rm -rf /*' });
    expect(rmCheck.action).toBe('require-approval');
  });
});
