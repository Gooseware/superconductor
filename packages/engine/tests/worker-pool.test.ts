import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WorkerPoolManager } from '../src/concurrency/worker-pool.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as cp from 'child_process';

vi.mock('fs');
vi.mock('child_process');
vi.mock('os');

describe('WorkerPoolManager', () => {
  let poolManager: WorkerPoolManager;
  let mockWorkspacesDir: string;

  beforeEach(() => {
    vi.clearAllMocks();
    mockWorkspacesDir = '/mock/homedir/.gemini/superconductor/workspaces';
    vi.mocked(os.homedir).mockReturnValue('/mock/homedir');
    
    // Simulate directory existence
    vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
      const pStr = p.toString();
      if (pStr === mockWorkspacesDir) return true;
      return false;
    });

    poolManager = new WorkerPoolManager('/mock/origin');
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('should acquire a new worker when pool is empty', () => {
    vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
      if (p.toString() === mockWorkspacesDir) return true;
      return false;
    });

    const acquisition = poolManager.acquireWorker('track_123');
    expect(acquisition.workerId).toBe('worker_0');
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('worker_0.lock'),
      expect.stringContaining('"track_id": "track_123"'),
      'utf8'
    );
    // Should clone since worker_0 directory doesn't exist
    expect(cp.execSync).toHaveBeenCalledWith(
      expect.stringContaining('git clone /mock/origin'),
      expect.any(Object)
    );
  });

  it('should reuse an existing free worker and clean it', () => {
    // Make worker_0.lock absent, but worker_0 directory present
    vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
      const pStr = p.toString();
      if (pStr === mockWorkspacesDir) return true;
      if (pStr.endsWith('worker_0')) return true; // Directory exists
      if (pStr.endsWith('worker_0.lock')) return false; // Lock does not exist
      return false;
    });

    const acquisition = poolManager.acquireWorker('track_123');
    expect(acquisition.workerId).toBe('worker_0');
    
    // Should clean instead of clone
    expect(cp.execSync).toHaveBeenCalledWith(
      expect.stringContaining('git fetch origin'),
      expect.any(Object)
    );
    expect(cp.execSync).toHaveBeenCalledWith(
      expect.stringContaining('git reset --hard origin/main'),
      expect.any(Object)
    );
    expect(cp.execSync).toHaveBeenCalledWith(
      expect.stringContaining('git clean -fdx'),
      expect.any(Object)
    );
  });

  it('should identify orphaned locks and reuse them', () => {
    vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
      const pStr = p.toString();
      if (pStr === mockWorkspacesDir) return true;
      if (pStr.endsWith('worker_0.lock')) return true; // Lock exists
      return false;
    });

    vi.mocked(fs.readFileSync).mockImplementation((p: fs.PathLike) => {
      if (p.toString().endsWith('worker_0.lock')) {
        return JSON.stringify({
          track_id: 'orphaned_track',
          pid: 999999,
          timestamp: new Date().toISOString(),
          progress: 'dead'
        });
      }
      return '';
    });

    // Mock process.kill to throw, meaning process 999999 doesn't exist
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => {
      throw new Error('ESRCH');
    });

    const acquisition = poolManager.acquireWorker('track_456');
    expect(acquisition.workerId).toBe('worker_0');
    
    expect(fs.unlinkSync).toHaveBeenCalledWith(expect.stringContaining('worker_0.lock'));
    
    killSpy.mockRestore();
  });
});
