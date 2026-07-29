import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { JobDispatcher } from '../src/dispatcher/job-dispatcher.js';
import { BacklogParser } from '../src/dispatcher/backlog-parser.js';
import { TaskLockManager } from '../src/concurrency/lock-manager.js';
import { WorkerPoolManager } from '../src/concurrency/worker-pool.js';
import * as fs from 'fs';
import * as cp from 'child_process';
import { EventEmitter } from 'events';

vi.mock('fs');
vi.mock('child_process');

describe('JobDispatcher', () => {
  let dispatcher: JobDispatcher;
  
  beforeEach(() => {
    vi.clearAllMocks();
    dispatcher = new JobDispatcher();
    
    // Mock BacklogParser
    vi.spyOn(BacklogParser.prototype, 'extractPendingItems').mockReturnValue([
      { title: 'Test Job', id: 'TEST-123' }
    ]);
    
    // Mock TaskLockManager
    vi.spyOn(TaskLockManager.prototype, 'acquireLock').mockResolvedValue(true);
    vi.spyOn(TaskLockManager.prototype, 'releaseLock').mockResolvedValue();
    
    // Mock WorkerPoolManager
    vi.spyOn(WorkerPoolManager.prototype, 'acquireWorker').mockReturnValue({
      workerId: 'worker_0',
      workspacePath: '/mock/workspace/worker_0'
    });
    vi.spyOn(WorkerPoolManager.prototype, 'releaseWorker').mockReturnValue();
    vi.spyOn(WorkerPoolManager.prototype, 'updateProgress').mockReturnValue();
    vi.spyOn(WorkerPoolManager.prototype, 'getOrphanedLocks').mockReturnValue([]);
    
    // Mock fs
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('mock backlog content');
    
    // Mock child_process.spawn
    const mockChildProcess = new EventEmitter() as cp.ChildProcess;
    vi.mocked(cp.spawn).mockReturnValue(mockChildProcess);
    
    // Auto-close the mock child process
    setTimeout(() => {
      mockChildProcess.emit('close', 0);
    }, 10);
  });
  
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should claim an item, acquire a worker, and invoke the agent', async () => {
    vi.mocked(cp.execSync).mockReturnValue(Buffer.from(''));
    const trackId = await dispatcher.dispatchNextJob('/mock/backlog.md');
    
    // Should return the track id
    expect(trackId).toMatch(/^test_job_\d+$/);

    // Should checkout branch in worker
    expect(cp.execSync).toHaveBeenCalledWith(
      expect.stringContaining('git checkout -b track/test_job_'),
      expect.any(Object)
    );

    // Should start the agent
    expect(cp.spawn).toHaveBeenCalledWith(
      'agy',
      expect.arrayContaining(['--new-project', '--prompt-interactive', expect.stringContaining('Test Job')]),
      expect.any(Object)
    );
  });

  it('should handle acquireWorker failure and release locks correctly', async () => {
    vi.mocked(WorkerPoolManager.prototype.acquireWorker).mockImplementationOnce(() => {
      throw new Error('No workers available');
    });

    await expect(dispatcher.dispatchNextJob('/mock/backlog.md')).rejects.toThrow('No workers available');

    // The lock manager should have released the lock
    expect(TaskLockManager.prototype.releaseLock).toHaveBeenCalled();
  });

  it('should handle setupTrackWorkspace checkout failure and release locks and worker correctly', async () => {
    vi.mocked(cp.execSync).mockImplementation(() => {
      throw new Error('Git checkout failed');
    });

    await expect(dispatcher.dispatchNextJob('/mock/backlog.md')).rejects.toThrow('Git checkout failed');

    expect(WorkerPoolManager.prototype.releaseWorker).toHaveBeenCalledWith('worker_0');
    expect(TaskLockManager.prototype.releaseLock).toHaveBeenCalledWith(expect.any(String), expect.any(String));
  });

  it('should fallback to normal git checkout if branch creation fails without releasing worker', async () => {
    let callCount = 0;
    vi.mocked(cp.execSync).mockImplementation((cmd) => {
      if (cmd.toString().includes('git checkout -b') && callCount === 0) {
        callCount++;
        throw new Error('Branch already exists');
      }
      return Buffer.from('');
    });

    const trackId = await dispatcher.dispatchNextJob('/mock/backlog.md');
    expect(trackId).toBeTruthy();
    // Worker and lock should not be released because the job is running
    expect(WorkerPoolManager.prototype.releaseWorker).not.toHaveBeenCalled();
    expect(TaskLockManager.prototype.releaseLock).not.toHaveBeenCalled();
  });

  it('should mark a job as completed', () => {
    (fs.existsSync as any).mockReturnValue(true);
    (fs.readFileSync as any).mockReturnValue('- [ ] Feature: Test');
    vi.spyOn(BacklogParser.prototype, 'markItemAsDone').mockReturnValue('- [x] Feature: Test');

    dispatcher.completeJob('superconductor/backlog.md', 'Feature: Test');

    expect(fs.writeFileSync).toHaveBeenCalledWith(
      'superconductor/backlog.md',
      '- [x] Feature: Test',
      'utf8'
    );
  });
});
