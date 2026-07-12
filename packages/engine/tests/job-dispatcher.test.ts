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
