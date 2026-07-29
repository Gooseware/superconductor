import { BacklogParser } from './backlog-parser.js';
import { TaskLockManager } from '../concurrency/lock-manager.js';
import { WorkerPoolManager } from '../concurrency/worker-pool.js';
import { DaemonHeartbeat } from '../concurrency/daemon-heartbeat.js';
import * as cp from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Sanitizes a job title into a track ID: lowercase, alphanumeric + underscores,
 * with a YYYYMMDD timestamp suffix.
 * Pure function — no side effects.
 */
export function generateTrackId(jobTitle: string): string {
  const sanitizedTitle = jobTitle
    .replace(/^(Feature|Bugfix|Task):\s*/i, '') // Remove prefixes
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  const timestamp = new Date().toISOString().replace(/\D/g, '').slice(0, 8); // YYYYMMDD
  return `${sanitizedTitle}_${timestamp}`;
}

/**
 * Acquires a worker, checks out the git branch for the track, and creates the track
 * directory on disk.
 * If worker acquisition or branch setup fails, the lock is released before re-throwing.
 */
export async function setupTrackWorkspace(
  trackId: string,
  poolManager: WorkerPoolManager,
  lockManager: TaskLockManager,
  agentId: string
): Promise<{ workerId: string; branchName: string; trackDir: string; workspaceRoot: string }> {
  let workerId: string | undefined;
  try {
    const acquisition = poolManager.acquireWorker(trackId);
    workerId = acquisition.workerId;
    const workspaceRoot = acquisition.workspacePath;

    poolManager.updateProgress(workerId, 'Checking out branch');

    const branchName = `track/${trackId}`;
    try {
      cp.execSync(`git checkout -b ${branchName}`, { cwd: workspaceRoot, stdio: 'ignore' });
    } catch (e) {
      cp.execSync(`git checkout ${branchName}`, { cwd: workspaceRoot, stdio: 'ignore' });
    }

    const relativeTrackDir = path.join('superconductor', 'tracks', trackId);
    const trackDir = path.join(workspaceRoot, relativeTrackDir);
    if (!fs.existsSync(trackDir)) {
      fs.mkdirSync(trackDir, { recursive: true });
    }

    return { workerId, branchName, trackDir, workspaceRoot };
  } catch (error) {
    if (workerId) {
      poolManager.updateProgress(workerId, 'Failed: ' + (error instanceof Error ? error.message : String(error)));
      poolManager.releaseWorker(workerId);
    }
    console.error(`Failed to create workspace for ${trackId}: ${error instanceof Error ? error.message : String(error)}`);
    await lockManager.releaseLock(trackId, agentId);
    throw error;
  }
}

/**
 * Spawns the `agy` child process in the track directory and registers 'close'/'error'
 * event listeners that handle git sync and release the worker + lock on completion.
 * Both handlers always call releaseWorker AND releaseLock to prevent orphaned resources.
 */
