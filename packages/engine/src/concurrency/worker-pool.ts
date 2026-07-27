import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFileSync } from 'child_process';

export interface WorkerLockPayload {
  track_id: string;
  pid: number;
  timestamp: string;
  progress: string;
}

export interface WorkerAcquisition {
  workerId: string;
  workspacePath: string;
}

export class WorkerPoolManager {
  private workspacesDir: string;
  private originRepo: string;

  constructor(originRepo: string = process.cwd(), workspacesDir?: string) {
    this.originRepo = originRepo;
    if (workspacesDir) {
      this.workspacesDir = path.resolve(process.cwd(), workspacesDir);
    } else {
      this.workspacesDir = path.join(os.homedir(), '.gemini', 'superconductor', 'workspaces');
    }

    if (!fs.existsSync(this.workspacesDir)) {
      fs.mkdirSync(this.workspacesDir, { recursive: true });
    }
  }

  private getLockFilePath(workerId: string): string {
    const safeWorkerId = workerId.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(this.workspacesDir, `${safeWorkerId}.lock`);
  }

  public getWorkspacePath(workerId: string): string {
    const safeWorkerId = workerId.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(this.workspacesDir, safeWorkerId);
  }

  // Detect if a lock is orphaned
  public isOrphaned(lockPath: string): boolean {
    if (!fs.existsSync(lockPath)) return false;
    try {
      const data = fs.readFileSync(lockPath, 'utf8');
      const payload: WorkerLockPayload = JSON.parse(data);
      // Check if the process is still running
      try {
        process.kill(payload.pid, 0); // throws error if process does not exist
        return false;
      } catch (e) {
        return true;
      }
    } catch (e) {
      // Corrupt lockfile is treated as orphaned
      return true;
    }
  }

  public getOrphanedLocks(): WorkerLockPayload[] {
    const orphaned: WorkerLockPayload[] = [];
    const files = fs.readdirSync(this.workspacesDir);
    for (const file of files) {
      if (file.endsWith('.lock')) {
        const lockPath = path.join(this.workspacesDir, file);
        if (this.isOrphaned(lockPath)) {
           try {
              const data = fs.readFileSync(lockPath, 'utf8');
              orphaned.push(JSON.parse(data));
           } catch(e) {}
        }
      }
    }
    return orphaned;
  }

  public clearOrphanedLock(workerId: string): void {
    const lockPath = this.getLockFilePath(workerId);
    if (this.isOrphaned(lockPath)) {
      fs.unlinkSync(lockPath);
    }
  }

  public acquireWorker(trackId: string): WorkerAcquisition {
    const maxWorkers = 100; // reasonable limit
    let assignedWorker: string | null = null;

    for (let i = 0; i < maxWorkers; i++) {
      const workerId = `worker_${i}`;
      const lockPath = this.getLockFilePath(workerId);

      if (fs.existsSync(lockPath)) {
        if (this.isOrphaned(lockPath)) {
          this.clearOrphanedLock(workerId);
        } else {
          continue; // Currently in use
        }
      }

      // Found a free worker
      assignedWorker = workerId;
      const payload: WorkerLockPayload = {
        track_id: trackId,
        pid: process.pid,
        timestamp: new Date().toISOString(),
        progress: 'Initialized'
      };
      fs.writeFileSync(lockPath, JSON.stringify(payload, null, 2), 'utf8');
      break;
    }

    if (!assignedWorker) {
      throw new Error('Could not acquire a worker, pool exhausted.');
    }

    const workspacePath = this.getWorkspacePath(assignedWorker);
    
    // Dynamically provision if it doesn't exist
    if (!fs.existsSync(workspacePath)) {
      execFileSync('git', ['clone', this.originRepo, workspacePath], { stdio: 'ignore', timeout: 30000 });
    } else {
      this.syncAndCleanWorkspace(assignedWorker);
    }

    return { workerId: assignedWorker, workspacePath };
  }

  public updateProgress(workerId: string, progress: string): void {
    const lockPath = this.getLockFilePath(workerId);
    if (fs.existsSync(lockPath)) {
      try {
        const data = fs.readFileSync(lockPath, 'utf8');
        const payload: WorkerLockPayload = JSON.parse(data);
        payload.progress = progress;
        payload.timestamp = new Date().toISOString();
        fs.writeFileSync(lockPath, JSON.stringify(payload, null, 2), 'utf8');
      } catch (e) {
        console.error(`Failed to update progress for ${workerId}`);
      }
    }
  }

  public releaseWorker(workerId: string): void {
    const lockPath = this.getLockFilePath(workerId);
    if (fs.existsSync(lockPath)) {
      fs.unlinkSync(lockPath);
    }
  }

  public syncAndCleanWorkspace(workerId: string): void {
    const workspacePath = this.getWorkspacePath(workerId);
    if (!fs.existsSync(workspacePath)) return;

    try {
      execFileSync('git', ['fetch', 'origin'], { cwd: workspacePath, stdio: 'ignore', timeout: 30000 });
      execFileSync('git', ['reset', '--hard', 'origin/main'], { cwd: workspacePath, stdio: 'ignore' });
      execFileSync('git', ['clean', '-fdx'], { cwd: workspacePath, stdio: 'ignore' });
    } catch (e) {
      console.warn(`Failed to sync and clean workspace ${workerId}, falling back to fresh clone:`, e);
      // Fallback: delete and re-clone
      fs.rmSync(workspacePath, { recursive: true, force: true });
      execFileSync('git', ['clone', this.originRepo, workspacePath], { stdio: 'ignore', timeout: 30000 });
    }
  }
}
