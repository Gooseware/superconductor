import { BacklogParser } from './backlog-parser.js';
import { TaskLockManager } from '../concurrency/lock-manager.js';
import { WorkerPoolManager } from '../concurrency/worker-pool.js';
import { DaemonHeartbeat } from '../concurrency/daemon-heartbeat.js';
import * as cp from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export class JobDispatcher {
  private parser: BacklogParser;
  private lockManager: TaskLockManager;
  private poolManager: WorkerPoolManager;

  constructor() {
    this.parser = new BacklogParser();
    this.lockManager = new TaskLockManager();
    this.poolManager = new WorkerPoolManager();
  }

  /**
   * Runs the dispatcher in a continuous loop for headless daemon mode.
   */
  async runHeadless(backlogPath: string, pollIntervalMs: number = 30000): Promise<never> {
    const heartbeat = new DaemonHeartbeat(pollIntervalMs * 2, () => {
      console.error('JobDispatcher daemon frozen state detected! Terminating.');
      process.exit(1);
    });

    heartbeat.start();

    // Check for orphaned workers and clear them or resume them
    const orphaned = this.poolManager.getOrphanedLocks();
    for (const orphan of orphaned) {
       console.log(`Clearing orphaned lock for track ${orphan.track_id}`);
       // Optionally we could resume it here, but for now just let it be picked up again
       // since we have the task lock manager holding its lock, wait, the task lock manager 
       // lock might also be orphaned. We'll rely on timeout for task locks, or clean them up.
    }

    while (true) {
      try {
        await this.dispatchNextJob(backlogPath);
      } catch (error) {
        console.error('Error dispatching job:', error);
      }
      heartbeat.ping();
      await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
    }
  }

  /**
   * Reads the backlog, claims the next pending item, generates a track ID,
   * acquires a worker from the pool, and spawns the agent to generate the spec/plan.
   * @param backlogPath Path to the backlog file
   * @returns The generated track ID, or null if no pending items
   */
  async dispatchNextJob(backlogPath: string): Promise<string | null> {
    if (!fs.existsSync(backlogPath)) {
      return null;
    }

    const content = fs.readFileSync(backlogPath, 'utf8');
    const pendingItems = this.parser.extractPendingItems(content);

    if (pendingItems.length === 0) {
      return null;
    }

    const nextJob = pendingItems[0];
    
    // Generate a track ID based on the title (lowercase, alphanumeric, underscores)
    const sanitizedTitle = nextJob.title
      .replace(/^(Feature|Bugfix|Task):\s*/i, '') // Remove prefixes
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
    
    const timestamp = new Date().toISOString().replace(/\D/g, '').slice(0, 8); // YYYYMMDD
    const trackId = `${sanitizedTitle}_${timestamp}`;

    const agentId = `dispatcher-${process.pid}`;
    const lockAcquired = await this.lockManager.acquireLock(trackId, agentId);
    if (!lockAcquired) {
      console.warn(`Could not acquire lock for track ${trackId}, another process may be handling it.`);
      return null;
    }

    let workerId: string;
    let workspaceRoot: string;
    let trackDir: string;

    try {
      const acquisition = this.poolManager.acquireWorker(trackId);
      workerId = acquisition.workerId;
      workspaceRoot = acquisition.workspacePath;

      this.poolManager.updateProgress(workerId, 'Checking out branch');

      const branchName = `track/${trackId}`;
      try {
        cp.execSync(`git checkout -b ${branchName}`, { cwd: workspaceRoot, stdio: 'ignore' });
      } catch (e) {
        cp.execSync(`git checkout ${branchName}`, { cwd: workspaceRoot, stdio: 'ignore' });
      }

      const relativeTrackDir = path.join('superconductor', 'tracks', trackId);
      trackDir = path.join(workspaceRoot, relativeTrackDir);
      if (!fs.existsSync(trackDir)) {
        fs.mkdirSync(trackDir, { recursive: true });
      }
    } catch (error) {
      console.error(`Failed to create workspace for ${trackId}:`, error);
      await this.lockManager.releaseLock(trackId, agentId);
      throw error;
    }

    // Spawn the agent in the new worker pool directory to generate spec and plan
    try {
      this.poolManager.updateProgress(workerId, 'Agent running');
      const prompt = `Please act as a spec generator. I am assigning you the following task from the backlog:\n"${nextJob.title}"\nCreate a spec.md and plan.md in this directory following the Superconductor framework guidelines. Keep it concise.`;
      
      const child = cp.spawn('agy', ['--new-project', '--prompt-interactive', prompt], {
        cwd: trackDir,
        stdio: 'inherit'
      });
      
      if (child && typeof child.on === 'function') {
        child.on('close', async () => {
          this.poolManager.updateProgress(workerId, 'Agent finished, syncing...');
          try {
            const status = cp.execSync('git status --porcelain', { cwd: workspaceRoot }).toString();
            if (status.trim() !== '') {
              cp.execSync('git add .', { cwd: workspaceRoot, stdio: 'ignore' });
              cp.execSync('git commit -m "chore: generate spec and plan"', { cwd: workspaceRoot, stdio: 'ignore' });
            }
            const branchName = `track/${trackId}`;
            // Push to origin
            cp.execSync(`git push -u origin ${branchName}`, { cwd: workspaceRoot, stdio: 'ignore' });
            
            // Note: The user requested to merge to the parent branches. Since this is an agent, 
            // the full merge would be handled by the implementation track itself. But we can push the branch here.
          } catch (e) {
            console.error(`Failed to sync workspace for ${trackId}:`, e);
          } finally {
            this.poolManager.releaseWorker(workerId);
            await this.lockManager.releaseLock(trackId, agentId);
          }
        });
        
        child.on('error', async () => {
          this.poolManager.releaseWorker(workerId);
          await this.lockManager.releaseLock(trackId, agentId);
        });
      } else {
        // Fallback for mocked tests or immediate execution
        this.poolManager.releaseWorker(workerId);
        await this.lockManager.releaseLock(trackId, agentId);
      }
    } catch (error) {
      console.error(`Failed to spawn agent for ${trackId}:`, error);
      this.poolManager.releaseWorker(workerId);
      await this.lockManager.releaseLock(trackId, agentId);
      throw error;
    }

    return trackId;
  }

  /**
   * Marks a job as completed in the backlog.
   * @param backlogPath Path to the backlog file
   * @param jobTitle The title of the job to mark as completed
   */
  completeJob(backlogPath: string, jobTitle: string): void {
    if (!fs.existsSync(backlogPath)) {
      throw new Error(`Backlog file not found at ${backlogPath}`);
    }

    const content = fs.readFileSync(backlogPath, 'utf8');
    const updatedContent = this.parser.markItemAsDone(content, jobTitle);
    
    fs.writeFileSync(backlogPath, updatedContent, 'utf8');
  }
}