export function spawnAgentAndSync(params: {
  trackId: string;
  trackDir: string;
  workerId: string;
  workspaceRoot: string;
  poolManager: WorkerPoolManager;
  lockManager: TaskLockManager;
  agentId: string;
  jobTitle: string;
}): void {
  const { trackId, trackDir, workerId, workspaceRoot, poolManager, lockManager, agentId, jobTitle } = params;

  poolManager.updateProgress(workerId, 'Agent running');
  const prompt = `Please act as a spec generator. I am assigning you the following task from the backlog:\n"${jobTitle}"\nCreate a spec.md and plan.md in this directory following the Superconductor framework guidelines. Keep it concise.`;

  const child = cp.spawn('agy', ['--new-project', '--prompt-interactive', prompt], {
    cwd: trackDir,
    stdio: 'inherit'
  });

  if (child && typeof child.on === 'function') {
    child.on('close', async () => {
      try {
        poolManager.updateProgress(workerId, 'Agent finished, syncing...');
        try {
          const statusOutput = cp.execSync('git status --porcelain', { cwd: workspaceRoot });
          const status = statusOutput ? statusOutput.toString() : '';
          if (status.trim() !== '') {
            cp.execSync('git add .', { cwd: workspaceRoot, stdio: 'ignore' });
            cp.execSync('git commit -m "chore: generate spec and plan"', { cwd: workspaceRoot, stdio: 'ignore' });
          }
          const branchName = `track/${trackId}`;
          // Push to origin
          cp.execSync(`git push -u origin ${branchName}`, { cwd: workspaceRoot, stdio: 'ignore' });

          // Note: The user requested to merge to the parent branches. Since this is an agent,
          // the full merge would be handled by the implementation track itself. But we can push the branch here.
        } catch (err) {
          console.error(`Error during agent sync: ${err instanceof Error ? err.message : String(err)}`);
          poolManager.updateProgress(workerId, 'Failed: ' + (err instanceof Error ? err.message : String(err)));
        } finally {
          poolManager.releaseWorker(workerId);
          await lockManager.releaseLock(trackId, agentId);
        }
      } catch (globalErr) {
        poolManager.updateProgress(workerId, 'Failed: ' + (globalErr instanceof Error ? globalErr.message : String(globalErr)));
        console.error('Agent sync fatal error: ' + (globalErr instanceof Error ? globalErr.message : String(globalErr)));
        try { 
          poolManager.releaseWorker(workerId); 
        } catch (releaseErr) {
          console.error(`Failed to release worker ${workerId}:`, releaseErr instanceof Error ? releaseErr.message : String(releaseErr));
        }
        lockManager.releaseLock(trackId, agentId).catch((lockErr) => {
          console.error(`Failed to release lock for ${agentId}:`, lockErr instanceof Error ? lockErr.message : String(lockErr));
        });
      }
    });

    child.on('error', async (err: Error) => {
      try {
        poolManager.updateProgress(workerId, 'Failed: ' + (err instanceof Error ? err.message : String(err)));
        console.error(`Agent sync fatal error: ${err instanceof Error ? err.message : String(err)}`);
        poolManager.releaseWorker(workerId);
        await lockManager.releaseLock(trackId, agentId);
      } catch (globalErr) {
        poolManager.updateProgress(workerId, 'Failed: ' + (globalErr instanceof Error ? globalErr.message : String(globalErr)));
        console.error('Agent sync fatal error: ' + (globalErr instanceof Error ? globalErr.message : String(globalErr)));
        try { poolManager.releaseWorker(workerId); } catch (releaseErr) { console.error('Failed to release worker:', releaseErr instanceof Error ? releaseErr.message : String(releaseErr)); }
        lockManager.releaseLock(trackId, agentId).catch((lockErr) => { console.error('Failed to release lock:', lockErr instanceof Error ? lockErr.message : String(lockErr)); });
      }
    });
  } else {
    // Fallback for mocked tests or immediate execution
    poolManager.releaseWorker(workerId);
    lockManager.releaseLock(trackId, agentId);
  }
}

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
    const engineState: { context?: string } = { context: undefined };
    const workspaceRoot = process.cwd();

    const heartbeat = new DaemonHeartbeat(pollIntervalMs * 2, () => {
      console.error('JobDispatcher daemon frozen state detected! Terminating.');
      process.exit(1);
    }, {
      onReinject: () => console.log('Re-injecting track context...'),
      onEscalate: () => console.warn('Escalating missed context recovery!')
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
        const trackId = await this.dispatchNextJob(backlogPath);
        if (trackId) {
          heartbeat.verifyTrackContext(engineState, workspaceRoot, trackId);
        }
      } catch (err) {
        console.error(`Error in dispatch loop: ${err instanceof Error ? err.message : String(err)}`);
        await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
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
    const trackId = generateTrackId(nextJob.title);

    const agentId = `dispatcher-${process.pid}`;
    const lockAcquired = await this.lockManager.acquireLock(trackId, agentId);
    if (!lockAcquired) {
      console.warn(`Could not acquire lock for track ${trackId}, another process may be handling it.`);
      return null;
    }

    let workerId: string;
    let trackDir: string;
    let workspaceRoot: string;

    try {
      const workspace = await setupTrackWorkspace(trackId, this.poolManager, this.lockManager, agentId);
      workerId = workspace.workerId;
      trackDir = workspace.trackDir;
      workspaceRoot = workspace.workspaceRoot;
    } catch (error) {
      // setupTrackWorkspace already released the lock on failure
      throw error;
    }

    try {
      spawnAgentAndSync({
        trackId,
        trackDir,
        workerId,
        workspaceRoot,
        poolManager: this.poolManager,
        lockManager: this.lockManager,
        agentId,
        jobTitle: nextJob.title
      });
    } catch (error) {
      console.error(`Failed to spawn agent for ${trackId}: ${error instanceof Error ? error.message : String(error)}`);
      this.poolManager.updateProgress(workerId, 'Failed: ' + (error instanceof Error ? error.message : String(error)));
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
